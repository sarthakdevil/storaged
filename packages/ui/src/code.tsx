import { type JSX } from "react";

export function Code({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  const style: React.CSSProperties = {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
    background: "rgba(15,23,42,0.04)",
    padding: "6px 8px",
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.4,
    color: "#0f172a",
  };

  return (
    <code className={className} style={style}>
      {children}
    </code>
  );
}
