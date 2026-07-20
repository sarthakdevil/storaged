"use client";

import { useState, useRef, useEffect } from "react";
import {
  Download,
  Eye,
  Pencil,
  Trash2,
  Star,
  MoreVertical,
  Share2,
} from "lucide-react";
import type { DriveNode } from "@repo/types";
import { IconBadge } from "./IconBadge";
import { getFileVisual, formatSize, formatRelativeTime } from "./driveVisuals";

type Props = {
  node: DriveNode;
  onOpen: (node: DriveNode) => void;
  onDownload: (id: string) => void;
  onPreview?: (node: DriveNode) => void;
  onEdit: (node: DriveNode) => void;
  onShare?: (node: DriveNode) => void;
  onToggleFavorite: (node: DriveNode) => void;
  onTrash: (node: DriveNode) => void;
};

export function FileCard({
  node,
  onOpen,
  onDownload,
  onPreview,
  onEdit,
  onShare,
  onToggleFavorite,
  onTrash,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { Icon, tone } = getFileVisual(node);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const isVisual = node.type === "FILE" && (node.mimeType?.startsWith("image/") || node.mimeType?.startsWith("video/"));

  return (
    <div
      className="group relative bg-white border border-slate-100 hover:border-slate-200/80 rounded-3xl p-5 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between select-none min-h-[220px]"
      onClick={() => onOpen(node)}
    >
      {/* Favorite badge & Context menu */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
        {node.isFavorite && (
          <Star size={12} className="fill-amber-400 text-amber-400 mr-1" />
        )}

        <div ref={menuRef} onClick={(e) => e.stopPropagation()} className="relative">
          <button
            type="button"
            className={`p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition ${menuOpen ? "bg-slate-100 text-slate-600" : ""}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Actions"
          >
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl py-1.5 text-sm z-50">
              <button
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-slate-700 text-left font-medium"
                onClick={() => {
                  setMenuOpen(false);
                  onToggleFavorite(node);
                }}
              >
                <Star size={14} className={node.isFavorite ? "fill-amber-400 text-amber-400" : "text-slate-400"} />
                {node.isFavorite ? "Remove favorite" : "Add to favorites"}
              </button>
              {node.type === "FILE" && (
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-slate-700 text-left font-medium"
                  onClick={() => {
                    setMenuOpen(false);
                    onPreview?.(node);
                  }}
                >
                  <Eye size={14} /> Preview
                </button>
              )}
              {node.type === "FILE" && (
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-slate-700 text-left font-medium"
                  onClick={() => {
                    setMenuOpen(false);
                    onDownload(node.id);
                  }}
                >
                  <Download size={14} /> Download
                </button>
              )}
              {node.type === "FILE" && onShare && (
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-slate-700 text-left font-medium"
                  onClick={() => {
                    setMenuOpen(false);
                    onShare(node);
                  }}
                >
                  <Share2 size={14} /> Share
                </button>
              )}
              <button
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-slate-700 text-left font-medium"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(node);
                }}
              >
                <Pencil size={14} /> Edit details
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-red-600 text-left font-medium"
                onClick={() => {
                  setMenuOpen(false);
                  onTrash(node);
                }}
              >
                <Trash2 size={14} /> Move to trash
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main card body area */}
      <div className="flex flex-col flex-1 justify-between">
        {isVisual ? (
          /* Visual card - top large preview */
          <div className="w-full h-32 rounded-2xl bg-slate-50 border border-slate-100/60 flex items-center justify-center mb-4 select-none relative overflow-hidden group-hover:bg-slate-100/60 transition-colors shrink-0">
            <IconBadge icon={Icon} tone={tone} size="lg" />
          </div>
        ) : (
          /* Non-visual card - small icon box at top left */
          <div className="mb-6">
            <IconBadge icon={Icon} tone={tone} size="md" bordered />
          </div>
        )}

        {/* Title and details stacked at the bottom */}
        <div className="mt-auto">
          <p className="font-display text-sm font-bold text-slate-800 line-clamp-1 break-words mb-1" title={node.name}>
            {node.name}
          </p>
          <p className="text-[11px] font-semibold text-slate-400">
            {node.type === "FILE" ? formatSize(node.sizeBytes) : "Folder"} &middot; {formatRelativeTime(node.updatedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
