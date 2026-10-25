const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTs(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const loaded = new Module(filename, module);
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = (id) => id in mocks ? mocks[id] : original(id);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}
const helperPath = "apps/backend/src/services/bucketCapacity.ts";
const limits = loadTs("packages/types/src/storage-limits.ts");
const capacity = loadTs(helperPath, { "../utils/prisma": { prisma: {} }, "@repo/types": limits });
const mb = 1024 ** 2;
const error = (message, status) => Object.assign(new Error(message), { statusCode: status });
const bucket = (id, config = {}, used = 0, pending = 0) => ({
  id, providerName: "s3", config,
  fileObjects: [{ node: { sizeBytes: BigInt(used) } }],
  uploadSessions: [{ sizeBytes: BigInt(pending) }],
});
const choose = (buckets, size) => capacity.chooseUploadBucket(buckets, size, error);

test("500 MB per-file cap accepts the boundary and rejects one byte over", () => {
  const limited = bucket("limited", { maxFileSizeMb: 500 });
  assert.equal(choose([limited], 500 * mb).id, "limited");
  assert.throws(() => choose([limited], 500 * mb + 1), { statusCode: 413 });
});
test("larger file skips least-used bucket with lower per-file cap", () => {
  assert.equal(choose([
    bucket("limited", { maxFileSizeMb: 500 }),
    bucket("larger", {}, 100 * mb),
  ], 600 * mb).id, "larger");
});
test("capacity accounts for stored files, trash and in-progress reservations", () => {
  const full = bucket("full", { quotaGb: 1 }, 600 * mb, 300 * mb);
  assert.equal(choose([full], 124 * mb).id, "full");
  assert.throws(() => choose([full], 124 * mb + 1), { statusCode: 507 });
  assert.equal(choose([full, bucket("free")], 200 * mb).id, "free");
});
test("global cap, empty buckets, zero byte files and default quota", () => {
  assert.throws(() => choose([bucket("a")], capacity.MAX_UPLOAD_BYTES + 1), { statusCode: 413 });
  assert.throws(() => choose([], 1), { statusCode: 503 });
  assert.equal(choose([bucket("a")], 0).id, "a");
  assert.throws(() => choose([bucket("a", {}, 5 * 1024 ** 3)], 1), { statusCode: 507 });
  for (const size of [NaN, -1, Infinity, 1.5]) {
    assert.throws(() => choose([bucket("a")], size), { statusCode: 400 });
  }
});
test("optional per-file limit uses researched provider defaults and supports overrides", () => {
  for (const provider of Object.keys(limits.DEFAULT_MAX_FILE_SIZE_MB)) {
    const b = { ...bucket(provider, { quotaGb: 100 }), providerName: provider };
    const defaultBytes = limits.defaultMaxFileSizeMb(provider) * mb;
    assert.equal(choose([b], defaultBytes).id, provider);
    assert.throws(() => choose([b], defaultBytes + 1), { statusCode: 413 });
    b.config.maxFileSizeMb = null;
    assert.equal(choose([b], defaultBytes).id, provider);
  }
  const paid = { ...bucket("paid", { maxFileSizeMb: 500 }), providerName: "supabase" };
  assert.equal(choose([paid], 500 * mb).id, "paid");
  const stricter = bucket("stricter", { maxFileSizeMb: 10 });
  assert.throws(() => choose([stricter], 11 * mb), { statusCode: 413 });
});
test("folder larger than a bucket spans buckets while preserving nested logical paths", async () => {
  const { createFolderResolver, runUploadQueue } = loadTs("apps/frontend/lib/folder-upload.ts");
  const folders = new Map();
  const resolveFolder = createFolderResolver(null, async (name, parentId) => {
    const parentPath = parentId ? folders.get(parentId) : "";
    const id = `folder-${folders.size}`;
    folders.set(id, `${parentPath}/${name}`);
    return id;
  });
  const buckets = [bucket("a", { quotaGb: 1, maxFileSizeMb: 500 }), bucket("b", { quotaGb: 1, maxFileSizeMb: 500 })];
  const files = ["album/a.dat", "album/nested/b.dat", "album/nested/c.dat"];
  const stored = [];
  await runUploadQueue(files, async (path) => {
    const parentId = await resolveFolder(path);
    const destination = choose(buckets, 400 * mb);
    destination.uploadSessions.push({ sizeBytes: BigInt(400 * mb) });
    stored.push({ bucketId: destination.id, path: `${folders.get(parentId)}/${path.split("/").at(-1)}` });
  });
  assert.equal(new Set(stored.map((file) => file.bucketId)).size, 2);
  assert.deepEqual(stored.map((file) => file.path).sort(), files.map((path) => `/${path}`).sort());
  assert.equal(folders.size, 2);
});
test("connection schema validates, preserves and clears per-file limits", () => {
  const { storageConnectionSchemas } = loadTs("apps/backend/src/utils/storageschemas.ts");
  const input = { provider: "s3", bucketName: "bucket", accessKeyId: "key", secretAccessKey: "secret", region: "region" };
  assert.equal(storageConnectionSchemas.s3.parse({ ...input, maxFileSizeMb: 500 }).maxFileSizeMb, 500);
  assert.equal(storageConnectionSchemas.s3.parse({ ...input, maxFileSizeMb: null }).maxFileSizeMb, null);
  for (const size of [0, -1, Infinity]) {
    assert.equal(storageConnectionSchemas.s3.safeParse({ ...input, maxFileSizeMb: size }).success, false);
  }
});
test("simultaneous admission reserves space before another upload selects a bucket", async () => {
  const b = bucket("one", { quotaGb: 1 });
  b.uploadSessions = [];
  let tail = Promise.resolve();
  let locked = false;
  const prisma = {
    async $transaction(fn) {
      let release;
      const previous = tail;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        return await fn({
          async $queryRaw() { locked = true; },
          bucket: { async findMany() { assert.equal(locked, true); return [b]; } },
          uploadSession: { async create({ data }) { b.uploadSessions.push(data); return { ...data, bucket: b }; } },
        });
      } finally { locked = false; release(); }
    },
  };
  const { reserveUpload } = loadTs(helperPath, { "../utils/prisma": { prisma }, "@repo/types": limits });
  const input = { userId: "u", driveId: "d", fileName: "f", sizeBytes: 600 * mb, partSizeBytes: 8 * mb, objectKey: "key" };
  const results = await Promise.allSettled([reserveUpload(input, error), reserveUpload(input, error)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.statusCode, 507);
});

for (const multipart of [false, true]) {
  test(`${multipart ? "multipart" : "regular"} upload releases reservation when provider setup fails`, async () => {
    const updates = [];
    const service = loadTs(`apps/backend/src/services/${multipart ? "uploadSessionService" : "storageService"}.ts`, {
      "./bucketCapacity": { ...capacity, async reserveUpload() {
        return { id: "reservation", bucket: { id: "b", bucketName: "bucket", config: {} } };
      } },
      "../utils/prisma": { prisma: {
        drive: { async findFirst() { return { id: "drive" }; } },
        node: { async findUnique() { return null; } },
        uploadSession: { async update(input) { updates.push(input); } },
      } },
      "../utils/s3": { createS3Client() { throw new Error("Invalid provider configuration"); } },
      "../generated/prisma/client": { Prisma: {} },
      "../utils/storageschemas": loadTs("apps/backend/src/utils/storageschemas.ts"),
    });
    await assert.rejects((multipart ? service.initiateMultipartUpload : service.uploadFile)({
      userId: "u", fileName: "f", originalName: "f", mimeType: "text/plain", sizeBytes: 1,
      fileBuffer: { byteLength: 1 },
    }), /Invalid provider configuration/);
    assert.equal(updates[0].where.id, "reservation");
    assert.equal(updates[0].data.status, "FAILED");
  });
  test(`${multipart ? "multipart" : "regular"} upload rejects incompatible bucket before provider I/O`, async () => {
    let providerCalls = 0;
    const mockCapacity = { ...capacity, async reserveUpload(input, makeError) {
      return chooseWithError(input, makeError);
    } };
    function chooseWithError(input, makeError) {
      return capacity.chooseUploadBucket([bucket("limited", { maxFileSizeMb: 500 })], input.sizeBytes, makeError);
    }
    const service = loadTs(`apps/backend/src/services/${multipart ? "uploadSessionService" : "storageService"}.ts`, {
      "./bucketCapacity": mockCapacity,
      "../utils/prisma": { prisma: {
        drive: { async findFirst() { return { id: "drive" }; } },
        node: { async findUnique() { return null; } },
      } },
      "../utils/s3": { createS3Client() { providerCalls++; throw new Error("Unexpected provider call"); } },
      "../generated/prisma/client": { Prisma: {} },
      "../utils/storageschemas": loadTs("apps/backend/src/utils/storageschemas.ts"),
    });
    const fn = multipart ? service.initiateMultipartUpload : service.uploadFile;
    await assert.rejects(fn({ userId: "u", fileName: "f", originalName: "f", mimeType: "text/plain",
      sizeBytes: 501 * mb, fileBuffer: { byteLength: 501 * mb } }), { statusCode: 413 });
    assert.equal(providerCalls, 0);
  });
}

test("editing unrelated connection fields preserves limits and null clears per-file cap", async () => {
  let saved;
  const existing = { id: "b", providerName: "s3", bucketName: "bucket", isActive: true,
    config: { accessKeyId: "key", secretAccessKey: "secret", region: "us-east-1", quotaGb: 1, maxFileSizeMb: 500 } };
  const service = loadTs("apps/backend/src/services/storageService.ts", {
    "./bucketCapacity": capacity,
    "../utils/prisma": { prisma: { bucket: {
      async findUnique() { return existing; },
      async update({ data }) { saved = data.config; return { ...existing, ...data }; },
    } } },
    "../utils/s3": {},
    "../generated/prisma/client": { Prisma: {} },
    "../utils/storageschemas": loadTs("apps/backend/src/utils/storageschemas.ts"),
  });
  await service.updateStorageConnection({ id: "b", input: { displayName: "Renamed" } });
  assert.equal(saved.quotaGb, 1);
  assert.equal(saved.maxFileSizeMb, 500);
  await service.updateStorageConnection({ id: "b", input: { maxFileSizeMb: null } });
  assert.equal(saved.maxFileSizeMb, undefined);
  assert.equal(saved.quotaGb, 1);
});
