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
  loaded.require = (id) => (id in mocks ? mocks[id] : original(id));
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const { selectFiles, readDroppedFiles, createFolderResolver, runUploadQueue } =
  loadTs("apps/frontend/lib/folder-upload.ts");
const fileEntry = (name) => ({
  name,
  isFile: true,
  file: (done) => done(new File(["contents"], name)),
});

test("dialog uploads nested files and retries failures without duplicating successful files or folders", async () => {
  const React = require("react");
  const helpers = loadTs("apps/frontend/lib/folder-upload.ts");
  const queue = ["a.txt", "b.txt"].map((name) => ({
    file: new File([name], name),
    path: `project/nested/${name}`,
    status: "pending",
  }));
  const states = [];
  const refs = [];
  let cursor = 0;
  let refCursor = 0;
  const folders = [];
  const uploads = [];
  let fail = true;
  const Button = () => null;
  const { UploadModal } = loadTs("apps/frontend/components/UploadModal.tsx", {
    react: {
      ...React,
      useState(value) {
        const i = cursor++;
        if (!(i in states)) states[i] = i === 0 ? queue : value;
        return [
          states[i],
          (next) => {
            states[i] = typeof next === "function" ? next(states[i]) : next;
          },
        ];
      },
      useRef(current) {
        const i = refCursor++;
        return (refs[i] ||= { current });
      },
      useEffect() {},
    },
    "lucide-react": { X: () => null, Loader2: () => null },
    "@tanstack/react-query": {
      useQueryClient: () => ({ invalidateQueries() {} }),
    },
    "@repo/ui": {
      useToast: () => ({ toast() {} }),
      Button,
      formatSize: String,
      Dialog: "div",
      DialogContent: "div",
      DialogTitle: "div",
      DialogHeader: "div",
    },
    "../lib/folder-upload": helpers,
    "../lib/api": {
      api: {
        post: async (_, body) => {
          folders.push(body);
          return { id: `${body.parentId || ""}/${body.name}` };
        },
      },
      ApiError: class extends Error {},
    },
    "../lib/queries": {
      keys: {},
      useMultipartUploadFile: () => ({}),
      useUploadFile: () => ({
        mutateAsync: async ({ parentId, file }) => {
          uploads.push([parentId, file.name, await file.text()]);
          if (file.name === "b.txt" && fail) {
            fail = false;
            throw new Error("offline");
          }
        },
      }),
    },
  });
  function render() {
    cursor = 0;
    refCursor = 0;
    return UploadModal({ parentId: "destination", onClose() {} });
  }
  function findUpload(element) {
    if (!element || typeof element !== "object") return;
    if (element.type === Button && !element.props.variant) return element;
    for (const child of React.Children.toArray(element.props?.children)) {
      const match = findUpload(child);
      if (match) return match;
    }
  }
  await findUpload(render()).props.onClick();
  assert.deepEqual(
    states[0].map((item) => item.status),
    ["done", "error"],
  );
  assert.equal(states[0][1].error, "offline");
  await findUpload(render()).props.onClick();
  assert.deepEqual(
    states[0].map((item) => item.status),
    ["done", "done"],
  );
  assert.equal(folders.length, 2);
  assert.deepEqual(
    uploads.map((item) => item[1]),
    ["a.txt", "b.txt", "b.txt"],
  );
  assert.ok(
    uploads.every(([parent]) => parent === "destination/project/nested"),
  );
  assert.deepEqual(
    uploads.map((item) => item[2]),
    ["a.txt", "b.txt", "b.txt"],
  );
});

test("multipart failure aborts storage session after three attempts", async () => {
  let mutation;
  const calls = [];
  let puts = 0;
  const originalFetch = global.fetch;
  const hooks = loadTs("apps/frontend/lib/queries.ts", {
    "@tanstack/react-query": {
      useQueryClient: () => ({}),
      useMutation: (options) => {
        mutation = options.mutationFn;
      },
    },
    "next/navigation": {},
    "@repo/ui": {},
    "./api": {
      api: {
        post: async (route) => {
          calls.push(route);
          if (route.endsWith("/initiate"))
            return { uploadSessionId: "failed", partSizeBytes: 4 };
          return { url: "https://storage.test/part" };
        },
      },
    },
  });
  global.fetch = async () => {
    puts++;
    throw new Error("offline");
  };
  try {
    hooks.useMultipartUploadFile(true);
    await assert.rejects(
      mutation({ parentId: null, file: new File(["contents"], "a.txt") }),
      /offline/,
    );
    assert.equal(puts, 3);
    assert.equal(calls.at(-1), "/uploads/failed/abort");
    assert.ok(!calls.some((route) => route.endsWith("/complete")));
  } finally {
    global.fetch = originalFetch;
  }
});

test("dialog renders only 50 rows for 10,000 selected files and offers a folder picker", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const selected = Array.from({ length: 10000 }, (_, i) => ({
    file: new File([], `file${i}.txt`),
    path: `project/file${i}.txt`,
    status: "pending",
  }));
  let stateIndex = 0;
  const wrapper = ({ children }) => React.createElement("div", null, children);
  const { UploadModal } = loadTs("apps/frontend/components/UploadModal.tsx", {
    react: {
      ...React,
      useState: (value) => [stateIndex++ === 0 ? selected : value, () => {}],
      useRef: (current) => ({ current }),
      useEffect: () => {},
    },
    "lucide-react": { X: () => null, Loader2: () => null },
    "@tanstack/react-query": { useQueryClient: () => ({}) },
    "@repo/ui": {
      useToast: () => ({}),
      Dialog: wrapper,
      DialogContent: wrapper,
      DialogHeader: wrapper,
      DialogTitle: wrapper,
      Button: wrapper,
      formatSize: String,
    },
    "../lib/api": {},
    "../lib/queries": {
      useUploadFile: () => ({}),
      useMultipartUploadFile: () => ({}),
    },
    "../lib/folder-upload": loadTs("apps/frontend/lib/folder-upload.ts"),
  });
  const html = renderToStaticMarkup(
    React.createElement(UploadModal, { parentId: null, onClose() {} }),
  );
  assert.equal((html.match(/title="project\/file/g) || []).length, 50);
  assert.match(html, /webkitdirectory=""/);
  assert.match(html, /10000/);
  assert.match(html, /Choose folder/);
});
function directory(name, children) {
  return {
    name,
    isDirectory: true,
    createReader() {
      let offset = 0;
      return {
        readEntries(done) {
          const batch = children.slice(offset, offset + 100);
          offset += 100;
          done(batch);
        },
      };
    },
  };
}

test("reads all directory batches and preserves nested paths", async () => {
  const entries = Array.from({ length: 350 }, (_, i) => fileEntry(`${i}.txt`));
  const files = await readDroppedFiles([
    directory("project", [
      ...entries,
      directory("nested", [fileEntry("a.txt")]),
    ]),
  ]);
  assert.equal(files.length, 351);
  assert.equal(files[350].path, "project/nested/a.txt");
  assert.equal(await files[350].file.text(), "contents");
});

test("picker uses relative paths, ordinary files use filenames", () => {
  const file = new File([], "hello.txt");
  assert.equal(selectFiles([file])[0].path, "hello.txt");
  Object.defineProperty(file, "webkitRelativePath", {
    value: "project/docs/hello.txt",
  });
  assert.equal(selectFiles([file])[0].path, "project/docs/hello.txt");
});

test("10,000 files share folder creation and run with bounded concurrency", async () => {
  const folders = [];
  const resolve = createFolderResolver(
    "destination",
    async (name, parentId) => {
      const id = `${parentId}/${name}`;
      folders.push(id);
      await new Promise(setImmediate);
      return id;
    },
  );
  let active = 0;
  let peak = 0;
  const uploaded = new Set();
  await runUploadQueue(
    Array.from({ length: 10000 }, (_, i) => i),
    async (i) => {
      active++;
      peak = Math.max(peak, active);
      const parent = await resolve(`project/group${i % 20}/file${i}.txt`);
      await new Promise(setImmediate);
      uploaded.add(`${parent}/file${i}.txt`);
      active--;
    },
  );
  assert.equal(uploaded.size, 10000);
  assert.equal(peak, 3);
  assert.equal(folders.length, 21);
  assert.equal(new Set(folders).size, 21);
  assert.ok(uploaded.has("destination/project/group19/file9999.txt"));
});

test("failed folder creation is retried without recreating successful ancestors", async () => {
  let attempts = 0;
  const calls = [];
  const resolve = createFolderResolver(null, async (name, parentId) => {
    calls.push(name);
    if (name === "nested" && attempts++ === 0) throw new Error("offline");
    return `${parentId || ""}/${name}`;
  });
  await assert.rejects(resolve("root/nested/a.txt"), /offline/);
  assert.equal(await resolve("root/nested/a.txt"), "/root/nested");
  assert.deepEqual(calls, ["root", "nested", "nested"]);
});

test("multipart retries a failed part, sends exact bytes and finalizes", async () => {
  let mutation;
  const calls = [];
  let puts = 0;
  const originalFetch = global.fetch;
  const hooks = loadTs("apps/frontend/lib/queries.ts", {
    "@tanstack/react-query": {
      useQueryClient: () => ({}),
      useMutation: (options) => {
        mutation = options.mutationFn;
      },
    },
    "next/navigation": {},
    "@repo/ui": {},
    "./api": {
      api: {
        post: async (route, body) => {
          calls.push([route, body]);
          if (route.endsWith("/initiate"))
            return { uploadSessionId: "session", partSizeBytes: 4 };
          if (route.endsWith("/part-url"))
            return { url: `https://storage.test/${body.partNumber}` };
          return {};
        },
        get: async () => ({ status: "COMPLETED", nodeId: "node" }),
      },
    },
  });
  const bodies = [];
  global.fetch = async (url, init) => {
    puts++;
    if (puts === 1) return new Response("", { status: 503 });
    bodies.push(await init.body.text());
    return new Response("", {
      headers: { etag: `etag-${url.split("/").pop()}` },
    });
  };
  try {
    hooks.useMultipartUploadFile(true);
    const progress = [];
    const result = await mutation({
      parentId: "nested",
      file: new File(["abcdefghij"], "a.txt"),
      onProgress: (pct) => progress.push(pct),
    });
    assert.equal(result.nodeId, "node");
    assert.equal(puts, 4);
    assert.deepEqual(bodies, ["abcd", "efgh", "ij"]);
    assert.equal(calls[0][1].parentId, "nested");
    assert.deepEqual(calls.at(-1), [
      "/uploads/session/complete",
      {
        parts: [
          { partNumber: 1, etag: "etag-1" },
          { partNumber: 2, etag: "etag-2" },
          { partNumber: 3, etag: "etag-3" },
        ],
      },
    ]);
    assert.equal(progress.at(-1), 99);
  } finally {
    global.fetch = originalFetch;
  }
});
