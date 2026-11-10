import { prisma } from "../utils/prisma";
import { MAX_UPLOAD_BYTES, resolveMaxFileSizeBytes } from "@repo/types";
export { MAX_UPLOAD_BYTES } from "@repo/types";

// Match the quota estimates displayed by the storage dashboard. Explicit quotas
// override these defaults; they must reflect the account's actual allowance.
const DEFAULT_QUOTA_GB: Record<string, number> = {
  s3: 5,
  supabase: 1,
  backblaze: 10,
  storj: 25,
  "cloudflare-r2": 10,
  "idrive-e2": 10,
  filebase: 5,
  "oracle-oci": 20,
};

export const resolveQuotaGb = (provider: string, quotaGb?: number) =>
  quotaGb ?? DEFAULT_QUOTA_GB[provider];

type Candidate = {
  id: string;
  providerName: string;
  config: unknown;
  fileObjects: {
    sizeBytes?: bigint | null;
    node: { sizeBytes: bigint } | null;
  }[];
  uploadSessions: { sizeBytes: bigint }[];
  uploadChunks?: { sizeBytes: bigint }[];
};

export function chooseUploadBucket<T extends Candidate>(
  buckets: T[],
  sizeBytes: number,
  error: (message: string, status: number) => Error,
): T {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw error("File size must be a non-negative integer.", 400);
  }
  if (sizeBytes > MAX_UPLOAD_BYTES)
    throw error("File too large. Max is 3 GB.", 413);
  if (!buckets.length) throw error("No active storage buckets available.", 503);

  const ranked = buckets.map((bucket) => {
    const config = bucket.config as {
      quotaGb?: number;
      maxFileSizeMb?: number;
    };
    // Trash still occupies storage. Pending uploads reserve their full size.
    const used =
      bucket.fileObjects.reduce(
        (sum, file) => sum + (file.sizeBytes ?? file.node?.sizeBytes ?? 0n),
        0n,
      ) +
      bucket.uploadSessions.reduce(
        (sum, session) => sum + session.sizeBytes,
        0n,
      ) +
      (bucket.uploadChunks ?? []).reduce(
        (sum, chunk) => sum + chunk.sizeBytes,
        0n,
      );
    const quotaGb = resolveQuotaGb(bucket.providerName, config.quotaGb);
    const quota =
      quotaGb === undefined
        ? undefined
        : BigInt(Math.floor(quotaGb * 1024 ** 3));
    const maxFile = resolveMaxFileSizeBytes(
      bucket.providerName,
      config.maxFileSizeMb,
    );
    return { bucket, used, quota, maxFile };
  });
  const sizeCompatible = ranked.filter((entry) => sizeBytes <= entry.maxFile);
  if (!sizeCompatible.length) {
    const maxMb = Math.max(...ranked.map((entry) => entry.maxFile)) / 1024 ** 2;
    throw error(
      `File exceeds every active bucket's per-file limit (largest: ${maxMb} MB).`,
      413,
    );
  }
  const eligible = sizeCompatible.filter(
    ({ quota, used }) =>
      quota === undefined || used + BigInt(sizeBytes) <= quota,
  );
  eligible.sort((a, b) =>
    a.used < b.used
      ? -1
      : a.used > b.used
        ? 1
        : a.bucket.id.localeCompare(b.bucket.id),
  );
  if (!eligible.length) {
    throw error(
      "No compatible storage bucket has enough remaining space for this file. Free space or add storage.",
      507,
    );
  }
  return eligible[0]!.bucket;
}

export async function reserveUpload(
  input: {
    userId: string;
    driveId: string;
    parentId?: string;
    fileName: string;
    mimeType?: string;
    sizeBytes: number;
    partSizeBytes: number;
    objectKey: string;
    distributed?: boolean;
  },
  error: (message: string, status: number) => Error,
) {
  return prisma.$transaction(async (tx) => {
    // Serialize admission across Workers, keeping provider I/O outside the lock.
    // Row locks are released automatically at transaction completion.
    await tx.$queryRaw`SELECT id FROM "Bucket" WHERE "isActive" = true AND "ownerId" = ${input.userId} ORDER BY id FOR UPDATE`;
    const buckets = await tx.bucket.findMany({
      where: { isActive: true, ownerId: input.userId },
      include: {
        fileObjects: {
          select: { sizeBytes: true, node: { select: { sizeBytes: true } } },
        },
        uploadSessions: {
          where: {
            status: { in: ["INITIATED", "UPLOADING", "COMPLETING"] },
            chunks: { none: {} },
          },
          select: { sizeBytes: true },
        },
        uploadChunks: {
          where: {
            session: {
              status: {
                in: [
                  "INITIATED",
                  "UPLOADING",
                  "COMPLETING",
                  "ABORTING",
                  "FAILED",
                ],
              },
            },
          },
          select: { sizeBytes: true },
        },
      },
    });
    const { distributed, ...data } = input;
    if (distributed) {
      const plan = planUploadChunks(
        buckets,
        input.sizeBytes,
        input.partSizeBytes,
        error,
      );
      return tx.uploadSession.create({
        data: {
          ...data,
          partSizeBytes: plan.partSizeBytes,
          sizeBytes: BigInt(input.sizeBytes),
          bucketId: plan.chunks[0]!.bucketId,
          uploadId: "",
          status: "INITIATED",
          chunks: {
            create: plan.chunks.map((chunk) => ({
              ...chunk,
              sizeBytes: BigInt(chunk.sizeBytes),
              objectKey: `${input.objectKey}/chunk-${chunk.partNumber}`,
            })),
          },
        },
        include: {
          bucket: true,
          chunks: { include: { bucket: true }, orderBy: { partNumber: "asc" } },
        },
      });
    }
    const bucket = chooseUploadBucket(buckets, input.sizeBytes, error);
    return tx.uploadSession.create({
      data: {
        ...data,
        sizeBytes: BigInt(input.sizeBytes),
        bucketId: bucket.id,
        uploadId: "",
        status: "INITIATED",
      },
      include: {
        bucket: true,
        chunks: { include: { bucket: true }, orderBy: { partNumber: "asc" } },
      },
    });
  });
}

// Fixed-size standalone objects let the existing browser slicer upload directly.
// Rank by remaining capacity, taking both committed bytes and reservations into account.
export function planUploadChunks(
  buckets: Candidate[],
  size: number,
  target: number,
  error: (message: string, status: number) => Error,
) {
  if (!Number.isSafeInteger(size) || size <= 0)
    throw error("File size must be a positive integer.", 400);
  if (size > MAX_UPLOAD_BYTES) throw error("File too large. Max is 3 GB.", 413);
  if (!buckets.length) throw error("No active storage buckets available.", 503);
  const ranked = buckets.map((b) => {
    const config = b.config as { quotaGb?: number; maxFileSizeMb?: number };
    const used =
      b.fileObjects.reduce(
        (n, f) => n + Number(f.sizeBytes ?? f.node?.sizeBytes ?? 0n),
        0,
      ) +
      b.uploadSessions.reduce((n, s) => n + Number(s.sizeBytes), 0) +
      (b.uploadChunks ?? []).reduce((n, c) => n + Number(c.sizeBytes), 0);
    const quota = resolveQuotaGb(b.providerName, config.quotaGb);
    return {
      id: b.id,
      free: Math.max(
        0,
        (quota === undefined
          ? MAX_UPLOAD_BYTES
          : Math.floor(quota * 1024 ** 3)) - used,
      ),
      max: resolveMaxFileSizeBytes(b.providerName, config.maxFileSizeMb),
    };
  });
  // Reduce the fixed slice size when small buckets or object limits require it.
  let partSizeBytes = Math.min(target, size);
  while (partSizeBytes >= Math.ceil(size / 10_000)) {
    const available = ranked.map((b) => ({ ...b }));
    const chunks: {
      bucketId: string;
      partNumber: number;
      sizeBytes: number;
    }[] = [];
    let offset = 0;
    while (offset < size) {
      const bytes = Math.min(partSizeBytes, size - offset);
      available.sort((a, b) => b.free - a.free || a.id.localeCompare(b.id));
      const b = available.find((b) => b.free >= bytes && b.max >= bytes);
      if (!b) break;
      chunks.push({
        bucketId: b.id,
        partNumber: chunks.length + 1,
        sizeBytes: bytes,
      });
      b.free -= bytes;
      offset += bytes;
    }
    if (offset === size) return { partSizeBytes, chunks };
    partSizeBytes = Math.floor(partSizeBytes / 2);
  }
  throw error(
    "Not enough compatible bucket capacity to distribute this file. Free space or add storage.",
    507,
  );
}
