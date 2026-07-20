import type { ButtonHTMLAttributes } from "react";
import { cn } from "./lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function Pill({ active = false, className, children, ...props }: Props) {
  return (
    <button
      type="button"
      className={cn(
        "px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all",
        active
          ? "bg-[#0a0a1a] text-white shadow-sm"
          : "bg-white border border-slate-200 text-slate-600 hover:border-neon-mint/60 hover:bg-slate-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
