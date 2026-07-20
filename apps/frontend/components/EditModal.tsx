"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { Star, Tag, Loader2, X } from "lucide-react";
import { DriveNode } from "../lib/api";
import { useUpdateNode } from "../lib/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
} from "@repo/ui";

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
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="action-modal max-w-[440px] p-6 rounded-3xl border border-slate-100 shadow-2xl">
        <DialogHeader className="text-left shrink-0">
          <DialogTitle className="font-display text-lg font-semibold text-slate-900">
            Edit details
          </DialogTitle>
        </DialogHeader>

        <div className="action-modal-body py-4 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">Name</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">
              Description{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a note…"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-neon-violet focus:border-transparent transition resize-none"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">
              <Tag size={13} className="inline mr-1 text-slate-400" />
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl border border-slate-200 min-h-10 focus-within:ring-2 focus-within:ring-neon-violet focus-within:border-transparent transition">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-neon-violet/10 text-electric-indigo font-medium"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                    className="hover:text-electric-indigo/70"
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
        <div className="flex gap-3 pt-2 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 py-4.5 rounded-2xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={update.isPending || !name.trim()}
            className="flex-1 py-4.5 rounded-2xl bg-neon-violet hover:bg-[#8b5cf6] text-white font-semibold"
          >
            {update.isPending && <Loader2 size={14} className="animate-spin mr-2" />}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
