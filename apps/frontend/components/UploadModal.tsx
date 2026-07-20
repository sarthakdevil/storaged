"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, File, CheckCircle, Loader2, AlertCircle, X } from "lucide-react";
import { useToast, Dialog, DialogContent, DialogHeader, DialogTitle, Button, formatSize } from "@repo/ui";
import { useMultipartUploadFile, useUploadFile } from "../lib/queries";

type FileStatus = "pending" | "uploading" | "done" | "error";
type QueueItem = { file: File; status: FileStatus; error?: string; progress?: number };

type Props = {
  parentId: string | null;
  onClose: () => void;
};

export function UploadModal({ parentId, onClose }: Props) {
  const { toast } = useToast();
  const upload = useUploadFile();
  const multipartUpload = useMultipartUploadFile();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setQueue((prev) => [
      ...prev,
      ...Array.from(files).map((file) => ({ file, status: "pending" as FileStatus })),
    ]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(idx: number) {
    setQueue((prev) => prev.filter((_, i) => i !== idx));
  }

  async function startUpload() {
    setUploading(true);
    let successCount = 0;

    const multipartThreshold = 450 * 1024 * 1024; // ~450MB

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== "pending") continue;

      setQueue((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "uploading", progress: 0 };
        return next;
      });

      try {
        const file = queue[i].file;
        if (file.size > multipartThreshold) {
          await multipartUpload.mutateAsync({
            parentId,
            file,
            onProgress: (pct) => {
              setQueue((prev) => {
                const next = [...prev];
                if (!next[i]) return prev;
                next[i] = { ...next[i], progress: pct };
                return next;
              });
            },
          });
        } else {
          await upload.mutateAsync({ parentId, file });
        }
        setQueue((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: "done", progress: 100 };
          return next;
        });
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setQueue((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: "error", error: msg, progress: undefined };
          return next;
        });
        toast(`Failed: ${queue[i].file.name}`, "error");
      }
    }

    setUploading(false);
    if (successCount > 0) {
      toast(`${successCount} file${successCount > 1 ? "s" : ""} uploaded`);
      onClose();
    }
  }

  const pending = queue.filter((q) => q.status === "pending").length;
  const allDone = queue.length > 0 && queue.every((q) => q.status === "done");

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="action-modal max-w-[480px] p-6 rounded-3xl border border-slate-100 shadow-2xl">
        <DialogHeader className="text-left shrink-0">
          <DialogTitle className="font-display text-lg font-semibold text-slate-900">
            Upload files
          </DialogTitle>
        </DialogHeader>

        <div className="action-modal-body mt-2 pr-1">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
              dragging
                ? "border-neon-mint bg-neon-mint/10"
                : "border-slate-200 hover:border-neon-violet hover:bg-slate-50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div className="w-12 h-12 bg-neon-violet/10 rounded-xl flex items-center justify-center">
              <Upload size={22} className="text-electric-indigo" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-800">
                Drop files here or{" "}
                <span className="text-electric-indigo underline underline-offset-2">browse</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Up to 3 GB per file</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onInputChange}
            />
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="space-y-2 mt-4">
              {queue.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <File size={16} className="text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate">{item.file.name}</p>
                    <p className="text-xs text-slate-400">
                      {formatSize(String(item.file.size))}
                      {item.status === "uploading" && typeof item.progress === "number" ? ` • ${item.progress}%` : ""}
                    </p>
                  </div>
                  {item.status === "uploading" && (
                    <Loader2 size={16} className="animate-spin text-electric-indigo shrink-0" />
                  )}
                  {item.status === "done" && (
                    <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                  )}
                  {item.status === "error" && (
                    <AlertCircle size={16} className="text-red-500 shrink-0" />
                  )}
                  {item.status === "pending" && (
                    <button
                      onClick={() => remove(i)}
                      className="text-slate-400 hover:text-slate-600 shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-4 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 py-4.5 rounded-2xl"
          >
            {allDone ? "Close" : "Cancel"}
          </Button>
          {!allDone && (
            <Button
              onClick={startUpload}
              disabled={pending === 0 || uploading}
              className="flex-1 py-4.5 rounded-2xl bg-neon-violet hover:bg-[#8b5cf6] text-white font-semibold"
            >
              {uploading && <Loader2 size={14} className="animate-spin mr-2" />}
              Upload {pending > 0 ? `${pending} file${pending > 1 ? "s" : ""}` : ""}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
