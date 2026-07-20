// ─── Auth middleware helpers ──────────────────────────────────────────────────
// Drop-in helpers for Cloudflare Workers that validate sessions and API keys.
// These accept a minimal PrismaClient-like interface so they work with both
// the PostgreSQL adapter (apps/backend) and the D1 adapter (ai/).

import { AuthError } from "./errors.js";
import { hashSha256 } from "./hash.js";

// ─── Minimal Prisma interface types ──────────────────────────────────────────
// We use structural typing so @repo/auth has no hard dependency on @prisma/client.

interface SessionRecord {
  userId: string;
  expiresAt: Date;
}

interface ApiKeyRecord {
  id: string;
  userId: string;
  expiresAt: Date | null;
}

interface PrismaLike {
  session: {
    findUnique(args: {
      where: { token: string };
      select: { userId: true; expiresAt: true };
    }): Promise<SessionRecord | null>;
  };
  apiKey: {
    findUnique(args: {
      where: { keyHash: string };
      select: { id: true; userId: true; expiresAt: true };
    }): Promise<ApiKeyRecord | null>;
    update(args: {
      where: { id: string };
      data: { lastUsedAt: Date };
    }): Promise<unknown>;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getBearerToken(request: Request): string {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

// ─── Session-based auth ───────────────────────────────────────────────────────

/**
 * Validate a Bearer session token from the request.
 * Returns the userId on success. Throws AuthError on failure.
 */
export async function requireAuth(
  request: Request,
  prisma: PrismaLike,
): Promise<string> {
  const token = getBearerToken(request);

  if (!token) {
    throw new AuthError("Authorization token is required.", 401);
  }

  const session = await prisma.session.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new AuthError("Session expired or invalid.", 401);
  }

  return session.userId;
}

// ─── API key auth ─────────────────────────────────────────────────────────────

/**
 * Validate an API key from Authorization: Bearer <key> or X-API-Key header.
 * Touches lastUsedAt asynchronously via ctx.waitUntil().
 * Returns the userId on success. Throws AuthError on failure.
 */
export async function requireApiKey(
  request: Request,
  prisma: PrismaLike,
  ctx: ExecutionContext,
): Promise<string> {
  const authHeader = request.headers.get("authorization");
  const headerKey = request.headers.get("x-api-key");
  const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : headerKey;

  if (!rawKey) {
    throw new AuthError(
      "API key required. Provide via Authorization: Bearer <key> or X-API-Key header.",
      401,
    );
  }

  const keyHash = await hashSha256(rawKey);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!apiKey) {
    throw new AuthError("Invalid API key.", 401);
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    throw new AuthError("API key has expired.", 401);
  }

  ctx.waitUntil(
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }),
  );

  return apiKey.userId;
}
