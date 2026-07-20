// ─── Node / File-system types ────────────────────────────────────────────────

export type NodeTag = {
  id: string;
  name: string;
  color: string | null;
};

export type DriveNode = {
  id: string;
  driveId: string;
  parentId: string | null;
  type: "FILE" | "FOLDER";
  name: string;
  path: string;
  description: string | null;
  sizeBytes: string;
  mimeType: string | null;
  isFavorite: boolean;
  tags: NodeTag[];
  createdAt: string;
  updatedAt: string;
};

export type TrashNode = {
  id: string;
  driveId: string;
  type: "FILE" | "FOLDER";
  originalName: string | null;
  originalPath: string | null;
  sizeBytes: string;
  mimeType: string | null;
  deletedAt: string | null;
  createdAt: string;
};
