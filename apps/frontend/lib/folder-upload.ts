export type SelectedFile = { file: File; path: string };

export const MAX_FILE_SIZE = 3 * 1024 ** 3;
export const MULTIPART_THRESHOLD = 8 * 1024 ** 2;

export function selectFiles(files: ArrayLike<File>): SelectedFile[] {
  return Array.from(files, (file) => ({
    file,
    path: file.webkitRelativePath || file.name,
  }));
}

// A directory reader returns batches (often 100 entries), not the whole folder.
export async function readDroppedFiles(
  entries: FileSystemEntry[],
): Promise<SelectedFile[]> {
  const files: SelectedFile[] = [];
  async function visit(entry: FileSystemEntry, prefix: string): Promise<void> {
    const path = `${prefix}${entry.name}`;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      files.push({ file, path });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (batch.length === 0) break;
        for (const child of batch) await visit(child, `${path}/`);
      }
    }
  }
  for (const entry of entries) await visit(entry, "");
  return files;
}

// Cache in-flight creation too: concurrent files must share the same folder.
export function createFolderResolver(
  rootId: string | null,
  create: (name: string, parentId: string | null) => Promise<string>,
) {
  const folders = new Map<string, Promise<string | null>>([
    ["", Promise.resolve(rootId)],
  ]);
  function resolve(path: string): Promise<string | null> {
    const cached = folders.get(path);
    if (cached) return cached;
    const slash = path.lastIndexOf("/");
    const parentPath = slash < 0 ? "" : path.slice(0, slash);
    const name = path.slice(slash + 1);
    const pending = resolve(parentPath).then((parentId) =>
      create(name, parentId),
    );
    folders.set(path, pending);
    pending.catch(() => folders.delete(path));
    return pending;
  }
  return (filePath: string) => {
    const slash = filePath.lastIndexOf("/");
    return resolve(slash < 0 ? "" : filePath.slice(0, slash));
  };
}

export async function runUploadQueue<T>(
  items: T[],
  upload: (item: T) => Promise<void>,
  concurrency = 3,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await upload(item);
      }
    }),
  );
}
