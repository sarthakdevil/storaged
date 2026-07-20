"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { AuthUser, AuthResponse } from "@repo/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthCtx = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
};

type AuthProviderProps = {
  /** Base API URL, e.g. "http://localhost:8787/api" */
  apiUrl: string;
  children: ReactNode;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const Ctx = createContext<AuthCtx | null>(null);

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function setCookie(name: string, value: string) {
  const exp = new Date(Date.now() + 7 * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ apiUrl, children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const t = localStorage.getItem("token");
      const u = localStorage.getItem("user");
      if (t && u) {
        setToken(t);
        setUser(JSON.parse(u) as AuthUser);
      }
    } catch {
      // localStorage may be unavailable (SSR, private mode)
    }
    setIsLoading(false);
  }, []);

  function persist(t: string, u: AuthUser) {
    setToken(t);
    setUser(u);
    localStorage.setItem("token", t);
    localStorage.setItem("user", JSON.stringify(u));
    setCookie("session_token", t);
  }

  function wipe() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    clearCookie("session_token");
  }

  async function call(endpoint: string, body: object) {
    const res = await fetch(`${apiUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d as { message?: string }).message ?? "Request failed");
    }
    return res.json() as Promise<AuthResponse>;
  }

  const login = async (email: string, password: string) => {
    const d = await call("/auth/login", { email, password });
    persist(d.session.token, d.user);
  };

  const register = async (email: string, password: string, name?: string) => {
    const d = await call("/auth/register", { email, password, name });
    persist(d.session.token, d.user);
  };

  const logout = async () => {
    const t = localStorage.getItem("token");
    if (t) {
      await fetch(`${apiUrl}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => {});
    }
    wipe();
  };

  return (
    <Ctx.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
