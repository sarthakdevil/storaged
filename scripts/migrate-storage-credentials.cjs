// Audit by default; pass --apply after deploying encryption-aware readers.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const dotenv = require("dotenv");
const { Client } = require("pg");
const root = path.resolve(__dirname, "..");
const env = { ...dotenv.parse(fs.readFileSync(path.join(root, "apps/backend/.env"))),
  ...dotenv.parse(fs.readFileSync(path.join(root, "apps/backend/.dev.vars"))), ...process.env };
const filename = path.join(root, "apps/backend/src/utils/credentialEncryption.ts");
const loaded = new Module(filename, module);
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { encryptCredentials, decryptCredentials } = loaded.exports;
(async () => {
  const db = new Client({ connectionString: env.DIRECT_URL || env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    await db.connect();
    await db.query("BEGIN");
    const { rows } = await db.query('SELECT id,config FROM "Bucket" ORDER BY id FOR UPDATE');
    let migrated = 0;
    for (const row of rows) {
      if (row.config.encryptedCredentials) { decryptCredentials(row.config, env.STORAGE_ENCRYPTION_KEY); continue; }
      const encrypted = encryptCredentials(row.config, env.STORAGE_ENCRYPTION_KEY);
      if (process.argv.includes("--apply")) {
        await db.query('UPDATE "Bucket" SET config=$1::jsonb,"updatedAt"=NOW() WHERE id=$2', [JSON.stringify(encrypted), row.id]);
      }
      migrated++;
    }
    await db.query(process.argv.includes("--apply") ? "COMMIT" : "ROLLBACK");
    console.log(JSON.stringify({ buckets: rows.length, plaintextCredentials: migrated, applied: process.argv.includes("--apply") }));
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("Credential migration failed:", error.message); process.exitCode = 1;
  } finally { await db.end(); }
})();
