"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Download, ExternalLink, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DriveNode, api } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button, formatSize } from "@repo/ui";

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
  const nodeId = node?.id;

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
        const res = await api.get<PreviewResponse>(`/files/${nodeId}/preview`);
        setPreviewUrl(res.url);

        if (isText || isMarkdown) {
          const textRes = await fetch(res.url);
          if (!textRes.ok) throw new Error("Failed to load text preview content");
          const text = await textRes.text();
          setContent(text);
        }
      } catch (err) {
        console.error(err);
        setError("Could not load preview. You can still download the file.");
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [node, nodeId, isText, isMarkdown]);

  if (!node) return null;

  const handleDownload = () => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-4xl sm:max-w-4xl h-[80vh] p-0 overflow-hidden rounded-2xl border border-slate-100 shadow-2xl flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-slate-100 flex flex-row items-center justify-between text-left space-y-0 shrink-0">
          <div>
            <DialogTitle className="font-display text-base font-semibold text-slate-900 truncate">Preview</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              {node.name} · {formatSize(node.sizeBytes)}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2 pr-6">
            {previewUrl && (
              <Button
                variant="ghost"
                onClick={() => window.open(previewUrl, "_blank")}
                className="p-2 h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Open in new tab"
              >
                <ExternalLink size={16} />
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={handleDownload}
              className="p-2 h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-500"
              aria-label="Download"
            >
              <Download size={16} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 p-6 bg-slate-50/95">
          {loading ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              <span className="ml-2 text-sm">Loading preview...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-red-500 justify-center h-full">
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
            <div className="text-sm text-slate-500 flex h-full items-center justify-center">
              Preview not available for this file type.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
