import { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { prisma } from "../utils/prisma";

export type ApiKeyRequest = Request & { userId: string };

export const requireApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const headerKey = req.headers["x-api-key"] as string | undefined;

  const rawKey = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : headerKey ?? null;

  if (!rawKey) {
    res.status(401).json({ error: "API key required. Provide via Authorization: Bearer <key> or X-API-Key header." });
    return;
  }

  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!apiKey) {
    res.status(401).json({ error: "Invalid API key." });
    return;
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    res.status(401).json({ error: "API key has expired." });
    return;
  }

  // Fire-and-forget — update lastUsedAt without blocking the request
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  (req as ApiKeyRequest).userId = apiKey.userId;
  next();
};
