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
      <div className="w-full max-w-180 bg-white rounded-[30px] shadow-2xl overflow-hidden border border-slate-100">
        <div className="px-10 py-9 border-b border-slate-100 bg-linear-to-r from-indigo-50 via-white to-white">
          <div className="flex items-start justify-between gap-8">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                <FolderPlus size={22} className="text-indigo-600" />
              </div>
              <div className="pt-0.5">
                <h2 className="text-[24px] leading-tight font-semibold text-slate-900">
                  Create a new folder
                </h2>
                <p className="text-sm text-slate-500 mt-3 max-w-lg leading-6">
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

        <div className="px-10 py-10">
          <label className="block text-sm font-semibold text-slate-700 mb-4">Folder name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Design assets"
            autoFocus
            className="w-full px-5 py-4.5 rounded-2xl border border-slate-200 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition shadow-sm"
          />
          <p className="text-xs text-slate-500 mt-4 leading-5 max-w-lg">
            Use a short, clear name so it is easy to find later.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-10 py-8 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="py-4.5 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createFolder.isPending}
            className="flex items-center justify-center gap-2 py-4.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition"
          >
            {createFolder.isPending && <Loader2 size={14} className="animate-spin" />}
            Create folder
          </button>
        </div>
      </div>
    </div>
  );
}
