"use client";

import { AlertTriangle, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Yes",
  cancelLabel = "No",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
      <div className="custom-modal w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start gap-4 px-6 py-5 border-b border-slate-100 bg-slate-50/80">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              danger ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
            }`}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 break-words text-sm leading-6 text-slate-500">{description}</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-600"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-5 bg-white">
          <button
            onClick={onCancel}
            className="min-w-24 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`min-w-24 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${
              danger ? "bg-red-500 hover:bg-red-600" : "bg-neon-violet hover:bg-[#8b5cf6] shadow-[0_6px_18px_-4px_rgba(167,139,250,0.55)]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
