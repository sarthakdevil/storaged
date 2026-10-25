import { prisma } from "../utils/prisma";
import { MAX_UPLOAD_BYTES, resolveMaxFileSizeBytes } from "@repo/types";
export { MAX_UPLOAD_BYTES } from "@repo/types";

// Match the quota estimates displayed by the storage dashboard. Explicit quotas
// override these defaults; they must reflect the account's actual allowance.
const DEFAULT_QUOTA_GB: Record<string, number> = {
  s3: 5, supabase: 1, backblaze: 10, storj: 25,
  "cloudflare-r2": 10, "idrive-e2": 10, filebase: 5, "oracle-oci": 20,
};

export const resolveQuotaGb = (provider: string, quotaGb?: number) =>
  quotaGb ?? DEFAULT_QUOTA_GB[provider];

type Candidate = {
  id: string;
  providerName: string;
  config: unknown;
  fileObjects: { node: { sizeBytes: bigint } | null }[];
  uploadSessions: { sizeBytes: bigint }[];
};

export function chooseUploadBucket<T extends Candidate>(
  buckets: T[], sizeBytes: number,
  error: (message: string, status: number) => Error,
): T {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw error("File size must be a non-negative integer.", 400);
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) throw error("File too large. Max is 3 GB.", 413);
  if (!buckets.length) throw error("No active storage buckets available.", 503);

  const ranked = buckets.map((bucket) => {
    const config = bucket.config as { quotaGb?: number; maxFileSizeMb?: number };
    // Trash still occupies storage. Pending uploads reserve their full size.
    const used = bucket.fileObjects.reduce((sum, file) => sum + (file.node?.sizeBytes ?? 0n), 0n)
      + bucket.uploadSessions.reduce((sum, session) => sum + session.sizeBytes, 0n);
    const quotaGb = resolveQuotaGb(bucket.providerName, config.quotaGb);
    const quota = quotaGb === undefined ? undefined : BigInt(Math.floor(quotaGb * 1024 ** 3));
    const maxFile = resolveMaxFileSizeBytes(bucket.providerName, config.maxFileSizeMb);
    return { bucket, used, quota, maxFile };
  });
  const sizeCompatible = ranked.filter((entry) => sizeBytes <= entry.maxFile);
  if (!sizeCompatible.length) {
    const maxMb = Math.max(...ranked.map((entry) => entry.maxFile)) / 1024 ** 2;
    throw error(`File exceeds every active bucket's per-file limit (largest: ${maxMb} MB).`, 413);
  }
  const eligible = sizeCompatible.filter(({ quota, used }) =>
    quota === undefined || used + BigInt(sizeBytes) <= quota);
  eligible.sort((a, b) => a.used < b.used ? -1 : a.used > b.used ? 1 : a.bucket.id.localeCompare(b.bucket.id));
  if (!eligible.length) {
    throw error("No compatible storage bucket has enough remaining space for this file. Free space or add storage.", 507);
  }
  return eligible[0]!.bucket;
}

export async function reserveUpload(
  input: { userId: string; driveId: string; parentId?: string; fileName: string;
    mimeType?: string; sizeBytes: number; partSizeBytes: number; objectKey: string },
  error: (message: string, status: number) => Error,
) {
  return prisma.$transaction(async (tx) => {
    // Serialize admission across Workers, keeping provider I/O outside the lock.
    // Row locks are released automatically at transaction completion.
    await tx.$queryRaw`SELECT id FROM "Bucket" WHERE "isActive" = true ORDER BY id FOR UPDATE`;
    const buckets = await tx.bucket.findMany({
      where: { isActive: true },
      include: {
        fileObjects: { select: { node: { select: { sizeBytes: true } } } },
        uploadSessions: {
          where: { status: { in: ["INITIATED", "UPLOADING", "COMPLETING"] } },
          select: { sizeBytes: true },
        },
      },
    });
    const bucket = chooseUploadBucket(buckets, input.sizeBytes, error);
    return tx.uploadSession.create({
      data: { ...input, sizeBytes: BigInt(input.sizeBytes), bucketId: bucket.id,
        uploadId: "", status: "INITIATED" },
      include: { bucket: true },
    });
  });
}
