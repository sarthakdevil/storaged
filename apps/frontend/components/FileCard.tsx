"use client";

import { useState, useRef, useEffect } from "react";
import {
  Folder,
  File,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileText,
  Download,
  Eye,
  Pencil,
  Trash2,
  Star,
  MoreVertical,
} from "lucide-react";
import { DriveNode } from "../lib/api";

function getIcon(node: DriveNode) {
  if (node.type === "FOLDER") return Folder;
  const m = node.mimeType ?? "";
  if (m.startsWith("image/")) return FileImage;
  if (m.startsWith("video/")) return FileVideo;
  if (m.startsWith("audio/")) return FileAudio;
  if (m.includes("zip") || m.includes("rar") || m.includes("tar") || m.includes("gz"))
    return FileArchive;
  if (m.includes("pdf") || m.includes("text") || m.includes("document"))
    return FileText;
  return File;
}

function getIconStyle(node: DriveNode) {
  if (node.type === "FOLDER") return { bg: "bg-indigo-50", color: "#6366f1" };
  const m = node.mimeType ?? "";
  if (m.startsWith("image/")) return { bg: "bg-emerald-50", color: "#10b981" };
  if (m.startsWith("video/")) return { bg: "bg-purple-50", color: "#a855f7" };
  if (m.startsWith("audio/")) return { bg: "bg-orange-50", color: "#f97316" };
  if (m.includes("zip") || m.includes("rar")) return { bg: "bg-amber-50", color: "#f59e0b" };
  if (m.includes("pdf")) return { bg: "bg-red-50", color: "#ef4444" };
  return { bg: "bg-slate-50", color: "#64748b" };
}

export function formatSize(bytes: string): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  node: DriveNode;
  onOpen: (node: DriveNode) => void;
  onDownload: (id: string) => void;
  onPreview?: (node: DriveNode) => void;
  onEdit: (node: DriveNode) => void;
  onTrash: (node: DriveNode) => void;
};

export function FileCard({ node, onOpen, onDownload, onPreview, onEdit, onTrash }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const Icon = getIcon(node);
  const { bg, color } = getIconStyle(node);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      className="group relative drive-card rounded-3xl p-6 cursor-pointer transition-all duration-200 select-none min-h-[220px] flex flex-col"
      onClick={() => onOpen(node)}
    >
      {/* Favorite badge */}
      {node.isFavorite && (
        <div className="absolute top-3 left-3">
          <Star size={11} className="fill-amber-400 text-amber-400" />
        </div>
      )}

      {/* Context menu toggle */}
      <div ref={menuRef} className="absolute top-2 right-2 z-10">
        <button
          type="button"
          aria-label="Open item actions"
          aria-expanded={menuOpen}
          className="file-card-menu-trigger"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <div className="file-card-menu-panel absolute right-0 top-10 w-48 py-1.5 text-sm">
            {node.type === "FILE" && (
              <button
                className="file-card-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onPreview?.(node);
                }}
              >
                <Eye size={14} /> Preview
              </button>
            )}
            {node.type === "FILE" && (
              <button
                className="file-card-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDownload(node.id);
                }}
              >
                <Download size={14} /> Download
              </button>
            )}
            <button
              className="file-card-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onEdit(node);
              }}
            >
              <Pencil size={14} /> Edit details
            </button>
            <div className="file-card-menu-divider" />
            <button
              className="file-card-menu-item file-card-menu-item-danger"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onTrash(node);
              }}
            >
              <Trash2 size={14} /> Move to trash
            </button>
          </div>
        )}
      </div>

      {/* Icon */}
      <div className={`h-[48%] w-full ${bg} rounded-2xl flex items-center justify-center mb-3 shadow-sm`}>
        <Icon size={36} color={color} />
      </div>

      {/* Name */}
      <p className="text-sm font-semibold text-slate-900 truncate mb-1">{node.name}</p>

      {/* Meta */}
      <p className="text-[11px] text-slate-500">
        {node.type === "FILE" ? formatSize(node.sizeBytes) : "Folder"} - {formatDate(node.updatedAt)}
      </p>

      {/* Tags */}
      {node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {node.tags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium"
            >
              {tag.name}
            </span>
          ))}
          {node.tags.length > 2 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              +{node.tags.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
