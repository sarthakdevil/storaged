import type {
  DriveNode,
  TrashNode,
  NodeTag,
  StorageProvider,
  StorageConnection,
  StorageConnectionConfig,
  StorageConnectionInput,
  StorageConnectionsPage,
  StorageDashboard,
  AuthUser,
  ApiKey,
  CreatedApiKey,
  ShareLink,
} from "@repo/types";

// Re-export all types so existing imports from "./api" continue to work
export type {
  DriveNode,
  TrashNode,
  NodeTag,
  StorageProvider,
  StorageConnection,
  StorageConnectionConfig,
  StorageConnectionInput,
  StorageConnectionsPage,
  StorageDashboard,
  AuthUser,
  ApiKey,
  CreatedApiKey,
  ShareLink,
};

// ─── API URL ─────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? "Request failed");
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),

  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
};
