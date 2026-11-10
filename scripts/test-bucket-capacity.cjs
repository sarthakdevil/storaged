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
  loaded.require = (id) => {
    if (id in mocks) return id === "../utils/s3" ? { getDecryptedBucketConfig: (c) => c, ...mocks[id] } : mocks[id];
    if (id === "./chunkDownload") return {};
    if (id === "./storageAccess") return { async storageManagementScope() { return { ownerId: "u" }; }, async requireStorageAccess() {} };
    if (id === "../utils/credentialEncryption") return { encryptCredentials: (c) => c };
    if (id === "../utils/runtimeEnv" || id === "./runtimeEnv") return { getRuntimeValue() {} };
    if (id === "./credentialEncryption") return loadTs("apps/backend/src/utils/credentialEncryption.ts");
    return original(id);
  };
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

test("overlapping requests keep independent database clients and cleanup", async () => {
  const pools = [];
  class Pool {
    constructor() { this.ended = false; pools.push(this); }
    async end() { this.ended = true; }
  }
  class PrismaClient {
    constructor({ adapter }) { this.pool = adapter.pool; }
    async $disconnect() {}
    identify() { return this.pool; }
  }
  const service = loadTs("apps/backend/src/utils/prisma.ts", {
    pg: { Pool }, "@prisma/adapter-pg": { PrismaPg: class { constructor(pool) { this.pool = pool; } } },
    "../generated/prisma/client": { PrismaClient }, "./logger": { logger: { info() {} } },
    "./runtimeEnv": { getRuntimeValue() { return "postgres://test"; } },
  });
  let release, ready;
  const started = new Promise((resolve) => { ready = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  const first = service.withPrismaContext(async () => {
    const client = service.configurePrisma("postgres://test");
    ready(); await hold;
    assert.equal(service.getPrisma(), client);
    assert.equal(service.prisma.identify(), pools[0]);
    assert.equal(pools[0].ended, false);
    await service.disconnectPrisma();
  });
  await started;
  await service.withPrismaContext(async () => {
    service.configurePrisma("postgres://test");
    assert.equal(service.prisma.identify(), pools[1]);
    await service.disconnectPrisma();
  });
  release(); await first;
  assert.equal(pools.length, 2);
  assert.ok(pools.every((pool) => pool.ended));
  assert.throws(() => service.getPrisma(), /requires a request context/);
});

for (const kind of ["stored files", "legacy uploads", "distributed uploads", "empty"]) {
  test(`storage removal protects ${kind}`, async () => {
    let deleted = false;
    const service = loadTs("apps/backend/src/services/storageService.ts", {
      "../utils/prisma": { prisma: { async $transaction(fn) { return fn({
        async $queryRaw() {},
        bucket: { async findUnique() { return { id: "b" }; }, async delete() { deleted = true; } },
        fileObject: { async count() { return kind === "stored files" ? 1 : 0; } },
        uploadSession: { async count() { return kind === "legacy uploads" ? 1 : 0; } },
        uploadChunk: { async count() { return kind === "distributed uploads" ? 1 : 0; }, async deleteMany() {} },
      }); } } },
      "./bucketCapacity": capacity, "../utils/s3": {}, "../generated/prisma/client": { Prisma: {} },
      "../utils/storageschemas": loadTs("apps/backend/src/utils/storageschemas.ts"),
    });
    if (kind === "empty") await service.deleteStorageConnection("b");
    else await assert.rejects(service.deleteStorageConnection("b"), { statusCode: 409 });
    assert.equal(deleted, kind === "empty");
  });
}

test("browser upload URLs do not sign an empty-body checksum", async () => {
  const { createS3Client } = loadTs("apps/backend/src/utils/s3.ts");
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  const client = createS3Client({ endpointUrl: "https://storage.example.test", region: "us-east-1",
    accessKeyId: "test", secretAccessKey: "test", forcePathStyle: true }, true);
  try {
    const url = new URL(await getSignedUrl(client, new PutObjectCommand({Bucket: "bucket", Key: "chunk", ContentLength: 16})));
    assert.equal(url.searchParams.has("x-amz-checksum-crc32"), false);
    assert.equal(url.searchParams.has("x-amz-sdk-checksum-algorithm"), false);
    assert.ok(url.searchParams.get("X-Amz-SignedHeaders").includes("content-length"));
  } finally { client.destroy(); }
});

test("a single file spans buckets even when it exceeds every object limit", () => {
  const buckets = [bucket("a", { quotaGb: 1, maxFileSizeMb: 50 }), bucket("b", { quotaGb: 2, maxFileSizeMb: 50 })];
  const plan = capacity.planUploadChunks(buckets, 2500 * mb, 32 * mb, error);
  assert.equal(plan.chunks.reduce((sum, c) => sum + c.sizeBytes, 0), 2500 * mb);
  assert.equal(new Set(plan.chunks.map((c) => c.bucketId)).size, 2);
  assert.equal(plan.chunks[0].bucketId, "b");
  for (const b of buckets) {
    const chunks = plan.chunks.filter((c) => c.bucketId === b.id);
    assert.ok(chunks.every((c) => c.sizeBytes <= 50 * mb));
    assert.ok(chunks.reduce((n, c) => n + c.sizeBytes, 0) <= b.config.quotaGb * 1024 ** 3);
  }
});

test("chunk planning shrinks slices and accounts for physical bytes and pending chunks", () => {
  const a = bucket("a", { quotaGb: 1, maxFileSizeMb: 1 }, 1020 * mb);
  a.fileObjects = [{ sizeBytes: BigInt(1020 * mb), node: { sizeBytes: BigInt(2000 * mb) } }];
  a.uploadChunks = [{ sizeBytes: BigInt(mb) }];
  const plan = capacity.planUploadChunks([a], 3 * mb, 8 * mb, error);
  assert.ok(plan.partSizeBytes <= mb);
  assert.equal(plan.chunks.reduce((n, c) => n + c.sizeBytes, 0), 3 * mb);
  assert.throws(() => capacity.planUploadChunks([a], 4 * mb, 8 * mb, error), { statusCode: 507 });
});

test("range parsing handles cross-chunk, suffix and invalid requests", () => {
  const { parseByteRange } = loadTs("apps/backend/src/services/chunkDownload.ts", {
    "@repo/auth": {}, "../utils/prisma": {}, "../utils/runtimeEnv": {}, "../utils/s3": {},
  });
  assert.deepEqual(parseByteRange("bytes=2-8", 10), { start: 2, end: 8, partial: true });
  assert.deepEqual(parseByteRange("bytes=-3", 10), { start: 7, end: 9, partial: true });
  assert.deepEqual(parseByteRange("bytes=5-", 10), { start: 5, end: 9, partial: true });
  for (const header of ["bytes=10-", "bytes=8-2", "bytes=0-1,4-5", "bytes=-0", "bytes=-"]) {
    assert.equal(parseByteRange(header, 10), null);
  }
});

test("download streams ordered bytes across buckets and supports ranges", async () => {
  const source = [Buffer.from("hello"), Buffer.from("world")];
  const node = { id: "n", name: "file.txt", mimeType: "text/plain", sizeBytes: 10n,
    fileObjects: source.map((bytes, index) => ({ chunkIndex: index + 1, sizeBytes: BigInt(bytes.length),
      objectKey: String(index), bucket: { bucketName: `bucket-${index}`, config: {} } })) };
  const service = loadTs("apps/backend/src/services/chunkDownload.ts", {
    "@repo/auth": { async verifyJwt() { return { purpose: "file-content", nodeId: "n", exp: Date.now() / 1000 + 60 }; } },
    "../utils/prisma": { prisma: { node: { async findFirst() { return node; } } } },
    "../utils/runtimeEnv": { getRuntimeValue() { return "secret"; } },
    "../utils/s3": { createS3Client() { return {}; } },
    "@aws-sdk/s3-request-presigner": { async getSignedUrl(_, command) { return `https://bucket.test/${command.input.Key}`; } },
  });
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const index = Number(new URL(url).pathname.slice(1));
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
    return new Response(source[index].subarray(Number(start), Number(end) + 1), {
      status: 206, headers: { "content-range": `bytes ${start}-${end}/5` },
    });
  };
  try {
    const full = await service.streamChunkDownload("token", new Request("https://app.test"));
    assert.equal(await full.text(), "helloworld");
    const range = await service.streamChunkDownload("token", new Request("https://app.test", { headers: { range: "bytes=3-6" } }));
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), "bytes 3-6/10");
    assert.equal(await range.text(), "lowo");
  } finally { global.fetch = originalFetch; }
});

test("completion rejects duplicate or missing chunks before mutating the session", async () => {
  const service = loadTs("apps/backend/src/services/uploadSessionService.ts", {
    "../utils/prisma": { prisma: { uploadSession: { async findFirst() {
      return { id: "s", sizeBytes: 10n, partSizeBytes: 5, status: "UPLOADING" };
    } } } },
    "../utils/s3": {}, "./bucketCapacity": {}, "../generated/prisma/client": { Prisma: {} },
  });
  for (const parts of [[{ partNumber: 1, etag: "a" }], [{ partNumber: 1, etag: "a" }, { partNumber: 1, etag: "b" }]]) {
    await assert.rejects(service.requestUploadCompletion({ userId: "u", uploadSessionId: "s", parts }), { statusCode: 400 });
  }
});

test("finalization verifies chunks and commits one logical file with an ordered manifest", async () => {
  const writes = [];
  const chunks = [1, 2].map((partNumber) => ({ partNumber, bucketId: `b${partNumber}`,
    objectKey: `chunk-${partNumber}`, sizeBytes: 5n, bucket: { bucketName: `b${partNumber}`, config: {} } }));
  const session = { id: "s", status: "COMPLETING", chunks, sizeBytes: 10n, bucketId: "b1",
    bucket: chunks[0].bucket, fileName: "file.txt", driveId: "d", userId: "u",
    completedParts: chunks.map((c) => ({ partNumber: c.partNumber, etag: `etag-${c.partNumber}` })) };
  const tx = {
    async $queryRaw() {},
    node: { async create({ data }) { writes.push(data); return { id: "node", ...data }; } },
    fileObject: { async createMany({ data }) { writes.push(data); } },
    drive: { async update() {} },
    uploadSession: { async findUniqueOrThrow() { return session; }, async update({ data }) { writes.push(data); } },
  };
  const service = loadTs("apps/backend/src/services/uploadSessionService.ts", {
    "../utils/prisma": { prisma: { uploadSession: { async findUnique() { return session; } },
      node: { async findUnique() { return null; } }, async $transaction(fn) { return fn(tx); } } },
    "../utils/s3": { createS3Client() { return { async send(command) {
      const index = Number(command.input.Key.split("-")[1]);
      return { ContentLength: 5, ETag: `etag-${index}` };
    } }; } },
    "./bucketCapacity": {}, "../generated/prisma/client": { Prisma: {} },
  });
  assert.deepEqual(await service.finalizeUploadNow({ uploadSessionId: "s" }), { nodeId: "node", completed: true });
  assert.equal(writes[0].sizeBytes, 10n);
  assert.deepEqual(writes[1].map((c) => [c.chunkIndex, c.bucketId, c.sizeBytes]), [[1, "b1", 5n], [2, "b2", 5n]]);
  assert.equal(writes[2].status, "COMPLETED");
});

test("concurrent distributed admissions reserve all buckets atomically", async () => {
  const buckets = [bucket("a", { quotaGb: 1 }), bucket("b", { quotaGb: 1 })];
  for (const b of buckets) { b.uploadSessions = []; b.uploadChunks = []; }
  let tail = Promise.resolve();
  const prisma = { async $transaction(fn) {
    let release;
    const previous = tail;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await fn({
      async $queryRaw() {}, bucket: { async findMany() { return buckets; } },
      uploadSession: { async create({ data }) {
        for (const chunk of data.chunks.create) buckets.find((b) => b.id === chunk.bucketId).uploadChunks.push(chunk);
        return data;
      } },
    }); } finally { release(); }
  } };
  const service = loadTs(helperPath, { "../utils/prisma": { prisma }, "@repo/types": limits });
  const input = { userId: "u", driveId: "d", fileName: "f", sizeBytes: 1200 * mb,
    partSizeBytes: 8 * mb, objectKey: "key", distributed: true };
  const results = await Promise.allSettled([service.reserveUpload(input, error), service.reserveUpload(input, error)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.statusCode, 507);
  assert.ok(buckets.every((b) => b.uploadChunks.length > 0));
});

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
