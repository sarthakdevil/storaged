import { type JSX } from "react";

export function Card({
  className = "",
  title,
  children,
  href,
}: {
  className?: string;
  title: string;
  children: React.ReactNode;
  href?: string;
}): JSX.Element {
  const containerStyle: React.CSSProperties = {
    display: "block",
    padding: 16,
    borderRadius: 12,
    background: "linear-gradient(180deg,#ffffff,#f8fafc)",
    border: "1px solid rgba(15,23,42,0.04)",
    boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
    textDecoration: "none",
    color: "inherit",
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };

  const content = (
    <div className={className} style={containerStyle}>
      <h3 style={titleStyle}>
        <span>{title}</span>
        <span style={{ opacity: 0.65, fontWeight: 600 }}>→</span>
      </h3>
      <div style={{ color: "#475569", fontSize: 14 }}>{children}</div>
    </div>
  );

  if (href) {
    const hrefWithUtm = href.includes("?")
      ? `${href}&utm_source=storaged&utm_medium=ui&utm_campaign=cards`
      : `${href}?utm_source=storaged&utm_medium=ui&utm_campaign=cards`;
    return (
      <a href={hrefWithUtm} rel="noopener noreferrer" target="_blank">
        {content}
      </a>
    );
  }

  return content;
}
