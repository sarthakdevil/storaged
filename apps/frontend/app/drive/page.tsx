"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ChevronRight,
  HardDrive,
  Loader2,
  CloudOff,
  Database,
  List,
  LayoutGrid,
  Upload,
} from "lucide-react";
import { DriveNode, api } from "../../lib/api";
import { useNodes, useStorageConnections, useTrashNode } from "../../lib/queries";
import { PreviewModal } from "../../components/PreviewModal";
import { EditModal } from "../../components/EditModal";
import { UploadModal } from "../../components/UploadModal";
import { NewFolderModal } from "../../components/NewFolderModal";
import { StorageConnectionsModal } from "../../components/StorageConnectionsModal";
import { ShareModal } from "../../components/ShareModal";
import { ConfirmDialog, useToast, FileCard, FileListItem } from "@repo/ui";
import { useToggleFavorite } from "../../lib/queries";

type Crumb = { id: string | null; name: string };
type FilterType = "all" | "recent" | "starred" | "documents" | "media";

export default function DrivePage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("all");
  const { toast } = useToast();
  const { data: nodes = [], isLoading, isError, refetch } = useNodes();
  const { data: storageData, isLoading: isStorageLoading } = useStorageConnections();
  const hasStorage = (storageData?.pages.flatMap((page) => page.items).length ?? 0) > 0;
  const trashNode = useTrashNode();
  const toggleFavorite = useToggleFavorite();

  const [search, setSearch] = useState("");
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "My Drive" }]);
  const [editNode, setEditNode] = useState<DriveNode | null>(null);
  const [previewNode, setPreviewNode] = useState<DriveNode | null>(null);
  const [shareNode, setShareNode] = useState<DriveNode | null>(null);
  const [pendingTrashNode, setPendingTrashNode] = useState<DriveNode | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showStorage, setShowStorage] = useState(false);

  const currentParentId = crumbs[crumbs.length - 1].id;

  const visible = useMemo(() => {
    let list = nodes.filter((n) => n.parentId === currentParentId);
    
    if (selectedFilter === "starred") {
      list = list.filter((n) => n.isFavorite);
    } else if (selectedFilter === "recent") {
      list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (selectedFilter === "documents") {
      list = list.filter((n) => {
        if (n.type === "FOLDER") return false;
        const m = n.mimeType ?? "";
        return m.includes("pdf") || m.includes("text") || m.includes("document");
      });
    } else if (selectedFilter === "media") {
      list = list.filter((n) => {
        if (n.type === "FOLDER") return false;
        const m = n.mimeType ?? "";
        return m.startsWith("image/") || m.startsWith("video/");
      });
    }

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((n) => n.name.toLowerCase().includes(q));
  }, [nodes, currentParentId, selectedFilter, search]);

  function openNode(node: DriveNode) {
    if (node.type === "FOLDER") {
      setCrumbs((prev) => [...prev, { id: node.id, name: node.name }]);
      setSearch("");
    } else {
      setPreviewNode(node);
    }
  }

  function navigateCrumb(idx: number) {
    setCrumbs((prev) => prev.slice(0, idx + 1));
    setSearch("");
  }

  async function handleDownload(id: string) {
    try {
      const res = await api.get<{ url: string }>(`/files/${id}/download`);
      window.open(res.url, "_blank");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Download failed", "error");
    }
  }

  function requestTrash(node: DriveNode) {
    setPendingTrashNode(node);
  }

  function handleToggleFavorite(node: DriveNode) {
    toggleFavorite.mutate({ id: node.id, isFavorite: !node.isFavorite });
  }

  function confirmTrash() {
    if (!pendingTrashNode) return;
    trashNode.mutate(pendingTrashNode.id);
    setPendingTrashNode(null);
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-y-auto">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10 py-4 flex items-center justify-between shrink-0 shadow-xs">
        <div className="drive-inner flex flex-wrap items-center justify-between gap-4 w-full">
          <div className="relative min-w-0 basis-full sm:basis-60 flex-1 sm:max-w-sm">
            <Search
              size={15}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search your files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-16 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-neon-violet/20 focus:border-neon-violet transition bg-white shadow-xs"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 tracking-wider select-none border border-slate-200 bg-slate-50 px-1.5 py-0.5 rounded-md">
              ⌘K
            </span>
          </div>

          {/* Action Buttons */}
          <div className="drive-file-actions flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50/50 shadow-xs transition"
            >
              <span className="text-slate-400 font-bold text-base">+</span>
              New Folder
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-sm font-semibold shadow-[0_6px_18px_-4px_rgba(167,139,250,0.55)] hover:shadow-[0_10px_28px_-4px_rgba(167,139,250,0.7)] hover:-translate-y-px transition-all"
            >
              <Upload size={14} className="stroke-[2.4]" />
              Upload File
            </button>
          </div>
        </div>
      </header>

      {/* Breadcrumbs & Title & Filters Block */}
      <div className="drive-inner pt-6 sm:pt-14 pb-4 shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          {/* Left Title section */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-1.5 font-display break-all">
              {crumbs.length > 1 ? (
                crumbs.map((crumb, i) => (
                   <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight size={10} className="text-slate-300" />}
                    <button
                      onClick={() => navigateCrumb(i)}
                      className={i === crumbs.length - 1 ? "text-slate-800 font-bold" : "hover:text-electric-indigo transition"}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))
              ) : (
                <span>Workspace</span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-display break-all">
              {crumbs[crumbs.length - 1].name}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Keep everything you need, right where you can find it.
            </p>
          </div>

          {/* Right Filters section */}
          <div className="flex flex-wrap items-center gap-3.5 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              {(["all", "recent", "starred", "documents", "media"] as FilterType[]).map((tab) => {
                const active = selectedFilter === tab;
                const labels: Record<FilterType, string> = {
                  all: "All Files",
                  recent: "Recent",
                  starred: "Starred",
                  documents: "Documents",
                  media: "Media",
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setSelectedFilter(tab)}
                    className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                      active
                        ? "bg-[#8b5cf6] border-[#8b5cf6] text-white shadow-sm shadow-[#8b5cf6]/20"
                        : "bg-white border border-slate-100 hover:border-neon-mint/60 hover:bg-slate-50/50 text-slate-600 hover:text-slate-900 shadow-xs"
                    }`}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            <div className="inline-flex items-center gap-1 bg-slate-100 rounded-full p-1 shrink-0 border border-slate-200/50 shadow-sm">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-full transition ${viewMode === "grid" ? "bg-white shadow text-neon-violet" : "text-slate-400 hover:text-slate-600"}`}
                aria-label="Grid view"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-full transition ${viewMode === "list" ? "bg-white shadow text-neon-violet" : "text-slate-400 hover:text-slate-600"}`}
                aria-label="List view"
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="drive-content flex-1 py-4">
        <div className="drive-inner">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 size={32} className="animate-spin text-neon-violet" />
              <p className="text-sm text-slate-400 font-medium">Loading files...</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center border border-red-100">
                <CloudOff size={24} className="text-red-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">
                Could not load files. Is the backend running?
              </p>
              <button onClick={() => refetch()} className="text-sm text-electric-indigo hover:underline font-bold">
                Try again
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[30vh] gap-4 text-center py-10">
              <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-center shadow-sm">
                <HardDrive size={28} className="text-slate-300" />
              </div>
              <p className="text-base font-semibold text-slate-500">
                {search
                  ? "No files match your search"
                  : selectedFilter === "starred"
                    ? "No starred items"
                    : "This folder is empty"}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.18em] mb-4">
                Recently Accessed
              </h2>

              {viewMode === "grid" ? (
                <div className="file-grid grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
                  {visible.map((node) => (
                    <FileCard
                      key={node.id}
                      node={node}
                      onOpen={openNode}
                      onDownload={handleDownload}
                      onPreview={setPreviewNode}
                      onEdit={setEditNode}
                      onShare={setShareNode}
                      onToggleFavorite={handleToggleFavorite}
                      onTrash={requestTrash}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2 bg-white rounded-3xl p-4 border border-slate-100 shadow-sm">
                  {visible.map((node) => (
                    <FileListItem
                      key={node.id}
                      node={node}
                      onOpen={openNode}
                      onDownload={handleDownload}
                      onPreview={setPreviewNode}
                      onEdit={setEditNode}
                      onShare={setShareNode}
                      onToggleFavorite={handleToggleFavorite}
                      onTrash={requestTrash}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom permanent upload dropzone / connect-storage prompt */}
      {!isStorageLoading && (
        <div className="drive-inner mt-8 pb-12 shrink-0">
          {hasStorage ? (
            <div
              onClick={() => setShowUpload(true)}
              className="w-full border-2 border-dashed border-slate-200 hover:border-neon-violet/50 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center cursor-pointer bg-white/40 hover:bg-slate-50/50 transition-all shadow-sm"
            >
              <div className="w-12 h-12 rounded-full bg-neon-violet/10 text-electric-indigo flex items-center justify-center mb-4 border border-neon-violet/20 shadow-[0_0_25px_rgba(167,139,250,0.3)]">
                <span className="font-bold text-lg">+</span>
              </div>
              <h3 className="text-base font-bold text-slate-800">Drop files here</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                Drag and drop any file type to upload them instantly to your cloud storage.
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStorage(true);
                }}
                className="text-electric-indigo hover:text-neon-violet text-[10px] font-bold tracking-widest uppercase mt-4 underline underline-offset-4"
              >
                Advanced Upload Settings
              </button>
            </div>
          ) : (
            <div className="w-full border-2 border-dashed border-slate-200 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center bg-white/40 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-4 border border-slate-200">
                <Database size={18} />
              </div>
              <h3 className="text-base font-bold text-slate-800">No storage connected</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                Connect an S3-compatible bucket to start uploading and storing your files.
              </p>
              <button
                onClick={() => setShowStorage(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-xs font-bold tracking-wide mt-5 shadow-[0_6px_18px_-4px_rgba(167,139,250,0.55)] hover:shadow-[0_10px_28px_-4px_rgba(167,139,250,0.7)] transition-all"
              >
                <Database size={14} />
                Connect a Storage
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showUpload && (
        <UploadModal parentId={currentParentId} onClose={() => setShowUpload(false)} />
      )}
      {showNewFolder && (
        <NewFolderModal parentId={currentParentId} onClose={() => setShowNewFolder(false)} />
      )}
      {showStorage && <StorageConnectionsModal onClose={() => setShowStorage(false)} />}
      
      <ConfirmDialog
        open={!!pendingTrashNode}
        title="Move to trash?"
        description={
          pendingTrashNode
            ? `Do you want to move ${pendingTrashNode.name} to trash? You can restore it later from the trash page.`
            : "Do you want to move this item to trash?"
        }
        confirmLabel="Yes, move it"
        cancelLabel="No"
        danger
        onConfirm={confirmTrash}
        onCancel={() => setPendingTrashNode(null)}
      />
      <PreviewModal node={previewNode} onClose={() => setPreviewNode(null)} />
      <EditModal node={editNode} onClose={() => setEditNode(null)} />
      {shareNode && <ShareModal node={shareNode} onClose={() => setShareNode(null)} />}
    </div>
  );
}
