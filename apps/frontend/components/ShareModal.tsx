"use client";

import { useState } from "react";
import {
  Link2,
  Copy,
  Trash2,
  Check,
  Loader2,
  Clock,
  Share2,
} from "lucide-react";
import { DriveNode } from "../lib/api";
import { useShareLinks, useCreateShareLink, useRevokeShareLink } from "../lib/queries";
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button } from "@repo/ui";

const EXPIRY_OPTIONS = [
  { label: "Never", value: undefined },
  { label: "1 hour", value: 3600 },
  { label: "24 hours", value: 86400 },
  { label: "7 days", value: 604800 },
  { label: "30 days", value: 2592000 },
];

function getShareUrl(token: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/share/${token}`;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "Never expires";
  const date = new Date(iso);
  const now = new Date();
  if (date < now) return "Expired";
  const diffMs = date.getTime() - now.getTime();
  const diffH = Math.round(diffMs / 3_600_000);
  if (diffH < 24) return `Expires in ${diffH}h`;
  const diffD = Math.round(diffMs / 86_400_000);
  return `Expires in ${diffD}d`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="outline"
      onClick={handleCopy}
      className={`flex items-center gap-2 h-11 px-5 rounded-xl font-bold transition-all shadow-sm ${
        copied
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          : ""
      }`}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? "Copied" : "Copy Link"}
    </Button>
  );
}

type Props = {
  node: DriveNode;
  onClose: () => void;
};

export function ShareModal({ node, onClose }: Props) {
  const [expiresIn, setExpiresIn] = useState<number | undefined>(undefined);

  const { data: links = [], isLoading } = useShareLinks(node.id);
  const createLink = useCreateShareLink();
  const revokeLink = useRevokeShareLink();

  async function handleCreate() {
    await createLink.mutateAsync({ nodeId: node.id, expiresIn });
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="share-modal max-w-2xl p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <DialogHeader className="text-left flex flex-row items-center gap-5 space-y-0 pb-6 border-b border-slate-100">
          <div className="w-14 h-14 bg-neon-violet/10 rounded-2xl flex items-center justify-center shrink-0 ring-4 ring-neon-violet/10">
            <Share2 size={24} className="text-electric-indigo" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="font-display font-extrabold text-slate-900 text-xl sm:text-2xl mb-1">
              Share File
            </DialogTitle>
            <p className="text-sm font-semibold text-slate-500 truncate">
              {node.name}
            </p>
          </div>
        </DialogHeader>

        {/* Create new link */}
        <div className="py-6 border-b border-slate-100 bg-slate-50/50 -mx-6 sm:-mx-8 px-6 sm:px-8">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            Create New Link
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex-1 flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm focus-within:border-neon-violet focus-within:ring-4 focus-within:ring-neon-violet/20 transition-all">
              <Clock size={18} className="text-slate-400 shrink-0" />
              <select
                value={expiresIn ?? ""}
                onChange={(e) =>
                  setExpiresIn(e.target.value === "" ? undefined : Number(e.target.value))
                }
                className="flex-1 bg-transparent text-sm font-bold text-slate-800 outline-none cursor-pointer appearance-none"
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ""}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleCreate}
              disabled={createLink.isPending}
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-neon-violet hover:bg-[#8b5cf6] text-white text-sm font-bold rounded-xl shadow-[0_6px_18px_-4px_rgba(167,139,250,0.55)] hover:shadow-[0_10px_28px_-4px_rgba(167,139,250,0.7)] transition-all shrink-0"
            >
              {createLink.isPending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Link2 size={18} />
              )}
              Generate Link
            </Button>
          </div>
        </div>

        {/* Existing links */}
        <div className="flex-1 overflow-y-auto py-6 min-h-0 pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 size={24} className="animate-spin text-electric-indigo" />
              <span className="text-sm font-medium">Loading active links…</span>
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center ring-4 ring-slate-50/50">
                <Link2 size={28} className="text-slate-300" />
              </div>
              <p className="text-base font-semibold text-slate-500">No share links active</p>
            </div>
          ) : (
            <div className="space-y-4">
              {links.map((link) => {
                const url = getShareUrl(link.token);
                const isExpired = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
                return (
                  <div
                    key={link.id}
                    className={`flex flex-col gap-4 p-5 rounded-2xl border transition-colors ${
                      isExpired
                        ? "bg-slate-50/80 border-slate-200/60 opacity-75"
                        : "bg-white border-slate-200 shadow-sm hover:border-neon-violet hover:shadow-md"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* URL Box */}
                      <div className="flex-1 min-w-0 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                        <p className="text-sm font-mono text-slate-600 truncate mb-1">
                          {url}
                        </p>
                        <p
                          className={`text-xs font-bold flex items-center gap-1.5 ${
                            isExpired ? "text-red-500" : "text-slate-400"
                          }`}
                        >
                          <Clock size={12} />
                          {formatExpiry(link.expiresAt)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {!isExpired && <CopyButton text={url} />}
                        <Button
                          variant="ghost"
                          onClick={() => revokeLink.mutate({ linkId: link.id, nodeId: node.id })}
                          disabled={revokeLink.isPending}
                          className="flex items-center justify-center w-11 h-11 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100 border border-transparent focus:ring-red-200 p-0"
                          title="Revoke Link"
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2">
          <div className="bg-neon-violet/10 p-4 rounded-xl border border-neon-violet/20">
            <p className="text-xs font-semibold text-electric-indigo text-center leading-relaxed">
              Anyone with the link can securely view and download this file.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
