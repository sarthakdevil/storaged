import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: "apps/backend/.env" });

export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: {
    path: "packages/db/prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
