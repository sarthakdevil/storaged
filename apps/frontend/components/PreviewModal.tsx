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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
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

        <div className="px-6 py-5 bg-slate-50">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-500">
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
              className="w-full h-[60vh] rounded-xl border border-slate-200 bg-white"
            />
          ) : isImage && previewUrl ? (
            <div className="flex items-center justify-center">
              <img
                src={previewUrl}
                alt={node.name}
                className="max-h-[60vh] rounded-xl border border-slate-200"
              />
            </div>
          ) : (isMarkdown || isText) && content ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 max-h-[60vh] overflow-auto text-sm text-slate-700">
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
