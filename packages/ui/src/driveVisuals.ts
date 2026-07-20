import type { ComponentType } from "react";
import {
  Folder,
  File,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileText,
  FileCode,
} from "lucide-react";
import type { DriveNode } from "@repo/types";
import type { IconBadgeTone } from "./IconBadge";

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "c", "cpp",
  "h", "hpp", "cs", "php", "rb", "json", "html", "css", "scss", "yml", "yaml", "sh",
]);

export type FileVisual = {
  Icon: ComponentType<{ size?: number; className?: string }>;
  tone: IconBadgeTone;
};

export function getFileVisual(node: DriveNode): FileVisual {
  if (node.type === "FOLDER") {
    return { Icon: Folder, tone: "violet" };
  }

  const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
  const m = node.mimeType ?? "";

  if (m.startsWith("image/")) return { Icon: FileImage, tone: "emerald" };
  if (m.startsWith("video/")) return { Icon: FileVideo, tone: "emerald" };
  if (m.startsWith("audio/")) return { Icon: FileAudio, tone: "emerald" };
  if (["zip", "rar", "tar", "gz", "7z"].includes(ext) || m.includes("zip"))
    return { Icon: FileArchive, tone: "emerald" };
  if (CODE_EXTENSIONS.has(ext))
    return { Icon: FileCode, tone: "sky" };
  if (ext === "md" || ext === "mdx" || ext === "txt")
    return { Icon: FileText, tone: "sky" };
  if (ext === "pdf" || ext === "doc" || ext === "docx" || m.includes("pdf") || m.includes("document"))
    return { Icon: FileText, tone: "violet" };
  return { Icon: File, tone: "slate" };
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

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Modified just now";
  if (diffMin < 60) return `Modified ${diffMin}m ago`;
  if (diffHour < 24) return `Modified ${diffHour}h ago`;
  if (diffDay < 30) return `Modified ${diffDay}d ago`;
  return `Modified on ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
