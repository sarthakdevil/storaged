"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, LayoutGrid, HardDrive, Trash2, Key, ChevronsUpDown } from "lucide-react";
import { useStorageDashboard } from "../lib/queries";
import React, { useEffect, useRef, useState } from "react";
import { StorageConnection } from "../lib/api";
import { useAuth, ProgressBar } from "@repo/ui";

function formatBytes(bytes: bigint | number | string | null | undefined) {
  if (bytes === null || bytes === undefined) return "—";
  const b = typeof bytes === "bigint" ? bytes : BigInt(String(bytes));
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(b);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value = value / 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i < 2 ? 0 : 1)} ${units[i]}`;
}

const NAV = [
  { href: "/drive/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/drive", label: "My Drive", icon: HardDrive },
  { href: "/drive/trash", label: "Trash", icon: Trash2 },
  { href: "/drive/api-keys", label: "API Keys", icon: Key },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <aside className="app-sidebar w-68 shrink-0 h-screen flex flex-col bg-white border-r border-slate-100 text-slate-800">
      {/* Brand */}
      <div className="app-sidebar-brand flex items-center gap-2.5 px-6 py-6 border-b border-slate-100/50">
        <div className="w-9 h-9 bg-neon-violet rounded-xl flex items-center justify-center text-white shadow-[0_0_14px_rgba(167,139,250,0.55)]">
          <span className="font-display font-bold text-sm">S</span>
        </div>
        <span className="font-display font-bold text-base tracking-widest uppercase text-slate-900">
          Storaged
        </span>
      </div>

      {/* Nav */}
      <nav className="app-sidebar-nav flex-1 px-4 py-6 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/drive"
              ? pathname === "/drive"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-colors ${
                active
                  ? "bg-surface-soft border-l-2 border-neon-violet pl-3.5 text-electric-indigo"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} className={active ? "text-neon-violet" : "text-slate-400"} />
              <span className="text-sm font-semibold">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Storage usage meter placed above user profile */}
      <div className="mt-auto">
        <StorageUsageMeter />
      </div>

      {/* User / profile dropdown */}
      <div className="app-sidebar-account px-4 pb-5 border-t border-slate-100/60 pt-4">
        <AccountMenu initials={initials} name={user?.name} email={user?.email} onLogout={handleLogout} />
      </div>
    </aside>
  );
}

function StorageUsageMeter() {
  const { data } = useStorageDashboard();
  const dashboard = data?.pages?.[0] ?? data?.pages?.[data.pages.length - 1] ?? data?.pages?.[0];

  const used = dashboard?.usedBytes ? BigInt(dashboard.usedBytes) : BigInt(0);
  let quota: bigint | null = null;
  if (dashboard?.quotaBytes) {
    try {
      quota = BigInt(dashboard.quotaBytes);
    } catch {
      quota = null;
    }
  } else if (dashboard?.storages) {
    const sum = dashboard.storages.reduce((acc, s) => {
      try {
        return acc + (s.quotaBytes ? BigInt(s.quotaBytes) : BigInt(0));
      } catch {
        return acc;
      }
    }, BigInt(0));
    quota = sum > BigInt(0) ? sum : null;
  }

  const percent = quota && quota > BigInt(0) ? Number((used * BigInt(100)) / quota) : null;

  const storages = dashboard?.storages ?? [];
  let providerLabel = "Default Bucket";
  if (storages.length > 0) {
    const names = storages
      .map((s: StorageConnection) => s.providerLabel ?? s.displayName ?? s.providerName ?? "Unknown")
      .filter(Boolean);
    if (names.length === 1) {
      providerLabel = names[0];
    } else if (names.length > 1) {
      providerLabel = `${names.length} providers`;
    }
  }

  return (
    <div className="px-4 py-4 rounded-2xl bg-surface-soft border border-slate-100 relative mx-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest">Storage Usage</span>
        <span className="text-[10px] font-semibold text-electric-indigo truncate max-w-[100px]">{providerLabel}</span>
      </div>

      <ProgressBar percent={percent ?? 6} />

      <div className="flex items-center justify-between text-xs text-slate-500 mt-3.5">
        <span className="font-semibold text-slate-700">
          {formatBytes(used)} <span className="text-slate-400 font-normal">of</span> {quota ? formatBytes(quota) : "20 GB"} <span className="text-slate-400 font-normal">used</span>
        </span>
        {percent !== null && percent > 85 && (
          <span className="text-[10px] text-rose-500 font-bold">Full</span>
        )}
      </div>
    </div>
  );
}

function AccountMenu({
  initials,
  name,
  email,
  onLogout,
}: {
  initials: string;
  name?: string | null;
  email?: string | null;
  onLogout: () => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 w-full bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-900/10 p-1.5 z-50">
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1 border-b border-slate-100">
            <div className="w-9 h-9 rounded-full bg-neon-violet/10 border border-neon-violet/20 flex items-center justify-center text-xs font-bold text-electric-indigo shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{name ?? "User"}</p>
              <p className="text-xs text-slate-400 truncate">{email ?? "Pro Plan User"}</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await onLogout();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-red-50 text-sm font-semibold text-red-600 transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account"
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl border transition-colors ${
          open
            ? "border-neon-violet/30 bg-neon-violet/5"
            : "border-transparent hover:bg-slate-50"
        }`}
      >
        <div className="w-9 h-9 rounded-full bg-surface-soft border border-neon-violet/20 flex items-center justify-center text-xs font-bold text-electric-indigo shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-bold text-slate-900 truncate">{name ?? "User"}</p>
          <p className="text-xs text-slate-400 truncate">Pro Plan User</p>
        </div>
        <ChevronsUpDown size={14} className="text-slate-400 shrink-0" />
      </button>
    </div>
  );
}
