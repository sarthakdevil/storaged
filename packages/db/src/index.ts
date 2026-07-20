// @repo/db — re-export everything consumers need.
// After running `npm run db:generate` in packages/db, each app's generated
// client will be in its own src/generated/ folder. This index just provides
// a shared entry point for tooling and type re-exports.

// Re-export the Prisma namespace (enums, etc.) from the backend client.
// Apps should import their own PrismaClient from their local generated folder.
export type { Prisma } from "../../../apps/backend/src/generated/prisma/client.js";
