// ─── PostgreSQL Prisma client factory ─────────────────────────────────────────
// Used by apps/backend (Cloudflare Workers + PrismaPg adapter)

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
// Import from the locally-generated client inside apps/backend
import { PrismaClient } from "../../../apps/backend/src/generated/prisma/client.js";

let _client: PrismaClient | undefined;
let _connectionString: string | undefined;

/**
 * Returns a singleton PrismaClient backed by a PrismaPg connection pool.
 * Call this once per Worker request with the current connection string.
 */
export function createPgClient(connectionString: string): PrismaClient {
  if (_client && _connectionString === connectionString) {
    return _client;
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 100,
  });
  const adapter = new PrismaPg(pool);
  _client = new PrismaClient({ adapter });
  _connectionString = connectionString;

  return _client;
}

/** Lazy proxy — resolves the client on first property access. */
export function createPgProxy(getConnectionString: () => string): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property, receiver) {
      return Reflect.get(createPgClient(getConnectionString()), property, receiver);
    },
  });
}
