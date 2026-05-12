"use client";

import { useState, useMemo } from "react";
import {
  Upload,
  Search,
  FolderPlus,
  ChevronRight,
  HardDrive,
  Loader2,
  CloudOff,
  Database,
  List,
  LayoutGrid,
} from "lucide-react";
import { DriveNode, api } from "../../lib/api";
import { useNodes, useTrashNode } from "../../lib/queries";
import { FileCard } from "../../components/FileCard";
import { FileListItem } from "../../components/FileListItem";
import { PreviewModal } from "../../components/PreviewModal";
import { EditModal } from "../../components/EditModal";
import { UploadModal } from "../../components/UploadModal";
import { NewFolderModal } from "../../components/NewFolderModal";
import { StorageConnectionsModal } from "../../components/StorageConnectionsModal";
import { useToast } from "../../components/Toast";

type Crumb = { id: string | null; name: string };

export default function DrivePage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const { toast } = useToast();
  const { data: nodes = [], isLoading, isError, refetch } = useNodes();
  const trashNode = useTrashNode();

  const [search, setSearch] = useState("");
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "My Drive" }]);
  const [editNode, setEditNode] = useState<DriveNode | null>(null);
  const [previewNode, setPreviewNode] = useState<DriveNode | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showStorage, setShowStorage] = useState(false);

  const currentParentId = crumbs[crumbs.length - 1].id;

  const visible = useMemo(() => {
    const inFolder = nodes.filter((n) => n.parentId === currentParentId);
    if (!search.trim()) return inFolder;
    const q = search.toLowerCase();
    return inFolder.filter((n) => n.name.toLowerCase().includes(q));
  }, [nodes, currentParentId, search]);

  const folders = visible.filter((n) => n.type === "FOLDER");
  const files = visible.filter((n) => n.type === "FILE");

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

  return (
    <div className="drive-view flex flex-col h-full">
      {/* Top bar */}
      <header className="drive-toolbar bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="drive-inner flex items-center gap-4">
          <div className="drive-search flex-1 max-w-sm relative">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="drive-search-input w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          <div className="drive-actions flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowStorage(true)}
              className="drive-action-button drive-action-secondary flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              <Database size={15} />
              Storage
            </button>
            <button
              onClick={() => setShowNewFolder(true)}
              className="drive-action-button drive-action-secondary flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              <FolderPlus size={15} />
              New folder
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="drive-action-button drive-action-primary flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition"
            >
              <Upload size={15} />
              Upload
            </button>
          </div>
        </div>
      </header>

      {/* Breadcrumbs / Title */}
      {currentParentId === null ? (
        <div className="drive-inner pt-10 pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Workspace</p>
              <h1 className="text-4xl font-extrabold text-indigo-600 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                My Drive
              </h1>
              <p className="text-sm text-slate-500 mt-2">Keep everything you need, right where you can find it.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="drive-breadcrumbs">
          <div className="drive-inner flex items-center gap-1 text-sm">
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={14} className="text-slate-300" />}
                <button
                  onClick={() => navigateCrumb(i)}
                  className={
                    i === crumbs.length - 1
                      ? "font-semibold text-slate-900"
                      : "text-slate-500 hover:text-indigo-600 transition"
                  }
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="drive-content flex-1">
        <div className="drive-inner">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
            <p className="text-sm text-slate-400">Loading files...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center">
              <CloudOff size={24} className="text-red-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              Could not load files. Is the backend running?
            </p>
            <button onClick={() => refetch()} className="text-sm text-indigo-600 hover:underline">
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <HardDrive size={24} className="text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              {search ? "No files match your search" : "This folder is empty"}
            </p>
            {!search && (
              <button
                onClick={() => setShowUpload(true)}
                className="text-sm text-indigo-600 hover:underline"
              >
                Upload your first file
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {folders.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="drive-section-title text-xs font-semibold text-slate-500 uppercase">
                    Folders
                  </h2>
                </div>
                <div className={
                  viewMode === "grid"
                    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                    : "flex flex-col gap-3"
                }>
                  {folders.map((node) => (
                    viewMode === "grid" ? (
                      <FileCard
                        key={node.id}
                        node={node}
                        onOpen={openNode}
                        onDownload={handleDownload}
                        onEdit={setEditNode}
                        onTrash={(id) => trashNode.mutate(id)}
                      />
                    ) : (
                      <div
                        key={node.id}
                        className="flex items-center gap-6 px-6 py-4 bg-white border border-slate-200 rounded-2xl hover:shadow-sm transition cursor-pointer min-h-[88px]"
                        onClick={() => openNode(node)}
                      >
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0">
                          <FolderPlus size={24} className="text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{node.name}</p>
                          <p className="text-xs text-slate-400">
                            Folder • {new Date(node.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </section>
            )}

            {files.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="drive-section-title text-xs font-semibold text-slate-500 uppercase">
                    Files
                  </h2>
                  <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded-md transition ${viewMode === "grid" ? "bg-white shadow text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
                      aria-label="Grid view"
                    >
                      <LayoutGrid size={15} />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded-md transition ${viewMode === "list" ? "bg-white shadow text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
                      aria-label="List view"
                    >
                      <List size={15} />
                    </button>
                  </div>
                </div>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {files.map((node) => (
                      <FileCard
                        key={node.id}
                        node={node}
                        onOpen={openNode}
                        onDownload={handleDownload}
                        onPreview={setPreviewNode}
                        onEdit={setEditNode}
                        onTrash={(id) => trashNode.mutate(id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {files.map((node) => (
                      <FileListItem
                        key={node.id}
                        node={node}
                        onOpen={openNode}
                        onDownload={handleDownload}
                        onPreview={setPreviewNode}
                        onEdit={setEditNode}
                        onTrash={(id) => trashNode.mutate(id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Modals */}
      {showUpload && (
        <UploadModal parentId={currentParentId} onClose={() => setShowUpload(false)} />
      )}
      {showNewFolder && (
        <NewFolderModal parentId={currentParentId} onClose={() => setShowNewFolder(false)} />
      )}
      {showStorage && <StorageConnectionsModal onClose={() => setShowStorage(false)} />}
      <PreviewModal node={previewNode} onClose={() => setPreviewNode(null)} />
      <EditModal node={editNode} onClose={() => setEditNode(null)} />
    </div>
  );
}
