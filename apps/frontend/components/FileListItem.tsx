"use client";

import React from "react";
import { DriveNode } from "../lib/api";
import { File, Folder, Download, Pencil, Trash2, Star, Eye } from "lucide-react";
import { formatSize, formatDate } from "./FileCard";

type Props = {
  node: DriveNode;
  onOpen: (node: DriveNode) => void;
  onDownload: (id: string) => void;
  onPreview?: (node: DriveNode) => void;
  onEdit: (node: DriveNode) => void;
  onTrash: (id: string) => void;
};

function getIcon(node: DriveNode) {
  if (node.type === "FOLDER") return Folder;
  const m = node.mimeType ?? "";
  if (m.startsWith("image/")) return File;
  return File;
}

export function FileListItem({ node, onOpen, onDownload, onPreview, onEdit, onTrash }: Props) {
  const Icon = getIcon(node);
  return (
    <div
      className="flex items-center gap-6 px-6 py-4 bg-white border border-slate-200 rounded-2xl hover:shadow-sm transition cursor-pointer min-h-[88px]"
      onClick={() => onOpen(node)}
    >
      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0">
        <Icon size={24} className="text-slate-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900 truncate">{node.name}</p>
          {node.isFavorite && <Star size={14} className="text-amber-400" />}
        </div>
        <p className="text-xs text-slate-400">
          {node.type === "FILE" ? formatSize(node.sizeBytes) : "Folder"} • {formatDate(node.updatedAt)}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 pr-1">
        {node.type === "FILE" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPreview?.(node);
            }}
            className="p-2.5 rounded-lg hover:bg-slate-50"
            aria-label="Preview"
          >
            <Eye size={16} className="text-slate-500" />
          </button>
        )}
        {node.type === "FILE" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(node.id);
            }}
            className="p-2.5 rounded-lg hover:bg-slate-50"
            aria-label="Download"
          >
            <Download size={16} className="text-slate-500" />
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(node);
          }}
          className="p-2.5 rounded-lg hover:bg-slate-50"
          aria-label="Edit"
        >
          <Pencil size={16} className="text-slate-500" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onTrash(node.id);
          }}
          className="p-2.5 rounded-lg hover:bg-red-50 text-red-600"
          aria-label="Move to trash"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
