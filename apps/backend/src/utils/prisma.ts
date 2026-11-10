import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";
import { logger } from "./logger";
import { getRuntimeValue } from "./runtimeEnv";

type DatabaseContext = {
  client?: PrismaClient;
  pool?: Pool;
  connectionString?: string;
};

// Concurrent Worker requests must never share request-bound sockets or cleanup.
const databaseScope = new AsyncLocalStorage<DatabaseContext>();
export const withPrismaContext = <T>(work: () => T): T =>
  databaseScope.run({}, work);

const context = () => {
  const value = databaseScope.getStore();
  if (!value) throw new Error("Database access requires a request context.");
  return value;
};

export const configurePrisma = (connectionString: string) => {
  const state = context();
  if (state.client) {
    if (state.connectionString !== connectionString) {
      throw new Error(
        "Cannot change the database connection during a request.",
      );
    }
    return state.client;
  }
  logger.info("Initializing Prisma database adapter");
  state.pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  state.client = new PrismaClient({ adapter: new PrismaPg(state.pool) });
  state.connectionString = connectionString;
  return state.client;
};

export const disconnectPrisma = async () => {
  const state = context();
  const { client, pool } = state;
  state.client = undefined;
  state.pool = undefined;
  state.connectionString = undefined;
  try {
    await client?.$disconnect();
  } finally {
    await pool?.end();
  }
};

export const getPrisma = () => {
  const state = context();
  if (state.client) return state.client;
  const connectionString =
    getRuntimeValue("DIRECT_URL") ?? getRuntimeValue("DATABASE_URL");
  if (!connectionString)
    throw new Error(
      "DIRECT_URL or DATABASE_URL is required to initialize Prisma.",
    );
  return configurePrisma(connectionString);
};

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
