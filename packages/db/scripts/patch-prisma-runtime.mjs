import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolves relative to packages/db/scripts/ (3 levels up is root)
const clientPath = resolve(__dirname, "../../../apps/backend/src/generated/prisma/client.ts");

let source;
try {
  source = readFileSync(clientPath, "utf8");
} catch {
  console.warn("Backend generated client not found — skipping patch. Run db:generate:backend first.");
  process.exit(0);
}

const oldImport = 'import * as runtime from "@prisma/client/runtime/client"';
const newImport = 'import * as runtime from "@prisma/client/runtime/client.js"';

if (source.includes(newImport)) {
  console.log("Prisma runtime import already patched.");
  process.exit(0);
}

if (!source.includes(oldImport)) {
  console.warn("Expected Prisma runtime import was not found; no changes applied.");
  process.exit(0);
}

writeFileSync(clientPath, source.replace(oldImport, newImport), "utf8");
console.log("Patched Prisma runtime import for Cloudflare Workers compatibility.");
