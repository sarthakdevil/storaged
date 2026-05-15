"use client";

import { useState } from "react";
import {
  Link2,
  Copy,
  Trash2,
  Check,
  Loader2,
  X,
  Clock,
  Share2,
} from "lucide-react";
import { DriveNode } from "../lib/api";
import { useShareLinks, useCreateShareLink, useRevokeShareLink } from "../lib/queries";

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
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 px-5 h-11 rounded-xl text-sm font-bold transition-all shadow-sm border ${
        copied
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 ring-2 ring-emerald-100"
          : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
      }`}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? "Copied" : "Copy Link"}
    </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 sm:p-8 animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden ring-1 ring-black/5 animate-in zoom-in-95 duration-200 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 sm:p-8 border-b border-slate-100">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center shrink-0 ring-4 ring-indigo-50/50">
              <Share2 size={24} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-slate-900 text-xl sm:text-2xl mb-1">Share File</h2>
              <p className="text-sm font-semibold text-slate-500 truncate max-w-[250px] sm:max-w-[350px]">{node.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
          >
            <X size={24} />
          </button>
        </div>

        {/* Create new link */}
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            Create New Link
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex-1 flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100 transition-all">
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
            <button
              onClick={handleCreate}
              disabled={createLink.isPending}
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-indigo-200 transition-all shrink-0"
            >
              {createLink.isPending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Link2 size={18} />
              )}
              Generate Link
            </button>
          </div>
        </div>

        {/* Existing links */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 min-h-[200px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 size={24} className="animate-spin text-indigo-500" />
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
                        : "bg-white border-slate-200 shadow-sm hover:border-indigo-200 hover:shadow-md"
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
                        <button
                          onClick={() => revokeLink.mutate({ linkId: link.id, nodeId: node.id })}
                          disabled={revokeLink.isPending}
                          className="flex items-center justify-center w-11 h-11 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors border border-transparent hover:border-red-100 focus:outline-none focus:ring-2 focus:ring-red-200"
                          title="Revoke Link"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-2 bg-white mt-auto">
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50">
            <p className="text-xs font-semibold text-indigo-600 text-center leading-relaxed">
              Anyone with the link can securely view and download this file.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
