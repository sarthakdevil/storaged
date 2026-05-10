"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { X, Star, Tag, Loader2 } from "lucide-react";
import { DriveNode } from "../lib/api";
import { useUpdateNode } from "../lib/queries";

type Props = {
  node: DriveNode | null;
  onClose: () => void;
};

export function EditModal({ node, onClose }: Props) {
  const update = useUpdateNode();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (!node) return;
    setName(node.name);
    setDescription(node.description ?? "");
    setIsFavorite(node.isFavorite);
    setTags(node.tags.map((t) => t.name));
    setTagInput("");
  }, [node]);

  if (!node) return null;

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function handleTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
    if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function handleSave() {
    if (!node) return;
    update.mutate(
      {
        id: node.id,
        name: name.trim() !== node.name ? name.trim() : undefined,
        description: description.trim() || null,
        isFavorite,
        tags,
      },
      { onSuccess: onClose }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Edit details</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Description{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a note…"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <Tag size={13} className="inline mr-1 text-slate-400" />
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl border border-slate-200 min-h-10 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                    className="hover:text-indigo-900"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
                onBlur={addTag}
                placeholder={tags.length === 0 ? "Add tags, press Enter…" : ""}
                className="flex-1 min-w-24 text-sm outline-none bg-transparent text-slate-900 placeholder-slate-400"
              />
            </div>
          </div>

          {/* Favorite toggle */}
          <button
            type="button"
            onClick={() => setIsFavorite((v) => !v)}
            className={`flex items-center gap-2.5 text-sm px-4 py-2.5 rounded-xl border transition w-full ${
              isFavorite
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Star
              size={16}
              className={isFavorite ? "fill-amber-400 text-amber-400" : "text-slate-400"}
            />
            {isFavorite ? "Starred" : "Add to favorites"}
          </button>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={update.isPending || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white text-sm font-semibold transition"
          >
            {update.isPending && <Loader2 size={14} className="animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
