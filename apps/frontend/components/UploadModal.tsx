"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { X, Upload, File, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "./Toast";
import { useUploadFile } from "../lib/queries";
import { formatSize } from "./FileCard";

type FileStatus = "pending" | "uploading" | "done" | "error";
type QueueItem = { file: File; status: FileStatus; error?: string };

type Props = {
  parentId: string | null;
  onClose: () => void;
};

export function UploadModal({ parentId, onClose }: Props) {
  const { toast } = useToast();
  const upload = useUploadFile();
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

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== "pending") continue;

      setQueue((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "uploading" };
        return next;
      });

      try {
        await upload.mutateAsync({ parentId, file: queue[i].file });
        setQueue((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: "done" };
          return next;
        });
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setQueue((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: "error", error: msg };
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
    <div className="upload-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="upload-modal w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="upload-modal-header flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Upload files</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drop zone */}
        <div
          className={`upload-dropzone mx-6 mt-5 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
            dragging
              ? "border-indigo-400 bg-indigo-50"
              : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="upload-dropzone-icon w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Upload size={22} className="text-indigo-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-800">
              Drop files here or{" "}
              <span className="text-indigo-600 underline underline-offset-2">browse</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Up to 500 MB per file</p>
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
          <div className="upload-queue mx-6 mt-4 space-y-2 max-h-52 overflow-y-auto">
            {queue.map((item, i) => (
              <div key={i} className="upload-queue-row flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <File size={16} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 truncate">{item.file.name}</p>
                  <p className="text-xs text-slate-400">{formatSize(String(item.file.size))}</p>
                </div>
                {item.status === "uploading" && (
                  <Loader2 size={16} className="animate-spin text-indigo-500 shrink-0" />
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

        {/* Footer */}
        <div className="upload-modal-footer flex gap-3 px-6 py-4 mt-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="upload-secondary-button flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition"
          >
            {allDone ? "Close" : "Cancel"}
          </button>
          {!allDone && (
            <button
              onClick={startUpload}
              disabled={pending === 0 || uploading}
              className="upload-primary-button flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white text-sm font-semibold transition"
            >
              {uploading && <Loader2 size={14} className="animate-spin" />}
              Upload {pending > 0 ? `${pending} file${pending > 1 ? "s" : ""}` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
