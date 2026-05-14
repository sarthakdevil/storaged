"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Download, ExternalLink, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DriveNode, api } from "../lib/api";
import { formatSize } from "./FileCard";

type PreviewResponse = {
  url: string;
  name?: string;
  mimeType?: string | null;
  sizeBytes?: string;
};

type Props = {
  node: DriveNode | null;
  onClose: () => void;
};

const TEXT_EXTENSIONS = new Set([
  "txt",
  "log",
  "csv",
  "json",
  "md",
  "markdown",
  "yaml",
  "yml",
]);

export function PreviewModal({ node, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const extension = useMemo(() => {
    const name = node?.name ?? "";
    const idx = name.lastIndexOf(".");
    if (idx === -1) return "";
    return name.slice(idx + 1).toLowerCase();
  }, [node?.name]);

  const mimeType = node?.mimeType ?? "";
  const isPdf = mimeType === "application/pdf" || extension === "pdf";
  const isMarkdown = mimeType.includes("markdown") || extension === "md" || extension === "markdown";
  const isText = mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(extension);
  const isImage = mimeType.startsWith("image/");

  useEffect(() => {
    if (!node) return;

    const loadPreview = async () => {
      setLoading(true);
      setError(null);
      setContent(null);
      setPreviewUrl(null);

      try {
        const res = await api.get<PreviewResponse>(`/files/${node.id}/preview`);
        setPreviewUrl(res.url);

        if (isMarkdown || isText) {
          const text = await fetch(res.url).then((r) => r.text());
          setContent(text);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview failed");
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [node?.id, isMarkdown, isText]);

  if (!node) return null;

  async function handleDownload() {
    if (!node) return;
    try {
      const res = await api.get<{ url: string }>(`/files/${node.id}/download`);
      window.open(res.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  return (
    <div className="fixed top-18 left-68 right-0 bottom-0 z-50 p-6 bg-slate-950/20 backdrop-blur-2xl">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_28px_70px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/80">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/90 backdrop-blur-md shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900 truncate">Preview</h2>
            <p className="text-xs text-slate-500">
              {node.name} · {formatSize(node.sizeBytes)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {previewUrl && (
              <button
                onClick={() => window.open(previewUrl, "_blank")}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Open in new tab"
              >
                <ExternalLink size={16} />
              </button>
            )}
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              aria-label="Download"
            >
              <Download size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-6 bg-slate-50/95 backdrop-blur-sm">
          {loading ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              <span className="ml-2 text-sm">Loading preview...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle size={16} /> {error}
            </div>
          ) : isPdf && previewUrl ? (
            <iframe
              title="PDF Preview"
              src={previewUrl}
              className="w-full h-full rounded-xl border border-slate-200 bg-white"
            />
          ) : isImage && previewUrl ? (
            <div className="flex h-full items-center justify-center overflow-auto">
              <img
                src={previewUrl}
                alt={node.name}
                className="max-h-full max-w-full rounded-xl border border-slate-200 object-contain"
              />
            </div>
          ) : (isMarkdown || isText) && content ? (
            <div className="h-full overflow-auto rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
              {isMarkdown ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <pre className="whitespace-pre-wrap">{content}</pre>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              Preview not available for this file type.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
