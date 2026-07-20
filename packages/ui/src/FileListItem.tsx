"use client";

import type { ReactNode } from "react";
import type { DriveNode } from "@repo/types";
import { Download, Pencil, Trash2, Star, Eye, Share2 } from "lucide-react";
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

export function FileListItem({
  node,
  onOpen,
  onDownload,
  onPreview,
  onEdit,
  onShare,
  onToggleFavorite,
  onTrash,
}: Props) {
  const { Icon, tone } = getFileVisual(node);
  const isFile = node.type === "FILE";

  return (
    <div
      className="flex items-center gap-6 px-6 py-4 bg-white border border-slate-200 rounded-2xl hover:shadow-sm transition cursor-pointer min-h-22 overflow-visible"
      onClick={() => onOpen(node)}
    >
      <IconBadge icon={Icon} tone={tone} size="lg" className="w-14 h-14 rounded-2xl" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-display text-sm font-semibold text-slate-900 truncate">{node.name}</p>
          {node.isFavorite && <Star size={14} className="text-amber-400" />}
        </div>
        <p className="text-xs text-slate-400">
          {node.type === "FILE" ? formatSize(node.sizeBytes) : "Folder"} • {formatRelativeTime(node.updatedAt)}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 pr-1">
        {isFile && (
          <TooltipButton label="Preview file">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreview?.(node);
              }}
              className="file-row-action-button"
              aria-label="Preview"
            >
              <Eye size={16} className="text-slate-500" />
            </button>
          </TooltipButton>
        )}

        {isFile && (
          <TooltipButton label="Download file">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(node.id);
              }}
              className="file-row-action-button"
              aria-label="Download"
            >
              <Download size={16} className="text-slate-500" />
            </button>
          </TooltipButton>
        )}

        {isFile && onShare && (
          <TooltipButton label="Share file">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShare(node);
              }}
              className="file-row-action-button"
              aria-label="Share"
            >
              <Share2 size={16} className="text-slate-500" />
            </button>
          </TooltipButton>
        )}

        <TooltipButton label={isFile ? "Edit details" : "Rename folder"}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(node);
            }}
            className="file-row-action-button"
            aria-label="Edit"
          >
            <Pencil size={16} className="text-slate-500" />
          </button>
        </TooltipButton>

        <TooltipButton label={node.isFavorite ? "Remove from favorites" : "Add to favorites"}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(node);
            }}
            className="file-row-action-button"
            aria-label={node.isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star
              size={16}
              className={node.isFavorite ? "fill-amber-400 text-amber-400" : "text-slate-400"}
            />
          </button>
        </TooltipButton>

        <TooltipButton label={isFile ? "Move to trash" : "Delete folder"} danger>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTrash(node);
            }}
            className="file-row-action-button file-row-action-button-danger"
            aria-label="Move to trash"
          >
            <Trash2 size={16} />
          </button>
        </TooltipButton>
      </div>
    </div>
  );
}

function TooltipButton({
  children,
  label,
  danger = false,
}: {
  children: ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <span className="ui-tooltip-wrap" data-danger={danger ? "true" : undefined}>
      {children}
      <span className="ui-tooltip ui-tooltip--row" role="tooltip">
        {label}
      </span>
    </span>
  );
}
