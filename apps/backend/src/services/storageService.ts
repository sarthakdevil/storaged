import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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

const validateEndpointUrl = (endpointUrl: string) => {
  try {
    return new URL(endpointUrl).toString();
  } catch {
    throw new StorageError("Provide a valid endpoint URL.", 400);
  }
};

const getProviderDefaults = (
  provider: StorageProvider,
  input: StorageConnectionInput,
): ProviderDefaults => {
  switch (provider) {
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

  return {
    provider: input.provider,
    endpointUrl: validateEndpointUrl(defaults.endpointUrl),
    region: defaults.region,
    accessKeyId: input.accessKeyId.trim(),
    secretAccessKey: input.secretAccessKey.trim(),
    forcePathStyle: input.forcePathStyle ?? defaults.forcePathStyle,
    projectRef: input.projectRef?.trim() || undefined,
    accountId: input.accountId?.trim() || undefined,
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

export const listStorageConnections = async () => {
  const connections = await prisma.bucket.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return connections.map(sanitizeBucketConnection);
};

export const getStorageConnection = async (id: string) => {
  const connection = await prisma.bucket.findUnique({
    where: { id },
  });

  if (!connection) {
    throw new StorageError("Storage connection not found.", 404);
  }

  return sanitizeBucketConnection(connection);
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
      nodeId: result.node.id,
      name: result.node.name,
      path: result.node.path,
      sizeBytes: result.node.sizeBytes.toString(),
      mimeType: result.node.mimeType,
      bucketId: bucket.id,
      objectKey: result.fileObject.objectKey,
      createdAt: result.node.createdAt,
    };
  } catch (err) {
    // Best-effort S3 cleanup if DB transaction fails
    await s3Client
      .send(new DeleteObjectCommand({ Bucket: bucket.bucketName, Key: objectKey }))
      .catch(() => undefined);
    throw err;
  }
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