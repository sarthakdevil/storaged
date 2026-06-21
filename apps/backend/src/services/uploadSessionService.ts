import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../utils/prisma";
import { createS3Client } from "../utils/s3";

class UploadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "UploadError";
    this.statusCode = statusCode;
  }
}

export const isUploadError = (error: unknown): error is UploadError => error instanceof UploadError;

type BucketConfig = {
  endpointUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

const getBucketConfig = (config: Prisma.JsonValue): BucketConfig => {
  const c = config as Record<string, unknown>;
  return {
    endpointUrl: c.endpointUrl as string,
    region: c.region as string,
    accessKeyId: c.accessKeyId as string,
    secretAccessKey: c.secretAccessKey as string,
    forcePathStyle: c.forcePathStyle as boolean,
  };
};

const selectLeastUsedBucket = async () => {
  const buckets = await prisma.bucket.findMany({
    where: { isActive: true },
    include: {
      fileObjects: {
        include: { node: { select: { sizeBytes: true } } },
      },
    },
  });

  if (buckets.length === 0) {
    throw new UploadError("No active storage buckets available.", 503);
  }

  return buckets
    .map((bucket) => ({
      bucket,
      usedBytes: bucket.fileObjects.reduce(
        (sum, fo) => sum + (fo.node?.sizeBytes ?? 0n),
        0n,
      ),
    }))
    .sort((a, b) => (a.usedBytes < b.usedBytes ? -1 : a.usedBytes > b.usedBytes ? 1 : 0))[0]
    .bucket;
};

const sanitizeFileName = (originalName: string) => {
  const trimmed = originalName.trim();
  if (!trimmed) throw new UploadError("File name is required.", 400);
  return trimmed.replace(/[^\w.\-]/g, "_");
};

const choosePartSizeBytes = (sizeBytes: number) => {
  // S3 multipart: all parts (except last) must be >= 5MB; max 10,000 parts.
  // 3GB target: 32MB => ~96 parts.
  const mb = 1024 * 1024;
  const min = 5 * mb;

  let partSize = 8 * mb;
  if (sizeBytes > 512 * mb) partSize = 16 * mb;
  if (sizeBytes > 1024 * mb) partSize = 32 * mb;

  const maxParts = 10_000;
  const minPartSizeForCount = Math.ceil(sizeBytes / maxParts);
  partSize = Math.max(partSize, min, minPartSizeForCount);

  // Round up to nearest MB to keep it neat.
  partSize = Math.ceil(partSize / mb) * mb;

  return partSize;
};

const getS3ErrorCode = (error: unknown) => {
  if (error instanceof S3ServiceException) {
    return error.name;
  }

  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : undefined;
  }

  return undefined;
};

const describeS3Failure = (error: unknown) => {
  const code = getS3ErrorCode(error);
  const message = error instanceof Error ? error.message : "Storage request failed.";
  return [code, message].filter(Boolean).join(": ");
};

export const initiateMultipartUpload = async ({
  userId,
  driveId,
  parentId,
  fileName,
  mimeType,
  sizeBytes,
}: {
  userId: string;
  driveId?: string;
  parentId?: string;
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
}) => {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new UploadError("sizeBytes must be a positive number.", 400);
  }

  // 3GB target — keep a server-side guardrail.
  const maxSize = 3 * 1024 * 1024 * 1024;
  if (sizeBytes > maxSize) {
    throw new UploadError("File too large. Max is 3GB.", 413);
  }

  const drive = await prisma.drive.findFirst({
    where: driveId ? { id: driveId, ownerId: userId } : { ownerId: userId },
  });

  if (!drive) {
    throw new UploadError("Drive not found.", 404);
  }

  const safeName = sanitizeFileName(fileName);

  let parentPath = "";
  if (parentId) {
    const parentNode = await prisma.node.findFirst({
      where: { id: parentId, driveId: drive.id, type: "FOLDER", isDeleted: false },
      select: { path: true },
    });
    if (!parentNode) {
      throw new UploadError("Parent folder not found.", 404);
    }
    parentPath = parentNode.path;
  }

  const filePath = `${parentPath}/${safeName}`;

  const existing = await prisma.node.findUnique({
    where: { driveId_path: { driveId: drive.id, path: filePath } },
  });

  if (existing && !existing.isDeleted) {
    throw new UploadError("A file already exists at this path.", 409);
  }

  const bucket = await selectLeastUsedBucket();
  const objectKey = `${userId}/${drive.id}/${Date.now()}_${safeName}`;
  const partSizeBytes = choosePartSizeBytes(sizeBytes);

  const s3Client = createS3Client(getBucketConfig(bucket.config));

  let uploadId: string;
  try {
    const result = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket.bucketName,
        Key: objectKey,
        ContentType: mimeType || undefined,
      }),
    );

    if (!result.UploadId) {
      throw new UploadError("Failed to initiate multipart upload.", 502);
    }

    uploadId = result.UploadId;
  } catch (error) {
    throw new UploadError(describeS3Failure(error), 502);
  }

  const session = await prisma.uploadSession.create({
    data: {
      userId,
      driveId: drive.id,
      parentId: parentId ?? null,
      fileName: safeName,
      mimeType: mimeType ?? null,
      sizeBytes: BigInt(sizeBytes),
      partSizeBytes,
      bucketId: bucket.id,
      objectKey,
      uploadId,
      status: "INITIATED",
    },
    select: {
      id: true,
      uploadId: true,
      objectKey: true,
      partSizeBytes: true,
      bucket: { select: { bucketName: true } },
    },
  });

  return {
    uploadSessionId: session.id,
    uploadId: session.uploadId,
    objectKey: session.objectKey,
    bucketName: session.bucket.bucketName,
    partSizeBytes: session.partSizeBytes,
  };
};

export const getUploadSessionStatus = async ({
  userId,
  uploadSessionId,
}: {
  userId: string;
  uploadSessionId: string;
}) => {
  const session = await prisma.uploadSession.findFirst({
    where: { id: uploadSessionId, userId },
    select: {
      id: true,
      status: true,
      fileName: true,
      sizeBytes: true,
      partSizeBytes: true,
      errorMessage: true,
      nodeId: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
    },
  });

  if (!session) throw new UploadError("Upload session not found.", 404);

  return {
    id: session.id,
    status: session.status,
    fileName: session.fileName,
    sizeBytes: session.sizeBytes.toString(),
    partSizeBytes: session.partSizeBytes,
    errorMessage: session.errorMessage,
    nodeId: session.nodeId,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
  };
};

export const getUploadPartUrl = async ({
  userId,
  uploadSessionId,
  partNumber,
  expiresInSeconds = 60 * 15,
}: {
  userId: string;
  uploadSessionId: string;
  partNumber: number;
  expiresInSeconds?: number;
}) => {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    throw new UploadError("partNumber must be an integer between 1 and 10000.", 400);
  }

  const session = await prisma.uploadSession.findFirst({
    where: { id: uploadSessionId, userId },
    include: { bucket: true },
  });

  if (!session) throw new UploadError("Upload session not found.", 404);

  if (session.status === "ABORTED" || session.status === "FAILED" || session.status === "COMPLETED") {
    throw new UploadError(`Cannot upload parts in status ${session.status}.`, 409);
  }

  const s3Client = createS3Client(getBucketConfig(session.bucket.config));

  const command = new UploadPartCommand({
    Bucket: session.bucket.bucketName,
    Key: session.objectKey,
    UploadId: session.uploadId,
    PartNumber: partNumber,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });

  if (session.status === "INITIATED") {
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "UPLOADING" },
    });
  }

  return { url, expiresInSeconds };
};

export const listUploadedParts = async ({
  userId,
  uploadSessionId,
}: {
  userId: string;
  uploadSessionId: string;
}) => {
  const session = await prisma.uploadSession.findFirst({
    where: { id: uploadSessionId, userId },
    include: { bucket: true },
  });

  if (!session) throw new UploadError("Upload session not found.", 404);

  const s3Client = createS3Client(getBucketConfig(session.bucket.config));

  try {
    const result = await s3Client.send(
      new ListPartsCommand({
        Bucket: session.bucket.bucketName,
        Key: session.objectKey,
        UploadId: session.uploadId,
      }),
    );

    const parts = (result.Parts ?? []).map((p) => ({
      partNumber: p.PartNumber ?? 0,
      etag: p.ETag ?? "",
      size: p.Size ?? 0,
      lastModified: p.LastModified?.toISOString() ?? null,
    })).filter((p) => p.partNumber > 0);

    return { parts };
  } catch (error) {
    throw new UploadError(describeS3Failure(error), 502);
  }
};

export const requestUploadCompletion = async ({
  userId,
  uploadSessionId,
  parts,
}: {
  userId: string;
  uploadSessionId: string;
  parts: { partNumber: number; etag: string }[];
}) => {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new UploadError("parts must be a non-empty array.", 400);
  }

  const normalized = parts
    .map((p) => ({
      partNumber: Number(p.partNumber),
      etag: String(p.etag),
    }))
    .filter((p) => Number.isInteger(p.partNumber) && p.partNumber > 0 && p.partNumber <= 10_000 && p.etag.trim());

  if (normalized.length !== parts.length) {
    throw new UploadError("Invalid parts payload.", 400);
  }

  const session = await prisma.uploadSession.findFirst({
    where: { id: uploadSessionId, userId },
    select: { id: true, status: true },
  });

  if (!session) throw new UploadError("Upload session not found.", 404);

  if (session.status === "ABORTED" || session.status === "FAILED" || session.status === "COMPLETED") {
    throw new UploadError(`Cannot complete upload in status ${session.status}.`, 409);
  }

  await prisma.uploadSession.update({
    where: { id: session.id },
    data: {
      status: "COMPLETING",
      completedParts: normalized as unknown as Prisma.InputJsonValue,
    },
  });

  return { accepted: true };
};

export const abortUpload = async ({
  userId,
  uploadSessionId,
}: {
  userId: string;
  uploadSessionId: string;
}) => {
  const session = await prisma.uploadSession.findFirst({
    where: { id: uploadSessionId, userId },
    include: { bucket: true },
  });

  if (!session) throw new UploadError("Upload session not found.", 404);

  if (session.status === "COMPLETED") {
    throw new UploadError("Upload is already completed.", 409);
  }

  const s3Client = createS3Client(getBucketConfig(session.bucket.config));

  try {
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: session.bucket.bucketName,
        Key: session.objectKey,
        UploadId: session.uploadId,
      }),
    );
  } catch (error) {
    // Best-effort abort; still mark aborted.
    const msg = describeS3Failure(error);
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "ABORTED", errorMessage: msg },
    });
    return { aborted: true, warning: msg };
  }

  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { status: "ABORTED", completedParts: Prisma.DbNull },
  });

  return { aborted: true };
};

export const finalizeUploadNow = async ({
  uploadSessionId,
}: {
  uploadSessionId: string;
}) => {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadSessionId },
    include: { bucket: true, drive: true },
  });

  if (!session) throw new UploadError("Upload session not found.", 404);

  if (session.status !== "COMPLETING") {
    throw new UploadError(`Cannot finalize upload in status ${session.status}.`, 409);
  }

  const parts = session.completedParts as unknown as { partNumber: number; etag: string }[] | null;
  if (!parts || parts.length === 0) {
    throw new UploadError("No completion parts stored for this upload.", 400);
  }

  const s3Client = createS3Client(getBucketConfig(session.bucket.config));

  try {
    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: session.bucket.bucketName,
        Key: session.objectKey,
        UploadId: session.uploadId,
        MultipartUpload: {
          Parts: parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  } catch (error) {
    const msg = describeS3Failure(error);
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "FAILED", errorMessage: msg },
    });
    throw new UploadError(msg, 502);
  }

  // Create node + file object (same semantics as old uploadFile, but bytes are already in storage).
  const safeName = session.fileName;
  let parentPath = "";
  if (session.parentId) {
    const parentNode = await prisma.node.findFirst({
      where: { id: session.parentId, driveId: session.driveId, type: "FOLDER", isDeleted: false },
      select: { path: true },
    });

    if (!parentNode) {
      await prisma.uploadSession.update({
        where: { id: session.id },
        data: { status: "FAILED", errorMessage: "Parent folder not found during finalize." },
      });
      throw new UploadError("Parent folder not found.", 404);
    }

    parentPath = parentNode.path;
  }

  const filePath = `${parentPath}/${safeName}`;

  const sizeBigInt = session.sizeBytes;

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const node = await tx.node.create({
        data: {
          driveId: session.driveId,
          parentId: session.parentId ?? null,
          type: "FILE",
          name: safeName,
          path: filePath,
          sizeBytes: sizeBigInt,
          mimeType: session.mimeType ?? undefined,
          createdById: session.userId,
        },
      });

      await tx.fileObject.create({
        data: { nodeId: node.id, bucketId: session.bucketId, objectKey: session.objectKey },
      });

      await tx.drive.update({
        where: { id: session.driveId },
        data: { usedBytes: { increment: sizeBigInt } },
      });

      await tx.uploadSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED", completedAt: new Date(), nodeId: node.id },
      });

      return node;
    });
  } catch (error) {
    const message =
      error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002"
        ? "A file already exists at this path."
        : error instanceof Error
          ? error.message
          : "Finalize failed.";

    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "FAILED", errorMessage: message },
    });

    throw new UploadError(message, 409);
  }

  return {
    nodeId: result.id,
    completed: true,
  };
};
