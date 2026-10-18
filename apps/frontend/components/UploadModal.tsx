"use client";

import {
  useEffect,
  useState,
  useRef,
  type DragEvent,
  type ChangeEvent,
} from "react";
import { Loader2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useToast,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  formatSize,
} from "@repo/ui";
import { keys, useMultipartUploadFile, useUploadFile } from "../lib/queries";
import { api, ApiError, type DriveNode } from "../lib/api";
import {
  createFolderResolver,
  MAX_FILE_SIZE,
  MULTIPART_THRESHOLD,
  readDroppedFiles,
  runUploadQueue,
  selectFiles,
  type SelectedFile,
} from "../lib/folder-upload";

type QueueItem = SelectedFile & {
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  progress?: number;
};
const PAGE_SIZE = 50;

export function UploadModal({
  parentId,
  onClose,
}: {
  parentId: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const upload = useUploadFile(true);
  const multipartUpload = useMultipartUploadFile(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [page, setPage] = useState(0);
  const busy = uploading || reading;
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const resolverRef = useRef<ReturnType<typeof createFolderResolver> | null>(
    null,
  );

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function addFiles(files: SelectedFile[]) {
    setQueue((prev) => [
      ...prev,
      ...files.map(
        (item): QueueItem => ({
          ...item,
          status: item.file.size > MAX_FILE_SIZE ? "error" : "pending",
          error:
            item.file.size > MAX_FILE_SIZE
              ? "File exceeds the 3 GB limit"
              : undefined,
        }),
      ),
    ]);
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (busyRef.current) return;
    const entries = Array.from(event.dataTransfer.items).map(
      (item) => item.webkitGetAsEntry?.() ?? null,
    );
    const fallback = selectFiles(event.dataTransfer.files);
    busyRef.current = true;
    setReading(true);
    try {
      addFiles(
        entries.some(Boolean)
          ? await readDroppedFiles(
              entries.filter(
                (entry): entry is FileSystemEntry => entry !== null,
              ),
            )
          : fallback,
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not read folder",
        "error",
      );
    } finally {
      busyRef.current = false;
      setReading(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (!busyRef.current && event.target.files)
      addFiles(selectFiles(event.target.files));
    event.target.value = "";
  }

  function update(index: number, changes: Partial<QueueItem>) {
    setQueue((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...changes };
      return next;
    });
  }

  async function startUpload() {
    if (busyRef.current) return;
    busyRef.current = true;
    setUploading(true);
    let successes = 0;
    let failures = 0;
    if (!resolverRef.current) {
      resolverRef.current = createFolderResolver(
        parentId,
        async (name, folderParentId) => {
          for (let attempt = 0; attempt < 1000; attempt++) {
            try {
              const folder = await api.post<DriveNode>("/files/folders", {
                name: attempt === 0 ? name : `${name}_${attempt}`,
                parentId: folderParentId ?? undefined,
              });
              return folder.id;
            } catch (error) {
              if (!(error instanceof ApiError) || error.status !== 409)
                throw error;
            }
          }
          throw new Error(`Could not create folder: ${name}`);
        },
      );
    }
    try {
      await runUploadQueue(
        queue
          .map((item, index) => ({ item, index }))
          .filter(
            ({ item }) =>
              item.status !== "done" && item.file.size <= MAX_FILE_SIZE,
          ),
        async ({ item, index }) => {
          update(index, { status: "uploading", progress: 0, error: undefined });
          try {
            const destination = await resolverRef.current!(item.path);
            if (item.file.size > MULTIPART_THRESHOLD) {
              await multipartUpload.mutateAsync({
                parentId: destination,
                file: item.file,
                onProgress: (progress) => update(index, { progress }),
              });
            } else {
              await upload.mutateAsync({
                parentId: destination,
                file: item.file,
              });
            }
            successes++;
            update(index, { status: "done", progress: 100 });
          } catch (error) {
            failures++;
            update(index, {
              status: "error",
              progress: undefined,
              error: error instanceof Error ? error.message : "Upload failed",
            });
          }
        },
      );
    } finally {
      busyRef.current = false;
      setUploading(false);
      void qc.invalidateQueries({ queryKey: keys.nodes });
      void qc.invalidateQueries({ queryKey: keys.storageDashboard });
      void qc.invalidateQueries({ queryKey: keys.userStorageQuota });
    }
    toast(
      `${successes} uploaded${failures ? `, ${failures} failed. Retry failed files below.` : ""}`,
      failures ? "error" : undefined,
    );
  }

  const remaining = queue.filter(
    (item) => item.status !== "done" && item.file.size <= MAX_FILE_SIZE,
  ).length;
  const completed = queue.filter((item) => item.status === "done").length;
  const failed = queue.filter((item) => item.status === "error").length;
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(queue.length / PAGE_SIZE) - 1),
  );
  const close = () => {
    if (!busyRef.current) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className="action-modal max-w-[560px] p-6 rounded-3xl border border-slate-100 shadow-2xl"
      >
        <DialogHeader className="text-left shrink-0">
          <DialogTitle className="font-display text-lg font-semibold text-slate-900">
            Upload files or folders
          </DialogTitle>
        </DialogHeader>
        <div className="action-modal-body mt-2 pr-1">
          <div
            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-3 ${dragging ? "border-neon-mint bg-neon-mint/10" : "border-slate-200"}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <p className="text-sm text-slate-800">Drop files or folders here</p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                Choose files
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => folderRef.current?.click()}
              >
                Choose folder
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Subfolders are preserved. Up to 3 GB per file.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onInputChange}
            />
            <input
              ref={folderRef}
              type="file"
              multiple
              {...{ webkitdirectory: "" }}
              className="hidden"
              onChange={onInputChange}
            />
          </div>
          {reading && (
            <p role="status" className="text-sm mt-3">
              Reading folder files…
            </p>
          )}
          {queue.length > 0 && (
            <>
              <p role="status" className="text-sm text-slate-600 mt-4">
                {completed} / {queue.length} uploaded ·{" "}
                {formatSize(
                  String(queue.reduce((sum, item) => sum + item.file.size, 0)),
                )}
                {failed > 0 ? ` · ${failed} failed` : ""}
              </p>
              {uploading && (
                <p className="text-xs text-slate-500 mt-1">
                  Keep this tab open until uploads finish.
                </p>
              )}
              <div className="space-y-2 mt-3">
                {queue
                  .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                  .map((item, offset) => {
                    const index = currentPage * PAGE_SIZE + offset;
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            title={item.path}
                            className="text-sm text-slate-800 truncate"
                          >
                            {item.path}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatSize(String(item.file.size))} · {item.status}
                            {item.status === "uploading"
                              ? ` ${item.progress ?? 0}%`
                              : ""}
                          </p>
                          {item.error && (
                            <p className="text-xs text-red-600 break-words">
                              {item.error}
                            </p>
                          )}
                        </div>
                        {item.status === "uploading" && (
                          <Loader2
                            size={16}
                            aria-label="Uploading"
                            className="animate-spin text-electric-indigo shrink-0"
                          />
                        )}
                        {!busy && item.status !== "done" && (
                          <button
                            aria-label={`Remove ${item.path}`}
                            onClick={() =>
                              setQueue((prev) =>
                                prev.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
              {queue.length > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-3 text-sm">
                  <Button
                    variant="outline"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <span>
                    {currentPage + 1} / {Math.ceil(queue.length / PAGE_SIZE)}
                  </span>
                  <Button
                    variant="outline"
                    disabled={(currentPage + 1) * PAGE_SIZE >= queue.length}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex gap-3 pt-4 shrink-0">
          <Button
            variant="outline"
            onClick={close}
            disabled={busy}
            className="flex-1 rounded-2xl"
          >
            Close
          </Button>
          <Button
            onClick={startUpload}
            disabled={remaining === 0 || busy}
            className="flex-1 rounded-2xl bg-neon-violet text-white"
          >
            {uploading && <Loader2 size={14} className="animate-spin mr-2" />}
            {failed ? "Retry / upload" : "Upload"}{" "}
            {remaining > 0 ? `${remaining} files` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
