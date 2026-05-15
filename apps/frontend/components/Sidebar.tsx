"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HardDrive, Trash2, LogOut, LayoutDashboard } from "lucide-react";
import { useStorageDashboard } from "../lib/queries";
import React, { useEffect, useRef, useState } from "react";

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
import { useAuth } from "./AuthContext";

const NAV = [
  { href: "/drive/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/drive", icon: HardDrive, label: "My Drive" },
  { href: "/drive/trash", icon: Trash2, label: "Trash" },
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
    <aside className="app-sidebar w-64 shrink-0 h-screen flex flex-col bg-[#0f172a] text-white">
      {/* Brand */}
      <div className="app-sidebar-brand flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
        <div className="app-sidebar-brand-mark w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center">
          <HardDrive size={18} className="text-white" />
        </div>
        <span className="font-extrabold text-lg tracking-tight">Storaged</span>
      </div>

      {/* Nav */}
      <nav className="app-sidebar-nav flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active =
            href === "/drive"
              ? pathname === "/drive"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`app-sidebar-link flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                active
                  ? "bg-indigo-500/20 text-indigo-300"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="text-sm font-semibold">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User / logout */}
        {/* User / profile dropdown */}
        <div className="app-sidebar-account px-3 pb-4 border-t border-white/10 pt-3 relative">
          <div className="app-sidebar-user flex items-center gap-3 px-3 py-2">
            <button
              aria-label="Account"
              className="flex items-center gap-3 w-full text-left"
              id="account-toggle"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <div
                id="account-avatar"
                className="app-sidebar-avatar w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-sm font-bold shrink-0"
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {user?.name ?? "User"}
                </p>
                <p className="text-sm text-slate-300 truncate">{user?.email}</p>
              </div>
            </button>
          </div>

          {/* Keep storage meter visible in sidebar (not only in dropdown) */}
          <div className="mt-3">
            <StorageUsageMeter />
          </div>

          <div className="mt-2">
            <ProfileDropdown onLogout={handleLogout} />
          </div>
        </div>
    </aside>
  );
}

function StorageUsageMeter() {
  const { data } = useStorageDashboard();
  const dashboard = data?.pages?.[0] ?? data?.pages?.[data.pages.length - 1] ?? data?.pages?.[0];
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const used = dashboard?.usedBytes ? BigInt(dashboard.usedBytes) : 0n;
  let quota: bigint | null = null;
  if (dashboard?.quotaBytes) {
    try {
      quota = BigInt(dashboard.quotaBytes);
    } catch {
      quota = null;
    }
  } else if (dashboard?.storages) {
    // try to sum per-storage quotas
    const sum = dashboard.storages.reduce((acc, s) => {
      try {
        return acc + (s.quotaBytes ? BigInt(s.quotaBytes) : 0n);
      } catch {
        return acc;
      }
    }, 0n);
    quota = sum > 0n ? sum : null;
  }

  const percent = quota && quota > 0n ? Number((used * 100n) / quota) : null;

  // Get provider name(s)
  const storages = dashboard?.storages ?? [];
  let providerLabel = "Unknown";
  if (storages.length > 0) {
    const names = storages
      .map((s: any) => s.providerLabel ?? s.displayName ?? s.providerName ?? "Unknown")
      .filter(Boolean);
    if (names.length === 1) {
      providerLabel = names[0];
    } else if (names.length > 1) {
      providerLabel = `${names.length} providers`;
    }
  }

  // color thresholds
  let barClass = "bg-emerald-400"; // green
  if (percent !== null) {
    if (percent > 85) barClass = "bg-rose-500"; // red
    else if (percent > 70) barClass = "bg-amber-400"; // amber
  } else {
    barClass = "bg-slate-500";
  }

  useEffect(() => {
    if (!showTooltip) return;
    const handler = (e: MouseEvent) => {
      if (!tooltipRef.current?.contains(e.target as Node)) setShowTooltip(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTooltip]);

  const progressColors = [
    "bg-indigo-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-sky-500",
  ];

  return (
    <div className="px-3 relative">
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-white/5 px-2 py-1 rounded transition"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        ref={tooltipRef}
      >
        <div className="text-xs text-slate-400 mb-2">Storage</div>
        <div className="text-xxs text-slate-400 ml-2">{providerLabel}</div>
      </div>

      <div className="w-full bg-white/5 rounded-md h-3 overflow-hidden">
        <div
          className={`h-full ${barClass}`}
          style={{ width: percent !== null ? `${Math.min(Math.max(percent, 0), 100)}%` : "6%" }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${barClass}`} />
          <div>{formatBytes(used)} used</div>
        </div>
        <div className="text-right">
          <div>{quota ? formatBytes(quota) : "— available"}</div>
          {percent !== null && percent > 85 ? (
            <div className="text-xxs text-rose-400">High usage</div>
          ) : percent !== null && percent > 70 ? (
            <div className="text-xxs text-amber-300">Approaching full</div>
          ) : null}
        </div>
      </div>

      {/* Tooltip - breakdown by provider */}
      {showTooltip && storages.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-900 border border-slate-700 rounded-lg p-3 z-50 text-xs text-slate-200">
          <div className="font-semibold text-slate-100 mb-2">Storage Breakdown</div>
          {storages.map((storage: any, idx: number) => {
            const storageUsed = storage.usedBytes ? BigInt(storage.usedBytes) : 0n;
            const storageQuota = storage.quotaBytes ? BigInt(storage.quotaBytes) : null;
            const storagePercent =
              storageQuota && storageQuota > 0n
                ? Number((storageUsed * 100n) / storageQuota)
                : null;
            const barClass = progressColors[idx % progressColors.length];
            return (
              <div key={storage.id ?? idx} className="mb-3 last:mb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-slate-100">
                    {storage.providerLabel ?? storage.displayName ?? storage.providerName ?? "Unknown"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {formatBytes(storageUsed)}
                    {storageQuota ? ` / ${formatBytes(storageQuota)}` : ""}
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full ${barClass}`}
                    style={{
                      width:
                        storagePercent !== null
                          ? `${Math.min(Math.max(storagePercent, 0), 100)}%`
                          : "10%",
                    }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {storagePercent !== null ? `${storagePercent.toFixed(0)}% full` : "No quota set"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProfileDropdown({ onLogout }: { onLogout: () => Promise<void> }) {
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
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-1 py-2 rounded-md hover:bg-white/3 transition-colors text-slate-300"
        aria-expanded={open}
      >
        <span className="text-xs">Account</span>
        <span className="text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 w-64 bg-[#071025] border border-white/6 rounded-md shadow-lg p-3 z-50">
          <div className="mb-2">
            <StorageUsageMeter />
          </div>
          <button
            onClick={async () => {
              await onLogout();
              setOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 text-sm text-slate-100"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
