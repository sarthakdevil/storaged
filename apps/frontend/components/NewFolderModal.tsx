"use client";

import { useState } from "react";
import { FolderPlus, Loader2 } from "lucide-react";
import { useCreateFolder } from "../lib/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
} from "@repo/ui";

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
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="action-modal max-w-[480px] p-6 rounded-3xl border border-slate-100 shadow-2xl">
        <DialogHeader className="flex flex-row items-start gap-4 space-y-0 text-left shrink-0">
          <div className="w-12 h-12 rounded-xl bg-neon-violet/10 flex items-center justify-center shrink-0 mt-0.5">
            <FolderPlus size={20} className="text-electric-indigo" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="font-display text-lg font-semibold text-slate-900">
              Create a new folder
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 leading-relaxed">
              Keep related files together with a dedicated folder.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="action-modal-body flex flex-col justify-center space-y-2">
          <label className="block text-sm font-semibold text-slate-700">Folder name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Design assets"
            autoFocus
            className="w-full"
          />
          <p className="text-xs text-slate-400">
            Use a short, clear name so it is easy to find later.
          </p>
        </div>

        <div className="flex gap-3 pt-2 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 py-4.5 rounded-2xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createFolder.isPending}
            className="flex-1 py-4.5 rounded-2xl bg-neon-violet hover:bg-[#8b5cf6] text-white font-semibold"
          >
            {createFolder.isPending && <Loader2 size={14} className="animate-spin mr-2" />}
            Create folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
