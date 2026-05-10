"use client";

import { useState } from "react";
import { Star, Loader2, CloudOff } from "lucide-react";
import { DriveNode, api } from "../../../lib/api";
import { useNodes, useTrashNode } from "../../../lib/queries";
import { FileCard } from "../../../components/FileCard";
import { EditModal } from "../../../components/EditModal";
import { useToast } from "../../../components/Toast";

export default function FavoritesPage() {
  const { toast } = useToast();
  const { data: allNodes = [], isLoading, isError } = useNodes();
  const trashNode = useTrashNode();
  const [editNode, setEditNode] = useState<DriveNode | null>(null);

  const nodes = allNodes.filter((n) => n.isFavorite);

  async function handleDownload(id: string) {
    try {
      const res = await api.get<{ url: string }>(`/files/${id}/download`);
      window.open(res.url, "_blank");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Download failed", "error");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center">
          <Star size={16} className="text-amber-400 fill-amber-400" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-900">Favorites</h1>
          <p className="text-xs text-slate-400">
            {nodes.length} starred item{nodes.length !== 1 ? "s" : ""}
          </p>
        </div>
      </header>

      <div className="flex-1 px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 gap-3">
            <Loader2 size={28} className="animate-spin text-indigo-400" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center">
              <CloudOff size={24} className="text-red-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">Could not load files.</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center">
              <Star size={24} className="text-amber-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">No favorites yet</p>
            <p className="text-xs text-slate-400">Star files from the drive to see them here</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {nodes.map((node) => (
              <FileCard
                key={node.id}
                node={node}
                onOpen={() => {}}
                onDownload={handleDownload}
                onEdit={setEditNode}
                onTrash={(id) => trashNode.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>

      <EditModal node={editNode} onClose={() => setEditNode(null)} />
    </div>
  );
}
