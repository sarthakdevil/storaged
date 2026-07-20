"use client";

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  api,
  ApiKey,
  CreatedApiKey,
  DriveNode,
  ShareLink,
  StorageConnection,
  StorageConnectionInput,
  StorageDashboard,
  TrashNode,
} from "./api";
import { useAuth } from "@repo/ui";
import { useToast } from "@repo/ui";

const PROVIDER_DEFAULT_QUOTA_GB: Record<string, number> = {
  "s3": 5,
  "cloudflare-r2": 10,
  "backblaze": 10,
  "supabase": 1,
  "storj": 25,
};

const gbToBytes = (gb: number) => BigInt(Math.round(gb * 1024 * 1024 * 1024));

type StorageConnectionWithQuotaSource = StorageConnection & {
  quotaSource?: "provider-default" | "provider-reported" | "unknown";
};

function applyDefaultQuota(conn: StorageConnectionWithQuotaSource) {
  const originalQuota = conn.quotaBytes;

  if (conn.quotaBytes === null || conn.quotaBytes === undefined) {
    const gb = PROVIDER_DEFAULT_QUOTA_GB[conn.providerName] ?? null;
    if (gb !== null) {
      const quota = gbToBytes(gb);
      conn.quotaBytes = quota.toString();
      try {
        const used = BigInt(conn.usedBytes ?? "0");
        const avail = quota > used ? (quota - used).toString() : "0";
        conn.availableBytes = avail;
      } catch {
        conn.availableBytes = null;
      }
    }
  } else {
    // If quota provided as number/string, normalize to string
    conn.quotaBytes = conn.quotaBytes !== null ? String(conn.quotaBytes) : conn.quotaBytes;
    if ((conn.availableBytes === null || conn.availableBytes === undefined) && conn.quotaBytes) {
      try {
        const quota = BigInt(conn.quotaBytes);
        const used = BigInt(conn.usedBytes ?? "0");
        conn.availableBytes = quota > used ? (quota - used).toString() : "0";
      } catch {
        conn.availableBytes = null;
      }
    }
  }

  // Mark where the quota came from so UI can show a legend
  if (originalQuota === null || originalQuota === undefined) {
    if (conn.quotaBytes) conn.quotaSource = "provider-default";
    else conn.quotaSource = "unknown";
  } else {
    conn.quotaSource = "provider-reported";
  }

  return conn;
}

export const keys = {
  nodes: ["nodes"] as const,
  trash: ["trash"] as const,
  storageConnections: ["storage-connections"] as const,
  storageDashboard: ["storage-dashboard"] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useNodes() {
  const { token } = useAuth();
  const router = useRouter();
  return useQuery({
    queryKey: keys.nodes,
    queryFn: async () => {
      try {
        return await api.get<DriveNode[]>("/files");
      } catch (err) {
        if (err instanceof Error && err.message.includes("401")) router.push("/login");
        throw err;
      }
    },
    enabled: !!token,
  });
}

export function useTrash() {
  const { token } = useAuth();
  const router = useRouter();
  return useQuery({
    queryKey: keys.trash,
    queryFn: async () => {
      try {
        return await api.get<TrashNode[]>("/files/trash");
      } catch (err) {
        if (err instanceof Error && err.message.includes("401")) router.push("/login");
        throw err;
      }
    },
    enabled: !!token,
  });
}

export function useStorageConnections() {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: keys.storageConnections,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<{ items: StorageConnection[]; nextCursor: string | null }>(
        `/storage/connections?limit=10${pageParam ? `&cursor=${pageParam}` : ""}`,
      );
      return {
        items: res.items.map((it) => applyDefaultQuota(it)),
        nextCursor: res.nextCursor,
      };
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!token,
  });
}

export function useStorageDashboard() {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: keys.storageDashboard,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<StorageDashboard>(
        `/storage/dashboard?limit=10${pageParam ? `&cursor=${pageParam}` : ""}`,
      );
      return {
        ...res,
        storages: res.storages.map((s) => applyDefaultQuota(s)),
      };
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!token,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useTrashNode() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => api.post(`/files/${id}/trash`),
    onSuccess: (_, id) => {
      qc.setQueryData<DriveNode[]>(keys.nodes, (prev) => prev?.filter((n) => n.id !== id) ?? []);
      toast("Moved to trash");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Failed to trash", "error");
    },
  });
}

export function useRestoreNode() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => api.post(`/files/${id}/restore`),
    onSuccess: (_, id) => {
      qc.setQueryData<TrashNode[]>(keys.trash, (prev) => prev?.filter((n) => n.id !== id) ?? []);
      qc.invalidateQueries({ queryKey: keys.nodes });
      toast("Item restored to your drive");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Restore failed", "error");
    },
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => api.del(`/files/${id}`),
    onSuccess: (_, id) => {
      qc.setQueryData<TrashNode[]>(keys.trash, (prev) => prev?.filter((n) => n.id !== id) ?? []);
      toast("Permanently deleted");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    },
  });
}

export function useEmptyTrash() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (nodes: TrashNode[]) =>
      Promise.all(nodes.map((n) => api.del(`/files/${n.id}`))),
    onSuccess: () => {
      qc.setQueryData<TrashNode[]>(keys.trash, []);
      toast("Trash emptied");
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: keys.trash });
      toast("Some items could not be deleted", "error");
    },
  });
}

type UpdateNodeVars = {
  id: string;
  name?: string;
  description?: string | null;
  isFavorite?: boolean;
  tags?: string[];
};

export function useUpdateNode() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateNodeVars) =>
      api.patch<DriveNode>(`/files/${id}`, body),
    onSuccess: (updated) => {
      qc.setQueryData<DriveNode[]>(keys.nodes, (prev) =>
        prev?.map((n) => (n.id === updated.id ? updated : n)) ?? []
      );
      toast("Details saved");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      api.patch<DriveNode>(`/files/${id}`, { isFavorite }),
    onSuccess: (updated) => {
      qc.setQueryData<DriveNode[]>(keys.nodes, (prev) =>
        prev?.map((n) => (n.id === updated.id ? updated : n)) ?? []
      );
      toast(updated.isFavorite ? "Added to favorites" : "Removed from favorites");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Failed to update favorite", "error");
    },
  });
}

export function useUploadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, file }: { parentId: string | null; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      if (parentId) fd.append("parentId", parentId);
      return api.upload<DriveNode>("/files", fd);
    },
    onSuccess: (node) => {
      qc.setQueryData<DriveNode[]>(keys.nodes, (prev) => {
        if (!prev) return [node];
        if (prev.some((n) => n.id === node.id)) return prev;
        return [node, ...prev];
      });
      qc.invalidateQueries({ queryKey: keys.storageDashboard });
    },
  });
}

type InitiateUploadResponse = {
  uploadSessionId: string;
  partSizeBytes: number;
};

type UploadStatusResponse = {
  id: string;
  status: "INITIATED" | "UPLOADING" | "COMPLETING" | "COMPLETED" | "FAILED" | "ABORTED";
  nodeId: string | null;
  errorMessage: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useMultipartUploadFile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      parentId,
      file,
      onProgress,
    }: {
      parentId: string | null;
      file: File;
      onProgress?: (pct: number) => void;
    }) => {
      const init = await api.post<InitiateUploadResponse>("/uploads/initiate", {
        fileName: file.name,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        parentId: parentId ?? undefined,
      });

      const totalParts = Math.ceil(file.size / init.partSizeBytes);
      const parts: { partNumber: number; etag: string }[] = [];

      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * init.partSizeBytes;
        const end = Math.min(partNumber * init.partSizeBytes, file.size);
        const chunk = file.slice(start, end);

        const { url } = await api.post<{ url: string }>(
          `/uploads/${init.uploadSessionId}/part-url`,
          { partNumber },
        );

        const putRes = await fetch(url, {
          method: "PUT",
          body: chunk,
        });

        if (!putRes.ok) {
          throw new Error(`Part ${partNumber} upload failed`);
        }

        const etag = putRes.headers.get("etag");
        if (!etag) {
          throw new Error(
            "Upload succeeded but ETag header is missing. Configure bucket CORS to expose the ETag header.",
          );
        }

        parts.push({ partNumber, etag });
        onProgress?.(Math.round((parts.length / totalParts) * 100));
      }

      await api.post(`/uploads/${init.uploadSessionId}/complete`, { parts });

      // Poll status until the worker finalizes and creates the file node.
      const maxWaitMs = 10 * 60 * 1000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitMs) {
        const status = await api.get<UploadStatusResponse>(`/uploads/${init.uploadSessionId}`);

        if (status.status === "COMPLETED") {
          return { uploadSessionId: init.uploadSessionId, nodeId: status.nodeId };
        }

        if (status.status === "FAILED" || status.status === "ABORTED") {
          throw new Error(status.errorMessage ?? "Upload failed");
        }

        await sleep(1000);
      }

      throw new Error("Upload is taking too long to finalize. Please check again in a moment.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.nodes });
      qc.invalidateQueries({ queryKey: keys.storageDashboard });
    },
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) =>
      api.post<DriveNode>("/files/folders", {
        name,
        parentId: parentId ?? undefined,
      }),
    onSuccess: (created) => {
      qc.setQueryData<DriveNode[]>(keys.nodes, (prev) => {
        const next = [...(prev ?? []), created];
        return next.sort((a, b) => {
          if (a.type !== b.type) return a.type === "FOLDER" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      });
      toast("Folder created");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Folder creation failed", "error");
    },
  });
}

export function useCreateStorageConnection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: StorageConnectionInput) =>
      api.post<StorageConnection>("/storage/connections", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.storageConnections });
      qc.invalidateQueries({ queryKey: keys.storageDashboard });
      toast("Storage connected");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Could not connect storage", "error");
    },
  });
}

export function useDeleteStorageConnection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => api.del(`/storage/connections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.storageConnections });
      qc.invalidateQueries({ queryKey: keys.storageDashboard });
      toast("Storage connection removed");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Could not remove storage", "error");
    },
  });
}

export function useUpdateStorageConnection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<StorageConnectionInput>) =>
      api.patch<StorageConnection>(`/storage/connections/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.storageConnections });
      qc.invalidateQueries({ queryKey: keys.storageDashboard });
      toast("Storage connection updated");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Could not update storage", "error");
    },
  });
}

// ─── API keys ─────────────────────────────────────────────────────────────────

export function useApiKeys() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKey[]>("/apikeys"),
    enabled: !!token,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ name, expiresIn }: { name: string; expiresIn?: number }) =>
      api.post<CreatedApiKey>("/apikeys", { name, expiresIn }),
    onSuccess: (created) => {
      qc.setQueryData<ApiKey[]>(["api-keys"], (prev) =>
        prev ? [created, ...prev] : [created]
      );
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Could not create API key", "error");
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (keyId: string) => api.del(`/apikeys/${keyId}`),
    onSuccess: (_, keyId) => {
      qc.setQueryData<ApiKey[]>(["api-keys"], (prev) =>
        prev?.filter((k) => k.id !== keyId) ?? []
      );
      toast("API key revoked");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Could not revoke key", "error");
    },
  });
}

// ─── Share links ──────────────────────────────────────────────────────────────

export function useShareLinks(nodeId: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["share-links", nodeId],
    queryFn: () => api.get<ShareLink[]>(`/files/${nodeId}/shares`),
    enabled: !!token && !!nodeId,
  });
}

export function useCreateShareLink() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ nodeId, expiresIn }: { nodeId: string; expiresIn?: number }) =>
      api.post<ShareLink>(`/files/${nodeId}/shares`, { expiresIn }),
    onSuccess: (link) => {
      qc.setQueryData<ShareLink[]>(["share-links", link.nodeId], (prev) =>
        prev ? [link, ...prev] : [link]
      );
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Could not create share link", "error");
    },
  });
}

export function useRevokeShareLink() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ linkId, nodeId }: { linkId: string; nodeId: string }) =>
      api.del(`/shares/${linkId}`).then(() => ({ linkId, nodeId })),
    onSuccess: ({ linkId, nodeId }) => {
      qc.setQueryData<ShareLink[]>(["share-links", nodeId], (prev) =>
        prev?.filter((l) => l.id !== linkId) ?? []
      );
      toast("Share link revoked");
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Could not revoke share link", "error");
    },
  });
}
