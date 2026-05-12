"use client";

import { ReactNode, ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

const baseStyles: Record<Variant, string> = {
  primary:
    "background: var(--color-primary); color: white; border: 0; box-shadow: 0 8px 24px rgba(99,102,241,0.16);",
  secondary:
    "background: transparent; color: var(--color-primary-dark); border: 1px solid rgba(15,23,42,0.06);",
  ghost:
    "background: transparent; color: inherit; border: 0;",
};

const sizeStyles: Record<string, string> = {
  sm: "padding:6px 10px; font-size:13px; border-radius:10px;",
  md: "padding:10px 14px; font-size:15px; border-radius:12px;",
  lg: "padding:12px 18px; font-size:16px; border-radius:14px;",
};

export const Button = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  disabled,
  ...rest
}: ButtonProps) => {
  const style = `${baseStyles[variant]} ${sizeStyles[size]} cursor: ${
    disabled ? "not-allowed; opacity:0.7" : "pointer"
  } display:inline-flex; align-items:center; justify-content:center; gap:8px; font-weight:700;`;

  return (
    <button
      {...rest}
      disabled={disabled}
      aria-disabled={disabled}
      className={className}
      // eslint-disable-next-line react/button-has-type
      type={(rest && (rest as any).type) || "button"}
      style={styleStringToObject(style)}
    >
      {children}
    </button>
  );
};

function styleStringToObject(s: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  s.split(";").forEach((chunk) => {
    const [k, ...vals] = chunk.split(":");
    if (!k) return;
    const key = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const val = vals.join(":").trim();
    if (val === "") return;
    out[key] = val;
  });
  return out;
}
