import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: "apps/backend/.env" });

export default defineConfig({
  schema: "apps/backend/prisma/schema.prisma",
  migrations: {
    path: "apps/backend/prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
