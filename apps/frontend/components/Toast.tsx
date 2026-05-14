"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

type Toast = { id: number; message: string; type: "success" | "error" };
type ToastCtx = { toast: (msg: string, type?: "success" | "error") => void };

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex w-[min(92vw,24rem)] flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] backdrop-blur-md transition-all duration-200 animate-in slide-in-from-right-4 fade-in ${
              t.type === "error"
                ? "border-red-200 bg-red-50/95 text-red-900"
                : "border-slate-200 bg-white/95 text-slate-900"
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                t.type === "error" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
              }`}
            >
              {t.type === "error" ? <XCircle size={16} /> : <CheckCircle size={16} />}
            </div>
            <div className="min-w-0 flex-1 pt-0.5 text-sm font-medium leading-6">{t.message}</div>
            <button
              onClick={() => dismiss(t.id)}
              className="mt-0.5 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss toast"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
