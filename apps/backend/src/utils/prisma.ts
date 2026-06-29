import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";
import { logger } from "../utils/logger";
import { getRuntimeValue } from "./runtimeEnv";

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

let prismaClient: PrismaClient | undefined = globalThis.__prisma__;
let prismaConnectionString: string | undefined;

export const configurePrisma = (connectionString: string) => {
  if (prismaClient && prismaConnectionString === connectionString) {
    return prismaClient;
  }

  logger.info("Initializing Prisma database adapter");

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prismaClient = new PrismaClient({ adapter });
  prismaConnectionString = connectionString;

  if (process.env.NODE_ENV !== "production") {
    globalThis.__prisma__ = prismaClient;
  }

  return prismaClient;
};

export const getPrisma = () => {
  if (prismaClient) {
    return prismaClient;
  }

  const connectionString = getRuntimeValue("DIRECT_URL") ?? getRuntimeValue("DATABASE_URL");

  if (!connectionString) {
    throw new Error("DIRECT_URL or DATABASE_URL is required to initialize Prisma.");
  }

  return configurePrisma(connectionString);
};

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getPrisma(), property, receiver);
  },
});
