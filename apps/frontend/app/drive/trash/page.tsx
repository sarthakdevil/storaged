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
  Eye,
} from "lucide-react";
import { useTrash, useRestoreNode, useDeleteNode, useEmptyTrash } from "../../../lib/queries";
import { formatSize, formatDate } from "../../../components/FileCard";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { TrashNode } from "../../../lib/api";

export default function TrashPage() {
  const { data: nodes = [], isLoading, isError, refetch } = useTrash();
  const restore = useRestoreNode();
  const del = useDeleteNode();
  const emptyTrash = useEmptyTrash();
  const [pendingDeleteNode, setPendingDeleteNode] = useState<TrashNode | null>(null);

  function confirmDelete() {
    if (!pendingDeleteNode) return;
    del.mutate(pendingDeleteNode.id, { onSuccess: () => setPendingDeleteNode(null) });
    setPendingDeleteNode(null);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="drive-toolbar sticky top-0 z-10 bg-white border-b border-slate-200 py-5">
        <div className="drive-inner flex items-center gap-5">
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
              className="drive-action-button drive-action-secondary ml-auto flex items-center gap-2 border-red-200 text-red-600 hover:bg-red-50"
            >
              {emptyTrash.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <X size={14} />
              )}
              Empty trash
            </button>
          )}
        </div>
      </header>

      {/* Info banner */}
      {nodes.length > 0 && (
        <div className="drive-inner mt-10">
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 shadow-sm">
            <AlertTriangle size={15} className="shrink-0" />
            Items in trash can be restored or permanently deleted.
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 pt-10 pb-8">
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
          <div className="drive-inner space-y-5">
            {nodes.map((node) => (
              <TrashListItem
                key={node.id}
                node={node}
                onRestore={() => restore.mutate(node.id)}
                restoring={restore.isPending && restore.variables === node.id}
                onDelete={() => setPendingDeleteNode(node)}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDeleteNode}
        title="Delete permanently?"
        description={
          pendingDeleteNode
            ? `This will permanently delete ${pendingDeleteNode.originalName ?? "this item"}.`
            : "This will permanently delete this item."
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteNode(null)}
      />
    </div>
  );
}

function TrashListItem({
  node,
  onRestore,
  restoring,
  onDelete,
}: {
  node: TrashNode;
  onRestore: () => void;
  restoring: boolean;
  onDelete: () => void;
}) {
  const Icon = node.type === "FOLDER" ? Folder : File;
  const name = node.originalName ?? "(unnamed)";

  return (
    <div className="flex items-center gap-6 rounded-2xl border border-slate-200 bg-white px-6 py-5 transition hover:shadow-sm min-h-24">
      <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${node.type === "FOLDER" ? "bg-indigo-50" : "bg-slate-50"}`}>
        <Icon size={24} className={node.type === "FOLDER" ? "text-indigo-500" : "text-slate-500"} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {node.type === "FOLDER" ? "Folder" : "File"}
          </span>
        </div>
        <p className="mt-1.5 truncate text-xs text-slate-400 leading-5">
          {node.type === "FILE" ? formatSize(node.sizeBytes) : "Folder"}
          {node.originalPath ? ` • ${node.originalPath}` : ""}
          {node.deletedAt ? ` • Deleted ${formatDate(node.deletedAt)}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <ActionButton label="Restore">
          <button
            onClick={onRestore}
            disabled={restoring}
            className="file-row-action-button"
            aria-label="Restore"
          >
            {restoring ? <Loader2 size={16} className="animate-spin text-indigo-500" /> : <RotateCcw size={16} className="text-indigo-500" />}
          </button>
        </ActionButton>
        <ActionButton label="Preview" hidden={node.type !== "FILE"}>
          <button className="file-row-action-button" aria-label="Preview" disabled>
            <Eye size={16} className="text-slate-300" />
          </button>
        </ActionButton>
        <ActionButton label="Delete permanently" danger>
          <button
            onClick={onDelete}
            className="file-row-action-button file-row-action-button-danger"
            aria-label="Delete permanently"
          >
            <Trash2 size={16} />
          </button>
        </ActionButton>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  label,
  danger = false,
  hidden = false,
}: {
  children: React.ReactNode;
  label: string;
  danger?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <span className="ui-tooltip-wrap" data-danger={danger ? "true" : undefined}>
      {children}
      <span className="ui-tooltip ui-tooltip--row" role="tooltip">
        {label}
      </span>
    </span>
  );
}
