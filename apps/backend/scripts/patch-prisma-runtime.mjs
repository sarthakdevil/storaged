import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const clientPath = resolve("src/generated/prisma/client.ts");
const source = readFileSync(clientPath, "utf8");
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
