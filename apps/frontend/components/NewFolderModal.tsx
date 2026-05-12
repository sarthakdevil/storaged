"use client";

import { useState } from "react";
import { X, FolderPlus, Loader2 } from "lucide-react";
import { useCreateFolder } from "../lib/queries";

type Props = {
  parentId: string | null;
  onClose: () => void;
};

export function NewFolderModal({ parentId, onClose }: Props) {
  const createFolder = useCreateFolder();
  const [name, setName] = useState("");

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;

    await createFolder.mutateAsync({ name: trimmed, parentId });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-7 py-6 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <FolderPlus size={20} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create a new folder</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Keep related files together with a dedicated folder.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white text-slate-400 hover:text-slate-600 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-7 py-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Folder name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Design assets"
            autoFocus
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
          <p className="text-xs text-slate-500 mt-2">
            Use a short, clear name so it is easy to find later.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 px-7 py-5 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-2xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createFolder.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition"
          >
            {createFolder.isPending && <Loader2 size={14} className="animate-spin" />}
            Create folder
          </button>
        </div>
      </div>
    </div>
  );
}
