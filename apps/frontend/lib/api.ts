const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

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

// ─── Types ────────────────────────────────────────────────────────────────────

export type NodeTag = { id: string; name: string; color: string | null };

export type DriveNode = {
  id: string;
  driveId: string;
  parentId: string | null;
  type: "FILE" | "FOLDER";
  name: string;
  path: string;
  description: string | null;
  sizeBytes: string;
  mimeType: string | null;
  isFavorite: boolean;
  tags: NodeTag[];
  createdAt: string;
  updatedAt: string;
};

export type TrashNode = {
  id: string;
  driveId: string;
  type: "FILE" | "FOLDER";
  originalName: string | null;
  originalPath: string | null;
  sizeBytes: string;
  mimeType: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export type StorageProvider = "s3" | "supabase" | "backblaze" | "storj" | "cloudflare-r2";

export type StorageConnectionConfig = {
  accessKeyId?: string;
  endpointUrl?: string;
  region?: string;
  projectRef?: string;
  accountId?: string;
  forcePathStyle?: boolean;
  quotaGb?: number;
};

export type StorageConnection = {
  id: string;
  providerName: StorageProvider;
  providerLabel?: string;
  displayName: string | null;
  bucketName: string;
  config: StorageConnectionConfig;
  isActive: boolean;
  status: "connected" | "limited" | "error" | "inactive";
  statusMessage: string;
  usedBytes: string;
  totalBytes: string | null;
  quotaBytes: string | null;
  availableBytes: string | null;
  activeObjects: number;
  totalObjects: number;
  sizeEstimateSource: string;
  lastCheckedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type StorageConnectionInput = {
  provider: StorageProvider;
  displayName?: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey?: string;
  endpointUrl?: string;
  region?: string;
  projectRef?: string;
  accountId?: string;
  forcePathStyle?: boolean;
  isActive?: boolean;
  quotaGb?: number;
};

export type StorageConnectionsPage = {
  items: StorageConnection[];
  nextCursor: string | null;
};

export type StorageDashboard = {
  totalStorages: number;
  activeStorages: number;
  connectedStorages: number;
  erroredStorages: number;
  usedBytes: string;
  totalBytes: string | null;
  quotaBytes: string | null;
  availableBytes: string | null;
  totalObjects: number;
  activeObjects: number;
  totalConnections: number;
  nextCursor: string | null;
  storages: StorageConnection[];
};

export type AuthUser = { id: string; email: string; name: string | null };

export type ShareLink = {
  id: string;
  token: string;
  nodeId: string;
  expiresAt: string | null;
  createdAt: string;
};

export type ApiKey = {
  id: string;
  name: string;
  prefix: string; // first 14 chars, safe to display
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type CreatedApiKey = ApiKey & {
  key: string; // full key — returned only on creation
};
