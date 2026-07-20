// ─── Cloudflare D1 Prisma client factory ──────────────────────────────────────
// Used by ai/ (Cloudflare Workers + PrismaD1 adapter)

import { PrismaD1 } from "@prisma/adapter-d1";
// Import from the locally-generated client inside ai/
import { PrismaClient } from "../../../ai/prisma/generated/prisma/client.ts";

/**
 * Create a new PrismaClient backed by a Cloudflare D1 binding.
 * Call this per-request (D1 bindings are request-scoped).
 */
export function createD1Client(d1: D1Database): PrismaClient {
  const adapter = new PrismaD1(d1);
  return new PrismaClient({ adapter });
}
