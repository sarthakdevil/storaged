"use client";

import { useState } from "react";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  Clock,
  Eye,
  EyeOff,
  X,
  Terminal,
  Shield,
  Zap,
  ChevronRight,
  Globe,
  Lock,
  Sparkles,
  Activity,
} from "lucide-react";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "../../../lib/queries";
import { ApiKey, CreatedApiKey } from "../../../lib/api";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787/api") + "/v1";

const EXPIRY_OPTIONS = [
  { label: "No expiry", value: undefined },
  { label: "30 days", value: 30 * 86400 },
  { label: "90 days", value: 90 * 86400 },
  { label: "1 year", value: 365 * 86400 },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function formatExpiry(iso: string | null) {
  if (!iso) return "Never expires";
  const d = new Date(iso);
  if (d < new Date()) return "Expired";
  return `Expires ${formatDate(iso)}`;
}
function formatLastUsed(iso: string | null) {
  if (!iso) return "Never used";
  return `Last used ${formatDate(iso)}`;
}

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 ${
        copied
          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
          : "bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10 hover:border-white/20"
      }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function CreateKeyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (k: CreatedApiKey) => void }) {
  const [name, setName] = useState("");
  const [expiresIn, setExpiresIn] = useState<number | undefined>(undefined);
  const createKey = useCreateApiKey();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const key = await createKey.mutateAsync({ name: name.trim(), expiresIn });
    onCreated(key);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200/60">
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-neon-violet/10 rounded-xl flex items-center justify-center text-electric-indigo">
                <Key size={18} />
              </div>
              <div>
                <h2 className="font-display font-bold text-slate-900 text-base">Create API Key</h2>
                <p className="text-xs text-slate-500 font-medium">Generate a new authentication token</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all">
              <X size={18} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Key Name</label>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Production Environment"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-neon-violet focus:border-transparent transition-all bg-white"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expiration</label>
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-neon-violet focus-within:border-transparent transition-all">
              <Clock size={16} className="text-slate-400 shrink-0" />
              <select
                value={expiresIn ?? ""}
                onChange={(e) => setExpiresIn(e.target.value === "" ? undefined : Number(e.target.value))}
                className="flex-1 bg-transparent text-sm text-slate-700 font-medium outline-none cursor-pointer appearance-none"
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? ""}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-6 min-h-11 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createKey.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 min-h-11 rounded-xl bg-neon-violet hover:bg-[#8b5cf6] disabled:opacity-50 text-white text-sm font-bold transition-all shadow-md shadow-neon-violet/20"
            >
              {createKey.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Generate Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RevealKeyModal({ created, onClose }: { created: CreatedApiKey; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in zoom-in-95 duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200/60 relative">
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <Check size={20} />
            </div>
            <div>
              <h2 className="font-display font-bold text-slate-900 text-base">Key Created Successfully</h2>
              <p className="text-xs text-slate-500 font-medium">Copy your key immediately</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 shadow-inner">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{created.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVisible((v) => !v)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                >
                  {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <CopyBtn text={created.key} label="Copy secret" />
              </div>
            </div>
            <code className="block text-sm font-mono text-emerald-400 break-all leading-relaxed bg-black/30 p-3 rounded-lg border border-white/5">
              {visible ? created.key : created.key.slice(0, 14) + "•".repeat(Math.max(0, created.key.length - 14))}
            </code>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 items-start">
            <Shield size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 leading-relaxed font-medium">
              <strong className="text-amber-600 block mb-0.5">Keep this key safe.</strong>
              For security, we only display it once. Store it securely in your environment variables or secrets manager.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3.5 px-6 min-h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-all shadow-md"
          >
            I&apos;ve stored it safely
          </button>
        </div>
      </div>
    </div>
  );
}

const ENDPOINTS = [
  { method: "GET",    path: "/files",             desc: "List all files and folders",          note: "Query: ?parentId=<id>  ?type=FILE|FOLDER  ?search=<query>" },
  { method: "GET",    path: "/files/:id",          desc: "Get a single file or folder" },
  { method: "POST",   path: "/files/upload",       desc: "Upload a file",                       body: "multipart/form-data  ·  field: file (required), parentId (optional)" },
  { method: "POST",   path: "/folders",            desc: "Create a folder",                     body: '{ "name": "string", "parentId": "string?" }' },
  { method: "PATCH",  path: "/files/:id",          desc: "Rename or update a file/folder",      body: '{ "name": "string?", "description": "string?" }' },
  { method: "GET",    path: "/files/:id/download", desc: "Get a presigned download URL",        note: "Query: ?expiresIn=<seconds>  (default: 3600)" },
  { method: "DELETE", path: "/files/:id",          desc: "Permanently delete a file or folder" },
];

const METHOD_STYLES_DARK: Record<string, string> = {
  GET:    "bg-sky-500/20 text-sky-400 border-sky-500/30",
  POST:   "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  PATCH:  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  DELETE: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

function ApiReference({ apiBase }: { apiBase: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl bg-[#0A0F1C] border border-white/10 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] overflow-hidden mt-8 transition-all duration-500">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-8 py-6 text-left hover:bg-white/5 transition-all group relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-linear-to-r from-neon-violet/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="flex items-center gap-5 relative z-10">
          <div className="w-12 h-12 bg-linear-to-br from-neon-violet/20 to-electric-indigo/20 rounded-2xl flex items-center justify-center border border-white/10">
            <Terminal size={20} className="text-neon-violet" />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-white text-lg tracking-wide">API Documentation</h3>
            <p className="text-sm text-indigo-200/60 mt-1 font-medium">{ENDPOINTS.length} endpoints available for integration</p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <span className="text-sm font-bold text-neon-violet hidden sm:block opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
            {open ? "Collapse Docs" : "Explore API"}
          </span>
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all duration-300 ${open ? "bg-neon-violet text-white border-neon-violet rotate-90 shadow-[0_0_15px_rgba(167,139,250,0.5)]" : "border-white/10 bg-white/5 text-slate-400"}`}>
            <ChevronRight size={18} />
          </div>
        </div>
      </button>

      <div className={`grid transition-all duration-500 ease-in-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-white/10">
            <div className="px-8 py-8 grid lg:grid-cols-2 gap-8 bg-black/20">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-neon-violet/20">
                    <Lock size={14} className="text-neon-violet" />
                  </div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-widest">Authentication</h4>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-3">
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1.5 uppercase font-bold tracking-wider">Primary Header</p>
                    <code className="text-sm font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 block">Bearer {"<your_api_key>"}</code>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1.5 uppercase font-bold tracking-wider">Alternative</p>
                    <code className="text-sm font-mono text-sky-400 bg-sky-500/10 px-3 py-1.5 rounded-lg border border-sky-500/20 block">X-API-Key: {"<your_api_key>"}</code>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-electric-indigo/20">
                    <Globe size={14} className="text-electric-indigo" />
                  </div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-widest">Base URL</h4>
                </div>
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5 h-31 flex flex-col justify-center">
                  <p className="text-[11px] text-slate-400 mb-2 uppercase font-bold tracking-wider">Production Endpoint</p>
                  <div className="flex items-center gap-3">
                    <code className="text-sm font-mono text-white bg-white/10 px-3 py-2 rounded-xl border border-white/10 flex-1 truncate">{apiBase}</code>
                    <CopyBtn text={apiBase} />
                  </div>
                </div>
              </div>
            </div>

            <div className="divide-y divide-white/5 p-4">
              {ENDPOINTS.map((ep) => (
                <div key={ep.path + ep.method} className="p-4 hover:bg-white/3 rounded-2xl transition-all group">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg font-mono tracking-wider border shadow-sm ${METHOD_STYLES_DARK[ep.method]}`}>
                      {ep.method}
                    </span>
                    <code className="text-[15px] font-mono text-white font-semibold">{ep.path}</code>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <CopyBtn text={`${apiBase}${ep.path}`} label="Copy" />
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 font-medium ml-1 mb-3">{ep.desc}</p>
                  
                  {ep.body && (
                    <div className="bg-black/40 rounded-xl p-3 border border-white/5 inline-block">
                      <p className="text-[10px] text-slate-500 mb-1.5 uppercase font-bold tracking-widest">Payload</p>
                      <code className="text-xs font-mono text-amber-300/90">{ep.body}</code>
                    </div>
                  )}
                  {ep.note && (
                    <div className="mt-2 inline-block">
                      <span className="text-xs text-neon-violet bg-neon-violet/10 rounded-lg px-3 py-1.5 font-mono border border-neon-violet/20">{ep.note}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyRow({ apiKey }: { apiKey: ApiKey }) {
  const revoke = useRevokeApiKey();
  const isExpired = apiKey.expiresAt ? new Date(apiKey.expiresAt) < new Date() : false;

  return (
    <div className={`flex items-center gap-5 px-8 py-5 border-b border-slate-100/60 last:border-0 hover:bg-neon-violet/5 transition-all duration-300 group relative overflow-hidden ${isExpired ? "opacity-60 grayscale-[0.5]" : ""}`}>
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-neon-violet opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border transition-transform group-hover:scale-110 duration-300 ${isExpired ? "bg-slate-100 border-slate-200" : "bg-white border-neon-violet/20 shadow-neon-violet/10"}`}>
        <Key size={18} className={isExpired ? "text-slate-400" : "text-electric-indigo"} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5">
          <p className="text-base font-bold text-slate-900 truncate tracking-tight">{apiKey.name}</p>
          {isExpired ? (
            <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-red-100 text-red-600 rounded-full border border-red-200">EXPIRED</span>
          ) : (
            <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-emerald-100 text-emerald-600 rounded-full border border-emerald-200">ACTIVE</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <code className="text-xs font-mono text-slate-600 font-bold bg-slate-100/80 border border-slate-200 px-2.5 py-1 rounded-lg tracking-wider">
            {apiKey.prefix}<span className="text-slate-400">••••••••</span>
          </code>
          <span className="text-slate-300 text-xs">•</span>
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5"><Activity size={12}/> {formatLastUsed(apiKey.lastUsedAt)}</span>
          <span className="text-slate-300 text-xs">•</span>
          <span className={`text-xs font-medium flex items-center gap-1.5 ${isExpired ? "text-red-500" : "text-slate-500"}`}><Clock size={12}/> {formatExpiry(apiKey.expiresAt)}</span>
        </div>
      </div>

      <button
        onClick={() => revoke.mutate(apiKey.id)}
        disabled={revoke.isPending}
        className="p-3 rounded-xl text-slate-400 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 hover:shadow-sm transition-all shrink-0 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0"
        aria-label="Revoke key"
      >
        {revoke.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
      </button>
    </div>
  );
}

export default function ApiKeysPage() {
  const { data: keys = [], isLoading } = useApiKeys();
  const [showCreate, setShowCreate] = useState(false);
  const [revealed, setRevealed] = useState<CreatedApiKey | null>(null);

  const activeKeys = keys.filter(k => !k.expiresAt || new Date(k.expiresAt) >= new Date()).length;

  return (
    <div className="drive-view flex flex-col min-h-full bg-surface relative pb-20">
      {/* Decorative background blurs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-neon-violet/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-electric-indigo/10 rounded-full blur-[100px] pointer-events-none" />

      <header className="drive-toolbar relative z-20 border-b border-slate-200/50 bg-surface">
        <div className="drive-inner flex items-center justify-between gap-4 w-full py-2">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 bg-linear-to-br from-[#0a0a1a] to-[#3730a3] rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-900/20">
              <Key size={20} className="text-white" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-electric-indigo font-extrabold mb-0.5">Developer Settings</p>
              <h1 className="font-display text-2xl font-extrabold bg-linear-to-r from-slate-900 to-[#4c1d95] text-transparent bg-clip-text tracking-tight">API Keys</h1>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="group flex items-center justify-center gap-3 px-8 py-3.5 min-h-12 rounded-xl bg-neon-violet hover:bg-[#8b5cf6] text-white text-sm font-bold transition-all shadow-[0_8px_20px_-6px_rgba(167,139,250,0.5)] hover:shadow-[0_12px_25px_-6px_rgba(167,139,250,0.6)] hover:-translate-y-0.5"
          >
            <Plus size={18} className="transition-transform group-hover:rotate-90 duration-300" />
            Generate New Key
          </button>
        </div>
      </header>

      <div className="drive-inner py-10 relative z-10 max-w-6xl flex flex-col gap-10">
        {/* Premium Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Sparkles, label: "Active Tokens", value: activeKeys,   bg: "bg-linear-to-br from-neon-violet to-electric-indigo", border: "border-neon-violet/20" },
            { icon: Shield,   label: "Total Created", value: keys.length, bg: "bg-linear-to-br from-slate-700 to-slate-900", border: "border-slate-200" },
            { icon: Zap,      label: "Recently Used", value: keys.filter(k => k.lastUsedAt).length, bg: "bg-linear-to-br from-emerald-500 to-teal-600", border: "border-emerald-100" },
          ].map(({ icon: Icon, label, value, bg, border }) => (
            <div key={label} className={`bg-white/60 backdrop-blur-lg rounded-2xl border ${border} p-6 flex items-center gap-5 shadow-sm hover:shadow-md transition-shadow hover:bg-white/80`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg ${bg} shrink-0`}>
                <Icon size={22} />
              </div>
              <div>
                <p className="text-3xl font-black text-slate-900 tracking-tight leading-none">{value}</p>
                <p className="text-sm text-slate-500 font-bold uppercase tracking-wider mt-1">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main Keys Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100/60 flex items-center justify-between bg-white/50">
            <div>
              <h2 className="font-display text-lg font-extrabold text-slate-900">Authentication Keys</h2>
              <p className="text-sm text-slate-500 font-medium mt-1">Manage your programmatic access tokens</p>
            </div>
            <div className="flex items-center gap-2 bg-slate-100/80 px-4 py-2 rounded-xl border border-slate-200/60">
              <Key size={14} className="text-electric-indigo" />
              <span className="text-sm font-bold text-slate-700">{keys.length} Tokens</span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-12 h-12 border-4 border-neon-violet/20 border-t-neon-violet rounded-full animate-spin" />
              <span className="text-sm font-bold text-slate-500 animate-pulse">Loading securely…</span>
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-5 text-center px-6">
              <div className="w-20 h-20 bg-linear-to-br from-neon-violet/10 to-electric-indigo/10 rounded-2xl flex items-center justify-center border border-neon-violet/20 shadow-inner">
                <Key size={32} className="text-neon-violet" />
              </div>
              <div>
                <p className="text-lg font-extrabold text-slate-900">No active keys found</p>
                <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Generate an API key to securely authenticate and interact with our endpoints programmatically.</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 flex items-center justify-center gap-3 px-8 py-3.5 min-h-12 rounded-xl bg-[#0a0a1a] hover:bg-[#1a1a2e] text-white text-sm font-bold transition-all shadow-lg shadow-slate-900/20 hover:-translate-y-0.5"
              >
                <Plus size={18} />
                Generate First Key
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100/50">
              {keys.map((k) => <KeyRow key={k.id} apiKey={k} />)}
            </div>
          )}
        </div>

        <ApiReference apiBase={API_BASE} />
      </div>

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={(k) => { setShowCreate(false); setRevealed(k); }}
        />
      )}
      {revealed && (
        <RevealKeyModal created={revealed} onClose={() => setRevealed(null)} />
      )}
    </div>
  );
}
