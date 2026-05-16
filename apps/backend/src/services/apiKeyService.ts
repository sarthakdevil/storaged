import { createHash, randomBytes } from "crypto";
import { prisma } from "../utils/prisma";

function generateRawKey(): string {
  return `stg_${randomBytes(28).toString("hex")}`; // stg_ + 56 hex chars = 60 total
}

const serialize = (k: {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
  expiresAt: k.expiresAt?.toISOString() ?? null,
  createdAt: k.createdAt.toISOString(),
});

export const createApiKey = async ({
  userId,
  name,
  expiresIn,
}: {
  userId: string;
  name: string;
  expiresIn?: number; // seconds; undefined = no expiry
}) => {
  const trimmed = name.trim();
  if (!trimmed) throw { statusCode: 400, message: "Key name is required." };

  const rawKey = generateRawKey();
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.slice(0, 14); // "stg_" + 10 chars
  const expiresAt = expiresIn != null ? new Date(Date.now() + expiresIn * 1000) : null;

  const key = await prisma.apiKey.create({
    data: { name: trimmed, keyHash, prefix, userId, expiresAt },
  });

  return { ...serialize(key), key: rawKey }; // rawKey shown only once
};

export const listApiKeys = async (userId: string) => {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, expiresAt: true, createdAt: true },
  });
  return keys.map(serialize);
};

export const revokeApiKey = async ({ userId, keyId }: { userId: string; keyId: string }) => {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, userId } });
  if (!key) throw { statusCode: 404, message: "API key not found." };
  await prisma.apiKey.delete({ where: { id: keyId } });
  return { success: true };
};
