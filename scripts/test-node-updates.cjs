const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(relativePath, mocks) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const loaded = new Module(filename, module);
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = id => id in mocks ? mocks[id] : original(id);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

for (const hookName of ['useToggleFavorite', 'useUpdateNode']) {
  for (const parentId of [null, 'nested-folder']) {
    test(`${hookName} preserves folder membership when an older API returns partial details (${parentId})`, async () => {
      const original = { id: 'file', driveId: 'drive', parentId, name: 'report.txt', path: '/report.txt', createdAt: '2026-10-18', isFavorite: false, tags: [] };
      const sibling = { ...original, id: 'sibling' };
      let cache = [original, sibling];
      const partial = { id: 'file', name: 'renamed.txt', isFavorite: true };
      const { [hookName]: useHook } = loadTs('apps/frontend/lib/queries.ts', {
        '@tanstack/react-query': {
          useQueryClient: () => ({ setQueryData: (_, update) => { cache = update(cache); } }),
          useMutation: config => config,
        },
        'next/navigation': {},
        '@repo/ui': { useToast: () => ({ toast() {} }) },
        './api': { api: { patch: async () => partial } },
      });
      const mutation = useHook();
      const result = await mutation.mutationFn({ id: 'file', isFavorite: true });
      mutation.onSuccess(result);
      assert.equal(cache.filter(n => n.parentId === parentId).length, 2);
      assert.equal(cache[0].isFavorite, true);
      assert.equal(cache[0].name, 'renamed.txt');
      assert.equal(cache[0].driveId, original.driveId);
      assert.equal(cache[0].createdAt, original.createdAt);
      assert.equal(cache[1], sibling);
    });
  }
}

test('node update API returns folder membership and creation metadata for starred files', async () => {
  const node = { id: 'file', driveId: 'drive', parentId: null, type: 'FILE', name: 'report.txt', path: '/report.txt', description: null, isFavorite: false, sizeBytes: 2048n, mimeType: 'text/plain', createdAt: new Date(), updatedAt: new Date(), tags: [] };
  const prisma = {
    node: { findFirst: async () => node },
    $transaction: async callback => callback({ node: { update: async ({ data }) => ({ ...node, ...data }) } }),
  };
  const { updateNodeDetails } = loadTs('apps/backend/src/services/storageService.ts', {
    '../utils/prisma': { prisma },
    '../generated/prisma/client': { Prisma: {} },
    '../utils/s3': {},
    '../utils/storageschemas': {},
  });
  for (const parentId of [null, 'nested-folder']) {
    node.parentId = parentId;
    const updated = await updateNodeDetails({ userId: 'user', nodeId: node.id, isFavorite: true });
    assert.equal(updated.parentId, parentId);
    assert.equal(updated.driveId, node.driveId);
    assert.equal(updated.createdAt, node.createdAt);
    assert.equal(updated.isFavorite, true);
    assert.equal(updated.sizeBytes, '2048');
  }
});
