import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../utils/prisma";
import { createS3Client } from "../utils/s3";
import {
  formatStorageSchemaError,
  getStorageConnectionSchema,
  StorageConnectionInput,
  StorageConnectionUpdateInput,
  StorageProvider,
} from "../utils/storageschemas";

type ProviderDefaults = {
  endpointUrl: string;
  region: string;
  forcePathStyle: boolean;
};

type StorageConnectionConfig = {
  provider: StorageProvider;
  endpointUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  projectRef?: string;
  accountId?: string;
  quotaGb?: number;
};

type StorageHealthStatus = "connected" | "limited" | "error" | "inactive";

type StorageListOptions = {
  limit?: number;
  cursor?: string;
};

class StorageError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "StorageError";
    this.statusCode = statusCode;
  }
}

const normalizeName = (value: string) => value.trim().toLowerCase() as StorageProvider;

const getProviderLabel = (provider: StorageProvider) => {
  switch (provider) {
    case "s3":
      return "AWS S3";
    case "supabase":
      return "Supabase Storage";
    case "backblaze":
      return "Backblaze B2";
    case "storj":
      return "Storj";
    case "cloudflare-r2":
      return "Cloudflare R2";
    default:
      return provider;
  }
};

const validateEndpointUrl = (endpointUrl: string) => {
  try {
    const u = new URL(endpointUrl);
    // Normalize to remove a trailing slash after the host or path while
    // preserving any meaningful path, query, or hash. This avoids
    // environments where `URL.toString()` may add an unwanted trailing slash.
    const pathname = u.pathname.replace(/\/$/, "");
    const normalized = u.origin + (pathname === "" ? "" : pathname) + (u.search || "") + (u.hash || "");
    return normalized;
  } catch {
    throw new StorageError("Provide a valid endpoint URL.", 400);
  }
};

const getProviderDefaults = (
  provider: StorageProvider,
  input: StorageConnectionInput,
): ProviderDefaults => {
  switch (provider) {
    case "s3": {
      return {
        endpointUrl:
          input.endpointUrl?.trim() ?? `https://s3.${input.region}.amazonaws.com`,
        region: input.region!,
        forcePathStyle: input.forcePathStyle ?? false,
      };
    }
    case "supabase": {
      return {
        endpointUrl:
          input.endpointUrl?.trim() ??
          `https://${input.projectRef?.trim()}.storage.supabase.co/storage/v1/s3`,
        region: input.region!,
        forcePathStyle: true,
      };
    }
    case "backblaze": {
      return {
        endpointUrl:
          input.endpointUrl?.trim() ?? `https://s3.${input.region}.backblazeb2.com`,
        region: input.region!,
        forcePathStyle: true,
      };
    }
    case "storj": {
      return {
        endpointUrl: input.endpointUrl?.trim() ?? "https://gateway.storjshare.io",
        region: input.region?.trim() ?? "us1",
        forcePathStyle: true,
      };
    }
    case "cloudflare-r2": {
      return {
        endpointUrl:
          input.endpointUrl?.trim() ??
          `https://${input.accountId?.trim()}.r2.cloudflarestorage.com`,
        region: input.region?.trim() ?? "auto",
        forcePathStyle: true,
      };
    }
  }
};

const parseStorageConnectionInput = (
  rawInput: unknown,
  fallbackProvider?: StorageProvider,
): StorageConnectionInput => {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new StorageError("Request body must be an object.", 400);
  }

  const input = rawInput as Record<string, unknown>;
  const providerValue = input.provider;
  const provider =
    typeof providerValue === "string" ? normalizeName(providerValue) : fallbackProvider;

  if (!provider) {
    throw new StorageError("Storage provider is required.", 400);
  }

  const schema = getStorageConnectionSchema(provider);

  if (!schema) {
    throw new StorageError("Unsupported storage provider.", 400);
  }

  const parsedInput = schema.safeParse({
    ...input,
    provider,
  });

  if (!parsedInput.success) {
    throw new StorageError(formatStorageSchemaError(parsedInput.error), 400);
  }

  return parsedInput.data;
};

const buildConnectionConfig = (
  input: StorageConnectionInput,
): StorageConnectionConfig => {
  const defaults = getProviderDefaults(input.provider, input);
  const forcePathStyle =
    input.provider === "s3" ? input.forcePathStyle ?? defaults.forcePathStyle : defaults.forcePathStyle;

  return {
    provider: input.provider,
    endpointUrl: validateEndpointUrl(defaults.endpointUrl),
    region: defaults.region,
    accessKeyId: input.accessKeyId.trim(),
    secretAccessKey: input.secretAccessKey.trim(),
    forcePathStyle,
    projectRef: input.projectRef?.trim() || undefined,
    accountId: input.accountId?.trim() || undefined,
    quotaGb: input.quotaGb || undefined,
  };
};

const sanitizeBucketConnection = (bucket: {
  id: string;
  providerName: string;
  displayName: string | null;
  bucketName: string;
  config: Prisma.JsonValue;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => {
  const config = bucket.config as Record<string, unknown>;
  const { secretAccessKey: _secretAccessKey, ...safeConfig } = config;

  return {
    id: bucket.id,
    providerName: bucket.providerName,
    displayName: bucket.displayName,
    bucketName: bucket.bucketName,
    config: safeConfig,
    isActive: bucket.isActive,
    createdAt: bucket.createdAt,
    updatedAt: bucket.updatedAt,
  };
};

const normalizeStorageListOptions = ({ limit, cursor }: StorageListOptions = {}) => ({
  limit: Math.min(Math.max(limit ?? 10, 1), 50),
  cursor: cursor?.trim() || undefined,
});

const getBucketHealth = async (bucket: {
  providerName: string;
  bucketName: string;
  config: Prisma.JsonValue;
  isActive: boolean;
}) => {
  let status: StorageHealthStatus = bucket.isActive ? "connected" : "inactive";
  let statusMessage = bucket.isActive ? "Bucket is reachable." : "Bucket is inactive.";

  if (!bucket.isActive) {
    return { status, statusMessage };
  }

  const bucketNameError = validateStoredBucketName(bucket.providerName, bucket.bucketName);

  if (bucketNameError) {
    return {
      status: "error" as const,
      statusMessage: bucketNameError,
    };
  }

  try {
    await createS3Client(getBucketConfig(bucket.config)).send(
      new HeadBucketCommand({ Bucket: bucket.bucketName }),
    );
  } catch (error) {
    const healthFailure = describeBucketHealthFailure(error);
    status = healthFailure.status;
    statusMessage = healthFailure.statusMessage;
  }

  return { status, statusMessage };
};

const buildStorageConnectionView = async (bucket: {
  id: string;
  providerName: string;
  displayName: string | null;
  bucketName: string;
  config: Prisma.JsonValue;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  fileObjects?: { node?: { sizeBytes: bigint; isDeleted: boolean } | null }[];
}) => {
  const health = await getBucketHealth(bucket);

  const fileObjects = bucket.fileObjects ?? [];
  const usedBytes = fileObjects.reduce(
    (sum, fileObject) =>
      fileObject.node && !fileObject.node.isDeleted ? sum + fileObject.node.sizeBytes : sum,
    0n,
  );
  const totalObjects = fileObjects.length;
  const activeObjects = fileObjects.filter((fileObject) => !fileObject.node?.isDeleted).length;

  const bucketConfig = getBucketConfig(bucket.config);
  const quotaBigInt = bucketConfig.quotaGb
    ? BigInt(Math.round(bucketConfig.quotaGb * 1024 * 1024 * 1024))
    : null;
  const availableBigInt =
    quotaBigInt !== null ? (quotaBigInt > usedBytes ? quotaBigInt - usedBytes : 0n) : null;

  const providerLabel = bucket.displayName?.trim() || getProviderLabel(bucket.providerName as StorageProvider);

  return {
    ...sanitizeBucketConnection(bucket),
    providerLabel,
    ...health,
    usedBytes: usedBytes.toString(),
    totalObjects,
    activeObjects,
    totalBytes: quotaBigInt?.toString() ?? null,
    quotaBytes: quotaBigInt?.toString() ?? null,
    availableBytes: availableBigInt?.toString() ?? null,
    sizeEstimateSource: "database",
    lastCheckedAt: new Date().toISOString(),
  };
};

export const createStorageConnection = async (rawInput: unknown) => {
  const input = parseStorageConnectionInput(rawInput);
  const config = buildConnectionConfig(input);

  const connection = await prisma.bucket.create({
    data: {
      providerName: input.provider,
      displayName: input.displayName ?? null,
      bucketName: input.bucketName,
      config: config as Prisma.InputJsonValue,
      isActive: input.isActive ?? true,
    },
  });

  return sanitizeBucketConnection(connection);
};

export const listStorageConnections = async (options?: StorageListOptions) => {
  const { limit, cursor } = normalizeStorageListOptions(options);
  const connections = await prisma.bucket.findMany({
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    orderBy: {
      createdAt: "desc",
    },
    include: {
      fileObjects: {
        include: {
          node: {
            select: {
              sizeBytes: true,
              isDeleted: true,
            },
          },
        },
      },
    },
  });

  const page = connections.slice(0, limit);
  const items = await Promise.all(page.map(buildStorageConnectionView));

  return {
    items,
    nextCursor: connections.length > limit ? connections[limit].id : null,
  };
};

export const getStorageConnection = async (id: string) => {
  const connection = await prisma.bucket.findUnique({
    where: { id },
    include: {
      fileObjects: {
        include: {
          node: {
            select: {
              sizeBytes: true,
              isDeleted: true,
            },
          },
        },
      },
    },
  });

  if (!connection) {
    throw new StorageError("Storage connection not found.", 404);
  }

  return await buildStorageConnectionView(connection as any);
};

export const updateStorageConnection = async ({ id, input: rawInput }: StorageConnectionUpdateInput) => {
  const existingConnection = await prisma.bucket.findUnique({
    where: { id },
  });

  if (!existingConnection) {
    throw new StorageError("Storage connection not found.", 404);
  }

  const existingConfig = (existingConnection.config as Record<string, unknown>) ?? {};
  const incomingInput =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : {};

  const mergedInput = {
    provider: existingConnection.providerName,
    bucketName: existingConnection.bucketName,
    displayName: existingConnection.displayName ?? undefined,
    accessKeyId:
      typeof existingConfig.accessKeyId === "string" ? existingConfig.accessKeyId : "",
    secretAccessKey:
      typeof existingConfig.secretAccessKey === "string"
        ? existingConfig.secretAccessKey
        : "",
    endpointUrl:
      typeof existingConfig.endpointUrl === "string" ? existingConfig.endpointUrl : undefined,
    region: typeof existingConfig.region === "string" ? existingConfig.region : undefined,
    projectRef:
      typeof existingConfig.projectRef === "string" ? existingConfig.projectRef : undefined,
    accountId:
      typeof existingConfig.accountId === "string" ? existingConfig.accountId : undefined,
    forcePathStyle:
      typeof existingConfig.forcePathStyle === "boolean"
        ? existingConfig.forcePathStyle
        : undefined,
    isActive: existingConnection.isActive,
    ...incomingInput,
  };

  const input = parseStorageConnectionInput(
    mergedInput,
    existingConnection.providerName as StorageProvider,
  );
  const config = buildConnectionConfig(input);

  const updatedConnection = await prisma.bucket.update({
    where: { id },
    data: {
      providerName: input.provider,
      displayName: input.displayName ?? null,
      bucketName: input.bucketName,
      config: config as Prisma.InputJsonValue,
      isActive: input.isActive ?? existingConnection.isActive,
    },
  });

  return sanitizeBucketConnection(updatedConnection);
};

export const deleteStorageConnection = async (id: string) => {
  const connection = await prisma.bucket.findUnique({
    where: { id },
    select: {
      id: true,
    },
  });

  if (!connection) {
    throw new StorageError("Storage connection not found.", 404);
  }

  await prisma.bucket.delete({
    where: { id },
  });

  return {
    success: true,
  };
};

export const isStorageError = (error: unknown): error is StorageError => {
  return error instanceof StorageError;
};

type BucketConfig = {
  endpointUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  quotaGb?: number;
};

const getBucketConfig = (config: Prisma.JsonValue): BucketConfig => {
  const c = config as Record<string, unknown>;
  return {
    endpointUrl: c.endpointUrl as string,
    region: c.region as string,
    accessKeyId: c.accessKeyId as string,
    secretAccessKey: c.secretAccessKey as string,
    forcePathStyle: c.forcePathStyle as boolean,
    quotaGb: typeof c.quotaGb === "number" ? c.quotaGb : undefined,
  };
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

const describeBucketHealthFailure = (error: unknown) => {
  const code = getS3ErrorCode(error);
  const message = error instanceof Error ? error.message : "Could not reach this bucket.";
  const metadata =
    error instanceof S3ServiceException
      ? [
          error.$metadata.httpStatusCode && `HTTP ${error.$metadata.httpStatusCode}`,
          error.$metadata.requestId && `request ${error.$metadata.requestId}`,
          error.$metadata.extendedRequestId && `extended ${error.$metadata.extendedRequestId}`,
        ]
          .filter(Boolean)
          .join(", ")
      : "";
  const fullMessage = [code, message, metadata].filter(Boolean).join(": ");

  if (code === "AccessDenied" || code === "Forbidden" || code === "NotAuthorized") {
    return {
      status: "limited" as const,
      statusMessage:
        "Credentials are saved, but this key cannot run the bucket health check. Upload may still work if PutObject is allowed.",
    };
  }

  if (code === "NoSuchBucket") {
    return {
      status: "error" as const,
      statusMessage: "Bucket was not found. Check the bucket name.",
    };
  }

  if (code === "PermanentRedirect" || code === "AuthorizationHeaderMalformed") {
    return {
      status: "error" as const,
      statusMessage: "Bucket exists in a different region or endpoint. Check region and endpoint URL.",
    };
  }

  if (code === "InvalidAccessKeyId" || code === "SignatureDoesNotMatch") {
    return {
      status: "error" as const,
      statusMessage: "Storage credentials were rejected. Check access key and secret key.",
    };
  }

  return {
    status: "error" as const,
    statusMessage: fullMessage,
  };
};

const validateStoredBucketName = (providerName: string, bucketName: string) => {
  const commonPattern = /^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$/;
  const storjPattern = /^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/;
  const pattern = providerName === "storj" ? storjPattern : commonPattern;

  if (!pattern.test(bucketName) || bucketName.includes("..")) {
    return providerName === "storj"
      ? "Invalid Storj bucket name. Use only lowercase letters, numbers, and hyphens."
      : "Invalid bucket name. Use lowercase letters, numbers, dots, or hyphens.";
  }

  return null;
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
    throw new StorageError("No active storage buckets available.", 503);
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

export const uploadFile = async ({
  userId,
  fileBuffer,
  originalName,
  mimeType,
  sizeBytes,
  driveId,
  parentId,
}: {
  userId: string;
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  driveId?: string;
  parentId?: string;
}) => {
  const drive = await prisma.drive.findFirst({
    where: driveId ? { id: driveId, ownerId: userId } : { ownerId: userId },
  });

  if (!drive) {
    throw new StorageError("Drive not found.", 404);
  }

  const bucket = await selectLeastUsedBucket();

  const safeName = originalName.replace(/[^\w.\-]/g, "_");

  let parentPath = "";
  if (parentId) {
    const parentNode = await prisma.node.findFirst({
      where: { id: parentId, driveId: drive.id, type: "FOLDER", isDeleted: false },
      select: { path: true },
    });
    if (!parentNode) {
      throw new StorageError("Parent folder not found.", 404);
    }
    parentPath = parentNode.path;
  }

  const filePath = `${parentPath}/${safeName}`;

  const existing = await prisma.node.findUnique({
    where: { driveId_path: { driveId: drive.id, path: filePath } },
  });

  if (existing && !existing.isDeleted) {
    throw new StorageError("A file already exists at this path.", 409);
  }

  const objectKey = `${userId}/${drive.id}/${Date.now()}_${safeName}`;
  const sizeBigInt = BigInt(sizeBytes);
  const s3Client = createS3Client(getBucketConfig(bucket.config));

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket.bucketName,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: mimeType,
      ContentLength: sizeBytes,
    },
  });

  await upload.done();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const node = await tx.node.create({
        data: {
          driveId: drive.id,
          parentId: parentId ?? null,
          type: "FILE",
          name: safeName,
          path: filePath,
          sizeBytes: sizeBigInt,
          mimeType,
          createdById: userId,
        },
      });

      const fileObject = await tx.fileObject.create({
        data: { nodeId: node.id, bucketId: bucket.id, objectKey },
      });

      await tx.drive.update({
        where: { id: drive.id },
        data: { usedBytes: { increment: sizeBigInt } },
      });

      return { node, fileObject };
    });

    return {
      id: result.node.id,
      driveId: result.node.driveId,
      parentId: result.node.parentId,
      type: result.node.type,
      name: result.node.name,
      path: result.node.path,
      description: result.node.description,
      sizeBytes: result.node.sizeBytes.toString(),
      mimeType: result.node.mimeType,
      isFavorite: result.node.isFavorite,
      tags: [],
      bucketId: bucket.id,
      objectKey: result.fileObject.objectKey,
      createdAt: result.node.createdAt,
      updatedAt: result.node.updatedAt,
    };
  } catch (err) {
    // Best-effort S3 cleanup if DB transaction fails
    await s3Client
      .send(new DeleteObjectCommand({ Bucket: bucket.bucketName, Key: objectKey }))
      .catch(() => undefined);
    throw err;
  }
};

// ─── Create folder ───────────────────────────────────────────────────────────

export const createFolder = async ({
  userId,
  name,
  driveId,
  parentId,
}: {
  userId: string;
  name: string;
  driveId?: string;
  parentId?: string;
}) => {
  const drive = await prisma.drive.findFirst({
    where: driveId ? { id: driveId, ownerId: userId } : { ownerId: userId },
  });

  if (!drive) {
    throw new StorageError("Drive not found.", 404);
  }

  const trimmed = name.trim();
  if (!trimmed) {
    throw new StorageError("Folder name is required.", 400);
  }

  const safeName = trimmed.replace(/[^ -\u007f]/g, "").replace(/[^\w.\-]/g, "_");
  if (!safeName) {
    throw new StorageError("Folder name is invalid.", 400);
  }

  let parentPath = "";
  if (parentId) {
    const parentNode = await prisma.node.findFirst({
      where: { id: parentId, driveId: drive.id, type: "FOLDER", isDeleted: false },
      select: { path: true },
    });
    if (!parentNode) {
      throw new StorageError("Parent folder not found.", 404);
    }
    parentPath = parentNode.path;
  }

  const folderPath = `${parentPath}/${safeName}`;

  const existing = await prisma.node.findUnique({
    where: { driveId_path: { driveId: drive.id, path: folderPath } },
  });

  if (existing && !existing.isDeleted) {
    throw new StorageError("A folder already exists at this path.", 409);
  }

  const node = await prisma.node.create({
    data: {
      driveId: drive.id,
      parentId: parentId ?? null,
      type: "FOLDER",
      name: safeName,
      path: folderPath,
      createdById: userId,
    },
  });

  return {
    id: node.id,
    driveId: node.driveId,
    parentId: node.parentId,
    type: node.type,
    name: node.name,
    path: node.path,
    description: node.description,
    sizeBytes: node.sizeBytes.toString(),
    mimeType: node.mimeType,
    isFavorite: node.isFavorite,
    tags: [],
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resolveConflictName = (name: string, basePath: string): { name: string; path: string } => {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;
  const newName = `${base}_restored_${Date.now()}${ext}`;
  const parentDir = basePath.substring(0, basePath.lastIndexOf("/"));
  return { name: newName, path: `${parentDir}/${newName}` };
};

// Returns all non-deleted descendant nodes of a folder (identified by its current path).
const getDescendants = (driveId: string, folderPath: string) =>
  prisma.node.findMany({
    where: { driveId, path: { startsWith: `${folderPath}/` }, isDeleted: false },
  });

// ─── List ──────────────────────────────────────────────────────────────────────

export const listFiles = async ({
  userId,
  driveId,
}: {
  userId: string;
  driveId?: string;
}) => {
  const nodes = await prisma.node.findMany({
    where: {
      isDeleted: false,
      drive: driveId ? { id: driveId, ownerId: userId } : { ownerId: userId },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      driveId: true,
      parentId: true,
      type: true,
      name: true,
      path: true,
      description: true,
      sizeBytes: true,
      mimeType: true,
      isFavorite: true,
      createdAt: true,
      updatedAt: true,
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });

  return nodes.map((n) => ({
    ...n,
    sizeBytes: n.sizeBytes.toString(),
    tags: n.tags.map((nt) => nt.tag),
  }));
};

// ─── Trash ────────────────────────────────────────────────────────────────────

export const trashNode = async ({
  userId,
  nodeId,
}: {
  userId: string;
  nodeId: string;
}) => {
  const node = await prisma.node.findFirst({
    where: { id: nodeId, isDeleted: false, drive: { ownerId: userId } },
  });

  if (!node) throw new StorageError("File or folder not found.", 404);

  const now = new Date();
  const trashRoot = `/__trash__/${nodeId}`;

  if (node.type === "FILE") {
    await prisma.node.update({
      where: { id: nodeId },
      data: {
        isDeleted: true,
        deletedAt: now,
        deletedById: userId,
        originalPath: node.path,
        originalName: node.name,
        path: trashRoot,
      },
    });
  } else {
    // Folder: rewrite every descendant's path under the trash root atomically.
    // This frees all original paths so new uploads can reuse them immediately.
    const descendants = await getDescendants(node.driveId, node.path);

    await prisma.$transaction([
      prisma.node.update({
        where: { id: nodeId },
        data: {
          isDeleted: true,
          deletedAt: now,
          deletedById: userId,
          originalPath: node.path,
          originalName: node.name,
          path: trashRoot,
        },
      }),
      ...descendants.map((d) =>
        prisma.node.update({
          where: { id: d.id },
          data: {
            isDeleted: true,
            deletedAt: now,
            deletedById: userId,
            originalPath: d.path,
            originalName: d.name,
            path: d.path.replace(node.path, trashRoot),
          },
        }),
      ),
    ]);
  }

  return { success: true };
};

// ─── List trash ───────────────────────────────────────────────────────────────

export const listTrash = async ({
  userId,
  driveId,
}: {
  userId: string;
  driveId?: string;
}) => {
  // Only return top-level trashed entries: nodes whose parent is alive (or root).
  // Descendants of a trashed folder have a deleted parent and are not shown separately.
  const nodes = await prisma.node.findMany({
    where: {
      isDeleted: true,
      drive: driveId ? { id: driveId, ownerId: userId } : { ownerId: userId },
      OR: [{ parentId: null }, { parent: { isDeleted: false } }],
    },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      driveId: true,
      type: true,
      originalName: true,
      originalPath: true,
      sizeBytes: true,
      mimeType: true,
      deletedAt: true,
      createdAt: true,
    },
  });

  return nodes.map((n) => ({ ...n, sizeBytes: n.sizeBytes.toString() }));
};

// ─── Restore ──────────────────────────────────────────────────────────────────

export const restoreNode = async ({
  userId,
  nodeId,
}: {
  userId: string;
  nodeId: string;
}) => {
  const node = await prisma.node.findFirst({
    where: { id: nodeId, isDeleted: true, drive: { ownerId: userId } },
  });

  if (!node) throw new StorageError("Item not found in trash.", 404);

  const targetName = node.originalName ?? node.name;
  const targetPath = node.originalPath ?? `/${targetName}`;

  const conflict = await prisma.node.findUnique({
    where: { driveId_path: { driveId: node.driveId, path: targetPath } },
  });

  let restoredPath = targetPath;
  let restoredName = targetName;

  if (conflict && !conflict.isDeleted) {
    ({ name: restoredName, path: restoredPath } = resolveConflictName(targetName, targetPath));
  }

  if (node.type === "FILE") {
    await prisma.node.update({
      where: { id: nodeId },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedById: null,
        path: restoredPath,
        name: restoredName,
        originalPath: null,
        originalName: null,
      },
    });
  } else {
    // Folder: restore all descendants under the trash root back to their original paths.
    const trashRoot = `/__trash__/${nodeId}`;
    const descendants = await prisma.node.findMany({
      where: { driveId: node.driveId, path: { startsWith: `${trashRoot}/` }, isDeleted: true },
    });

    await prisma.$transaction([
      prisma.node.update({
        where: { id: nodeId },
        data: {
          isDeleted: false,
          deletedAt: null,
          deletedById: null,
          path: restoredPath,
          name: restoredName,
          originalPath: null,
          originalName: null,
        },
      }),
      ...descendants.map((d) => {
        const dOriginalPath = d.originalPath ?? d.path.replace(trashRoot, restoredPath);
        const dOriginalName = d.originalName ?? d.name;
        return prisma.node.update({
          where: { id: d.id },
          data: {
            isDeleted: false,
            deletedAt: null,
            deletedById: null,
            path: dOriginalPath,
            name: dOriginalName,
            originalPath: null,
            originalName: null,
          },
        });
      }),
    ]);
  }

  return { success: true, name: restoredName, path: restoredPath };
};

// ─── Permanent delete ─────────────────────────────────────────────────────────

export const deleteNode = async ({
  userId,
  nodeId,
}: {
  userId: string;
  nodeId: string;
}) => {
  const node = await prisma.node.findFirst({
    where: { id: nodeId, drive: { ownerId: userId } },
    include: { fileObjects: { include: { bucket: true } } },
  });

  if (!node) throw new StorageError("File or folder not found.", 404);

  // For folders collect all descendant nodes so we can purge their S3 objects
  // and tally freed bytes. The DB cascade handles DB cleanup automatically.
  let totalBytes = node.sizeBytes;
  const allFileObjects = [...node.fileObjects];

  if (node.type === "FOLDER") {
    const searchPath = node.isDeleted ? `/__trash__/${nodeId}` : node.path;
    const descendants = await prisma.node.findMany({
      where: { driveId: node.driveId, path: { startsWith: `${searchPath}/` } },
      include: { fileObjects: { include: { bucket: true } } },
    });
    for (const d of descendants) {
      totalBytes += d.sizeBytes;
      allFileObjects.push(...d.fileObjects);
    }
  }

  // S3 cleanup — best-effort
  await Promise.allSettled(
    allFileObjects.map((fo) =>
      createS3Client(getBucketConfig(fo.bucket.config)).send(
        new DeleteObjectCommand({ Bucket: fo.bucket.bucketName, Key: fo.objectKey }),
      ),
    ),
  );

  await prisma.$transaction(async (tx) => {
    // Cascade in schema deletes children + FileObjects automatically
    await tx.node.delete({ where: { id: nodeId } });
    await tx.drive.update({
      where: { id: node.driveId },
      data: { usedBytes: { decrement: totalBytes } },
    });
  });

  return { success: true };
};

// ─── Download (presigned URL) ─────────────────────────────────────────────────

export const downloadFile = async ({
  userId,
  nodeId,
  expiresIn = 3600,
}: {
  userId: string;
  nodeId: string;
  expiresIn?: number;
}) => {
  const node = await prisma.node.findFirst({
    where: { id: nodeId, type: "FILE", isDeleted: false, drive: { ownerId: userId } },
    include: { fileObjects: { include: { bucket: true } } },
  });

  if (!node) throw new StorageError("File not found.", 404);

  const fo = node.fileObjects[0];
  if (!fo) throw new StorageError("File data not found.", 404);

  const s3Client = createS3Client(getBucketConfig(fo.bucket.config));
  const command = new GetObjectCommand({
    Bucket: fo.bucket.bucketName,
    Key: fo.objectKey,
    ResponseContentDisposition: `attachment; filename="${node.name}"`,
    ResponseContentType: node.mimeType ?? "application/octet-stream",
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

  return { url, expiresIn, name: node.name, mimeType: node.mimeType, sizeBytes: node.sizeBytes.toString() };
};

// ─── Preview (presigned URL, inline) ────────────────────────────────────────

export const previewFile = async ({
  userId,
  nodeId,
  expiresIn = 900,
}: {
  userId: string;
  nodeId: string;
  expiresIn?: number;
}) => {
  const node = await prisma.node.findFirst({
    where: { id: nodeId, type: "FILE", isDeleted: false, drive: { ownerId: userId } },
    include: { fileObjects: { include: { bucket: true } } },
  });

  if (!node) throw new StorageError("File not found.", 404);

  const fo = node.fileObjects[0];
  if (!fo) throw new StorageError("File data not found.", 404);

  const s3Client = createS3Client(getBucketConfig(fo.bucket.config));
  const command = new GetObjectCommand({
    Bucket: fo.bucket.bucketName,
    Key: fo.objectKey,
    ResponseContentDisposition: `inline; filename="${node.name}"`,
    ResponseContentType: node.mimeType ?? "application/octet-stream",
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

  return { url, expiresIn, name: node.name, mimeType: node.mimeType, sizeBytes: node.sizeBytes.toString() };
};

// ─── Update node details ──────────────────────────────────────────────────────

export const updateNodeDetails = async ({
  userId,
  nodeId,
  name,
  description,
  isFavorite,
  tags,
}: {
  userId: string;
  nodeId: string;
  name?: string;
  description?: string;
  isFavorite?: boolean;
  tags?: string[];
}) => {
  const node = await prisma.node.findFirst({
    where: { id: nodeId, isDeleted: false, drive: { ownerId: userId } },
  });

  if (!node) throw new StorageError("File or folder not found.", 404);

  let newPath = node.path;
  let newName = node.name;

  if (name !== undefined) {
    const trimmed = name.trim().replace(/[^\w.\-\s]/g, "_");
    if (trimmed.length === 0) throw new StorageError("Name cannot be empty.", 400);
    newName = trimmed;
    const parentDir = node.path.substring(0, node.path.lastIndexOf("/"));
    newPath = `${parentDir}/${trimmed}`;

    if (newPath !== node.path) {
      const conflict = await prisma.node.findUnique({
        where: { driveId_path: { driveId: node.driveId, path: newPath } },
      });
      if (conflict && !conflict.isDeleted) {
        throw new StorageError("A file or folder already exists with that name.", 409);
      }
    }
  }

  // Upsert tags and replace all NodeTag associations in one transaction
  const updated = await prisma.$transaction(async (tx) => {
    let tagConnect: { tagId: string }[] = [];

    if (tags !== undefined) {
      const tagRecords = await Promise.all(
        tags.map((t) =>
          tx.tag.upsert({
            where: { name: t.trim().toLowerCase() },
            create: { name: t.trim().toLowerCase() },
            update: {},
          }),
        ),
      );
      tagConnect = tagRecords.map((t) => ({ tagId: t.id }));
      await tx.nodeTag.deleteMany({ where: { nodeId } });
    }

    const result = await tx.node.update({
      where: { id: nodeId },
      data: {
        name: newName,
        path: newPath,
        ...(description !== undefined && { description }),
        ...(isFavorite !== undefined && { isFavorite }),
        ...(tags !== undefined && { tags: { create: tagConnect } }),
      },
      include: { tags: { include: { tag: true } } },
    });

    // If a folder was renamed, rewrite all descendant paths
    if (node.type === "FOLDER" && newPath !== node.path) {
      const descendants = await getDescendants(node.driveId, node.path);
      await Promise.all(
        descendants.map((d) =>
          tx.node.update({
            where: { id: d.id },
            data: { path: d.path.replace(node.path, newPath) },
          }),
        ),
      );
    }

    return result;
  });

  return {
    id: updated.id,
    type: updated.type,
    name: updated.name,
    path: updated.path,
    description: updated.description,
    isFavorite: updated.isFavorite,
    sizeBytes: updated.sizeBytes.toString(),
    mimeType: updated.mimeType,
    tags: updated.tags.map((nt) => nt.tag),
    updatedAt: updated.updatedAt,
  };
};

export const getStorageDashboard = async (options?: StorageListOptions) => {
  const { limit, cursor } = normalizeStorageListOptions(options);
  const buckets = await prisma.bucket.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      fileObjects: {
        include: {
          node: {
            select: {
              sizeBytes: true,
              isDeleted: true,
            },
          },
        },
      },
    },
  });

  const pagedBuckets = cursor
    ? buckets.slice(buckets.findIndex((bucket) => bucket.id === cursor) + 1)
    : buckets;
  const page = pagedBuckets.slice(0, limit);
  const nextCursor = pagedBuckets.length > limit ? pagedBuckets[limit].id : null;

  const storages = await Promise.all(
    page.map(async (bucket) => {
      const usedBytes = bucket.fileObjects.reduce(
        (sum, fileObject) =>
          fileObject.node && !fileObject.node.isDeleted
            ? sum + fileObject.node.sizeBytes
            : sum,
        0n,
      );
      const totalObjects = bucket.fileObjects.length;
      const activeObjects = bucket.fileObjects.filter((fileObject) => !fileObject.node?.isDeleted)
        .length;

      const health = await getBucketHealth(bucket);
      const bConfig = getBucketConfig(bucket.config);
      const quotaBigInt = bConfig.quotaGb
        ? BigInt(Math.round(bConfig.quotaGb * 1024 * 1024 * 1024))
        : null;
      const availableBigInt =
        quotaBigInt !== null ? (quotaBigInt > usedBytes ? quotaBigInt - usedBytes : 0n) : null;

      const providerLabel = bucket.displayName?.trim() || getProviderLabel(bucket.providerName as StorageProvider);

      return {
        id: bucket.id,
        providerName: bucket.providerName,
        providerLabel,
        displayName: bucket.displayName,
        bucketName: bucket.bucketName,
        config: sanitizeBucketConnection(bucket).config,
        isActive: bucket.isActive,
        status: health.status,
        statusMessage: health.statusMessage,
        usedBytes: usedBytes.toString(),
        totalBytes: quotaBigInt?.toString() ?? null,
        quotaBytes: quotaBigInt?.toString() ?? null,
        availableBytes: availableBigInt?.toString() ?? null,
        activeObjects,
        totalObjects,
        sizeEstimateSource: "database",
        lastCheckedAt: new Date().toISOString(),
        createdAt: bucket.createdAt,
        updatedAt: bucket.updatedAt,
      };
    }),
  );

  const allSummaries = buckets.map((bucket) => {
    const usedBytes = bucket.fileObjects.reduce(
      (sum, fileObject) =>
        fileObject.node && !fileObject.node.isDeleted
          ? sum + fileObject.node.sizeBytes
          : sum,
      0n,
    );
    const sConfig = getBucketConfig(bucket.config);
    const quotaBigInt = sConfig.quotaGb
      ? BigInt(Math.round(sConfig.quotaGb * 1024 * 1024 * 1024))
      : null;
    return {
      isActive: bucket.isActive,
      usedBytes,
      quotaBigInt,
      activeObjects: bucket.fileObjects.filter((fileObject) => !fileObject.node?.isDeleted).length,
      totalObjects: bucket.fileObjects.length,
    };
  });
  const usedBytes = allSummaries.reduce((sum, storage) => sum + storage.usedBytes, 0n);
  const hasAnyQuota = allSummaries.some((s) => s.quotaBigInt !== null);
  const totalQuotaBigInt = hasAnyQuota
    ? allSummaries.reduce((sum, s) => sum + (s.quotaBigInt ?? 0n), 0n)
    : null;
  const totalAvailableBigInt =
    totalQuotaBigInt !== null
      ? totalQuotaBigInt > usedBytes
        ? totalQuotaBigInt - usedBytes
        : 0n
      : null;

  return {
    totalStorages: buckets.length,
    activeStorages: allSummaries.filter((storage) => storage.isActive).length,
    connectedStorages: storages.filter(
      (storage) => storage.status === "connected" || storage.status === "limited",
    ).length,
    erroredStorages: storages.filter((storage) => storage.status === "error").length,
    usedBytes: usedBytes.toString(),
    totalBytes: totalQuotaBigInt?.toString() ?? null,
    quotaBytes: totalQuotaBigInt?.toString() ?? null,
    availableBytes: totalAvailableBigInt?.toString() ?? null,
    totalObjects: allSummaries.reduce((sum, storage) => sum + storage.totalObjects, 0),
    activeObjects: allSummaries.reduce((sum, storage) => sum + storage.activeObjects, 0),
    totalConnections: buckets.length,
    nextCursor,
    storages,
  };
};

// ─── Share links ──────────────────────────────────────────────────────────────

const serializeShareLink = (link: { id: string; token: string; nodeId: string; expiresAt: Date | null; createdAt: Date }) => ({
  id: link.id,
  token: link.token,
  nodeId: link.nodeId,
  expiresAt: link.expiresAt?.toISOString() ?? null,
  createdAt: link.createdAt.toISOString(),
});

export const createShareLink = async ({
  userId,
  nodeId,
  expiresIn,
}: {
  userId: string;
  nodeId: string;
  expiresIn?: number; // seconds; undefined = no expiry
}) => {
  const node = await prisma.node.findFirst({
    where: { id: nodeId, type: "FILE", isDeleted: false, drive: { ownerId: userId } },
  });
  if (!node) throw new StorageError("File not found.", 404);

  const expiresAt = expiresIn != null ? new Date(Date.now() + expiresIn * 1000) : null;

  const link = await prisma.shareLink.create({
    data: { nodeId, createdById: userId, expiresAt },
  });

  return serializeShareLink(link);
};

export const listShareLinks = async ({
  userId,
  nodeId,
}: {
  userId: string;
  nodeId: string;
}) => {
  const node = await prisma.node.findFirst({
    where: { id: nodeId, isDeleted: false, drive: { ownerId: userId } },
  });
  if (!node) throw new StorageError("File not found.", 404);

  const links = await prisma.shareLink.findMany({
    where: { nodeId },
    orderBy: { createdAt: "desc" },
  });

  return links.map(serializeShareLink);
};

export const revokeShareLink = async ({
  userId,
  linkId,
}: {
  userId: string;
  linkId: string;
}) => {
  const link = await prisma.shareLink.findFirst({
    where: { id: linkId, createdById: userId },
  });
  if (!link) throw new StorageError("Share link not found.", 404);

  await prisma.shareLink.delete({ where: { id: linkId } });
  return { success: true };
};

export const resolveShareLink = async (token: string) => {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      node: { include: { fileObjects: { include: { bucket: true } } } },
    },
  });

  if (!link) throw new StorageError("Share link not found.", 404);
  if (link.expiresAt && link.expiresAt < new Date()) {
    throw new StorageError("This share link has expired.", 410);
  }
  if (link.node.isDeleted) throw new StorageError("File is no longer available.", 404);

  const fo = link.node.fileObjects[0];
  if (!fo) throw new StorageError("File data not found.", 404);

  const s3Client = createS3Client(getBucketConfig(fo.bucket.config));
  const command = new GetObjectCommand({
    Bucket: fo.bucket.bucketName,
    Key: fo.objectKey,
    ResponseContentDisposition: `inline; filename="${link.node.name}"`,
    ResponseContentType: link.node.mimeType ?? "application/octet-stream",
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return {
    url,
    name: link.node.name,
    mimeType: link.node.mimeType,
    sizeBytes: link.node.sizeBytes.toString(),
  };
};
