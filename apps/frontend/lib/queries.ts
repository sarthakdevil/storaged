"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, DriveNode, TrashNode } from "./api";
import { useAuth } from "../components/AuthContext";
import { useToast } from "../components/Toast";

export const keys = {
  nodes: ["nodes"] as const,
  trash: ["trash"] as const,
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
    },
  });
}
