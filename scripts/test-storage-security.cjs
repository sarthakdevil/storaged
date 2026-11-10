const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
function loadTs(relative, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const loaded = new Module(filename, module);
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = (id) => id in mocks ? mocks[id] : original(id);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}
const encryption = loadTs("apps/backend/src/utils/credentialEncryption.ts");
const key = "12".repeat(32);
const config = { region: "us-east-1", endpointUrl: "https://s3.example.test", forcePathStyle: true,
  accessKeyId: "private-access-id", secretAccessKey: "private-secret-value", quotaGb: 5 };
test("AES-GCM encrypts both credentials, preserves metadata, and uses fresh nonces", () => {
  const a = encryption.encryptCredentials(config, key), b = encryption.encryptCredentials(config, key);
  assert.equal(a.accessKeyId, undefined); assert.equal(a.secretAccessKey, undefined);
  assert.equal(a.quotaGb, 5);
  assert.ok(!JSON.stringify(a).includes(config.secretAccessKey));
  assert.ok(!JSON.stringify(a).includes(config.accessKeyId));
  assert.notEqual(a.encryptedCredentials.iv, b.encryptedCredentials.iv);
  assert.deepEqual(encryption.decryptCredentials(a, key), config);
  assert.throws(() => encryption.decryptCredentials(a, "34".repeat(32)));
  a.encryptedCredentials.tag = Buffer.alloc(16).toString("base64");
  assert.throws(() => encryption.decryptCredentials(a, key));
});
test("encryption fails closed without a strong key and legacy configs remain readable during migration", () => {
  for (const bad of [undefined, "", "123", "zz".repeat(32)]) assert.throws(() => encryption.encryptCredentials(config, bad));
  assert.deepEqual(encryption.decryptCredentials(config), config);
  assert.throws(() => encryption.decryptCredentials({ encryptedCredentials: {} }, key));
});
function accessFixture(role = "USER", active = true) {
  const filters = [];
  const prisma = {
    user: { async findUnique() { return { role, isActive: active }; } },
    bucket: { async findFirst({ where }) { filters.push(where); return !where.ownerId || where.ownerId === "owner" ? { id: "bucket" } : null; } },
  };
  return { prisma, filters, access: loadTs("apps/backend/src/services/storageAccess.ts", { "../utils/prisma": { prisma } }) };
}
test("owners can manage their buckets and other users receive 404", async () => {
  const { access, filters } = accessFixture();
  await access.requireStorageAccess("owner", "bucket");
  await assert.rejects(access.requireStorageAccess("stranger", "bucket"), { statusCode: 404 });
  assert.deepEqual(filters[1], { id: "bucket", ownerId: "stranger" });
});
test("only active admins have a global storage management scope", async () => {
  assert.deepEqual(await accessFixture("ADMIN").access.storageManagementScope("admin"), {});
  await accessFixture("ADMIN").access.requireStorageAccess("admin", "bucket");
  await assert.rejects(accessFixture("ADMIN", false).access.storageManagementScope("admin"), { statusCode: 403 });
});
function storageService(prisma, access) {
  return loadTs("apps/backend/src/services/storageService.ts", {
    "../utils/prisma": { prisma }, "./storageAccess": access, "./chunkDownload": {},
    "../generated/prisma/client": { Prisma: {} }, "./bucketCapacity": {},
    "../utils/credentialEncryption": encryption, "../utils/runtimeEnv": { getRuntimeValue() { return key; } },
    "../utils/s3": { getDecryptedBucketConfig(c) { return encryption.decryptCredentials(c, key); } },
    "../utils/storageschemas": loadTs("apps/backend/src/utils/storageschemas.ts"),
  });
}
test("storage creation assigns the caller, encrypts persistence and never returns secret or ciphertext", async () => {
  const { access, prisma } = accessFixture(); let saved;
  prisma.bucket.create = async ({ data }) => { saved = data; return { ...data, id: "bucket", createdAt: new Date(), updatedAt: new Date() }; };
  const service = storageService(prisma, access);
  const result = await service.createStorageConnection({ ...config, provider: "s3", bucketName: "bucket" }, "owner");
  assert.equal(saved.ownerId, "owner");
  assert.equal(saved.config.secretAccessKey, undefined);
  assert.equal(saved.config.accessKeyId, undefined);
  assert.equal(result.config.secretAccessKey, undefined);
  assert.equal(result.config.encryptedCredentials, undefined);
  assert.equal(result.config.accessKeyId, config.accessKeyId);
});
test("list/dashboard queries filter by owner while admins can view all", async () => {
  for (const role of ["USER", "ADMIN"]) {
    const { access, prisma } = accessFixture(role); const filters = [];
    prisma.bucket.findMany = async ({ where }) => { filters.push(where); return []; };
    const service = storageService(prisma, access);
    await service.listStorageConnections(undefined, "owner");
    await service.getStorageDashboard(undefined, "owner");
    assert.deepEqual(filters, [role === "ADMIN" ? {} : { ownerId: "owner" }, role === "ADMIN" ? {} : { ownerId: "owner" }]);
  }
});
test("foreign storage read/update/delete fail before touching credentials or deleting anything", async () => {
  const { access, prisma } = accessFixture();
  const service = storageService(prisma, access);
  await assert.rejects(service.getStorageConnection("bucket", "stranger"), { statusCode: 404 });
  await assert.rejects(service.updateStorageConnection({ id: "bucket", input: {} }, "stranger"), { statusCode: 404 });
  await assert.rejects(service.deleteStorageConnection("bucket", "stranger"), { statusCode: 404 });
});
for (const outcome of ["success", "transient", "terminal", "dead-letter"]) {
  test(`queue ${outcome} handles acknowledgments and retries correctly`, async () => {
    let ack = 0, retry = 0, updates = [];
    const service = loadTs("apps/backend/src/services/uploadFinalization.ts", {
      "../utils/prisma": { prisma: { uploadSession: { async updateMany(input) { updates.push(input); } } } },
      "./uploadSessionService": { isUploadError(e) { return typeof e.statusCode === "number"; },
        async finalizeUploadNow() {
          if (outcome === "transient") throw new Error("Temporary storage failure");
          if (outcome === "terminal") throw Object.assign(new Error("Invalid parts"), { statusCode: 409 });
        } },
    });
    await service.consumeFinalizations({ queue: outcome === "dead-letter" ? "storaged-upload-finalize-dlq" : "storaged-upload-finalize",
      messages: [{ body: { uploadSessionId: "session" }, attempts: 2, ack() { ack++; }, retry(options) { retry++; assert.ok(options.delaySeconds > 0); } }] });
    assert.equal(ack, outcome === "transient" ? 0 : 1);
    assert.equal(retry, outcome === "transient" ? 1 : 0);
    if (outcome === "dead-letter") {
      assert.deepEqual(updates[0].where, { id: "session", status: "COMPLETING" });
      assert.equal(updates[0].data.status, "FAILED");
    }
  });
}
test("recovery republishes stale completing uploads and only touches successfully enqueued sessions", async () => {
  const sent = [], updated = [];
  const service = loadTs("apps/backend/src/services/uploadFinalization.ts", {
    "./uploadSessionService": {}, "../utils/prisma": { prisma: { uploadSession: {
      async findMany({ where }) { assert.equal(where.status, "COMPLETING"); assert.ok(where.updatedAt.lt < new Date()); return [{ id: "one" }, { id: "two" }]; },
      async updateMany({ where }) { updated.push(where.id); },
    } } },
  });
  await assert.rejects(service.recoverPendingFinalizations({ async send(body) { sent.push(body.uploadSessionId); if (body.uploadSessionId === "two") throw new Error("Queue unavailable"); } }));
  assert.deepEqual(sent, ["one", "two"]); assert.deepEqual(updated, ["one"]);
});

test("upload admission selects only the requesting owner's active buckets", async () => {
  let filter;
  const capacity = loadTs("apps/backend/src/services/bucketCapacity.ts", {
    "@repo/types": loadTs("packages/types/src/storage-limits.ts"),
    "../utils/prisma": { prisma: { async $transaction(fn) { return fn({
      async $queryRaw() {}, bucket: { async findMany({ where }) { filter = where; return []; } },
    }); } } },
  });
  await assert.rejects(capacity.reserveUpload({ userId: "owner", driveId: "drive", fileName: "file",
    sizeBytes: 1, partSizeBytes: 8, objectKey: "key", distributed: true },
    (message, statusCode) => Object.assign(new Error(message), { statusCode })), { statusCode: 503 });
  assert.deepEqual(filter, { isActive: true, ownerId: "owner" });
});

for (const transient of [true, false]) {
  test(`finalization ${transient ? "provider failure remains retryable" : "invalid bytes fail permanently"}`, async () => {
    let update;
    const bucket = { bucketName: "bucket", config: {} };
    const session = { id: "session", status: "COMPLETING", bucket, chunks: [{ bucket,
      sizeBytes: 1n, partNumber: 1, objectKey: "chunk" }], completedParts: [{ partNumber: 1, etag: "etag" }] };
    const service = loadTs("apps/backend/src/services/uploadSessionService.ts", {
      "./bucketCapacity": {}, "../generated/prisma/client": { Prisma: {} },
      "../utils/prisma": { prisma: { uploadSession: {
        async findUnique() { return session; }, async updateMany({ data }) { update = data; },
      } } },
      "../utils/s3": { getDecryptedBucketConfig: (c) => c, createS3Client() { return { async send() {
        if (transient) throw new Error("ServiceUnavailable");
        return { ContentLength: 2, ETag: "etag" };
      } }; } },
    });
    await assert.rejects(service.finalizeUploadNow({ uploadSessionId: "session" }));
    assert.equal(update.status, transient ? "COMPLETING" : "FAILED");
  });
}
