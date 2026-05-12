"use client";

import { useState } from "react";
import {
  Trash2,
  RotateCcw,
  X,
  Loader2,
  CloudOff,
  Folder,
  File,
  AlertTriangle,
} from "lucide-react";
import { useTrash, useRestoreNode, useDeleteNode, useEmptyTrash } from "../../../lib/queries";
import { formatSize, formatDate } from "../../../components/FileCard";

export default function TrashPage() {
  const { data: nodes = [], isLoading, isError, refetch } = useTrash();
  const restore = useRestoreNode();
  const del = useDeleteNode();
  const emptyTrash = useEmptyTrash();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-4 px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center">
            <Trash2 size={16} className="text-red-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">Trash</h1>
            <p className="text-xs text-slate-400">
              {nodes.length} item{nodes.length !== 1 ? "s" : ""} in trash
            </p>
          </div>
        </div>
        {nodes.length > 0 && (
          <button
            onClick={() => emptyTrash.mutate(nodes)}
            disabled={emptyTrash.isPending}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition disabled:opacity-60"
          >
            {emptyTrash.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <X size={14} />
            )}
            Empty trash
          </button>
        )}
      </header>

      {/* Info banner */}
      {nodes.length > 0 && (
        <div className="mx-8 mt-5 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <AlertTriangle size={15} className="shrink-0" />
          Items in trash can be restored or permanently deleted.
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-8 py-5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
            <p className="text-sm text-slate-400">Loading trash...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center">
              <CloudOff size={24} className="text-red-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              Could not load trash. Is the backend running?
            </p>
            <button onClick={() => refetch()} className="text-sm text-indigo-600 hover:underline">
              Try again
            </button>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
              <Trash2 size={24} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">Trash is empty</p>
            <p className="text-xs text-slate-400">Files you delete will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {nodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 transition group"
              >
                {/* Icon */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    node.type === "FOLDER" ? "bg-indigo-50" : "bg-slate-50"
                  }`}
                >
                  {node.type === "FOLDER" ? (
                    <Folder size={20} className="text-indigo-500" />
                  ) : (
                    <File size={20} className="text-slate-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {node.originalName ?? "(unnamed)"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    {node.type === "FILE" && <span>{formatSize(node.sizeBytes)}</span>}
                    {node.type === "FILE" && <span>-</span>}
                    {node.originalPath && (
                      <span className="truncate max-w-xs" title={node.originalPath}>
                        {node.originalPath}
                      </span>
                    )}
                    {node.deletedAt && (
                      <>
                        <span>-</span>
                        <span>Deleted {formatDate(node.deletedAt)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => restore.mutate(node.id)}
                    disabled={restore.isPending && restore.variables === node.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-60"
                  >
                    {restore.isPending && restore.variables === node.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RotateCcw size={12} />
                    )}
                    Restore
                  </button>

                  {confirmId === node.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => del.mutate(node.id, { onSuccess: () => setConfirmId(null) })}
                        disabled={del.isPending && del.variables === node.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-60"
                      >
                        {del.isPending && del.variables === node.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(node.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
