import type { ComponentType } from "react";
import { cn } from "./lib/utils";

export type IconBadgeTone = "violet" | "emerald" | "sky" | "slate" | "amber";

const TONE_CLASSES: Record<IconBadgeTone, string> = {
  violet: "bg-neon-violet/10 text-electric-indigo",
  emerald: "bg-neon-mint/10 text-emerald-600",
  sky: "bg-electric-indigo/10 text-electric-indigo",
  slate: "bg-slate-100 text-slate-500",
  amber: "bg-amber-50 text-amber-500",
};

const SIZE_CLASSES = {
  sm: "w-9 h-9 rounded-lg",
  md: "w-10 h-10 rounded-xl",
  lg: "w-11 h-11 rounded-xl",
} as const;

const ICON_SIZE = {
  sm: 16,
  md: 18,
  lg: 20,
} as const;

type Props = {
  icon: ComponentType<{ size?: number; className?: string }>;
  tone?: IconBadgeTone;
  size?: keyof typeof SIZE_CLASSES;
  bordered?: boolean;
  className?: string;
};

export function IconBadge({ icon: Icon, tone = "slate", size = "md", bordered = false, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0",
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        bordered && "border border-slate-100/40",
        className,
      )}
    >
      <Icon size={ICON_SIZE[size]} />
    </div>
  );
}
