import { cn } from "./lib/utils";

type Props = {
  percent: number;
  className?: string;
  trackClassName?: string;
};

export function ProgressBar({ percent, className, trackClassName }: Props) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  return (
    <div className={cn("w-full bg-white rounded-full h-2.5 overflow-hidden", trackClassName)}>
      <div
        className={cn(
          "h-full rounded-full bg-gradient-to-r from-neon-violet to-neon-mint shadow-[0_0_10px_rgba(167,139,250,0.5)] transition-all duration-300",
          className,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
