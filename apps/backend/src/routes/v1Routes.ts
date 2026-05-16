import { Router, Request, Response } from "express";
import multer from "multer";
import { requireApiKey, ApiKeyRequest } from "../middleware/requireApiKey";
import {
  listFiles,
  downloadFile,
  uploadFile,
  createFolder,
  updateNodeDetails,
  deleteNode,
} from "../services/storageService";
import { prisma } from "../utils/prisma";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const uid = (req: Request) => (req as ApiKeyRequest).userId;

const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const handleErr = (err: unknown, res: Response) => {
  const e = err as { statusCode?: number; message?: string };
  const code = e.statusCode ?? 500;
  res.status(code).json({ error: e.message ?? "Something went wrong." });
};

// ─── List files / folders ────────────────────────────────────────────────────

router.get("/files", requireApiKey, async (req: Request, res: Response) => {
  try {
    const nodes = await listFiles({ userId: uid(req) });

    // Optional filters via query params
    const { parentId, type, search } = req.query as Record<string, string | undefined>;
    let result = nodes;
    if (parentId !== undefined) result = result.filter((n) => n.parentId === (parentId || null));
    if (type === "FILE" || type === "FOLDER") result = result.filter((n) => n.type === type);
    if (search) result = result.filter((n) => n.name.toLowerCase().includes(search.toLowerCase()));

    res.json({
      data: result.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        parentId: n.parentId,
        mimeType: n.mimeType,
        size: Number(n.sizeBytes),
        isFavorite: n.isFavorite,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
      total: result.length,
    });
  } catch (err) {
    handleErr(err, res);
  }
});

// ─── Get single file / folder ────────────────────────────────────────────────

router.get("/files/:id", requireApiKey, async (req: Request, res: Response) => {
  try {
    const node = await prisma.node.findFirst({
      where: { id: param(req.params.id), isDeleted: false, drive: { ownerId: uid(req) } },
      include: { tags: { include: { tag: true } } },
    });
    if (!node) { res.status(404).json({ error: "Not found." }); return; }
    res.json({
      id: node.id,
      name: node.name,
      type: node.type,
      parentId: node.parentId,
      mimeType: node.mimeType,
      size: Number(node.sizeBytes),
      description: node.description,
      isFavorite: node.isFavorite,
      tags: node.tags.map((nt) => nt.tag.name),
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    });
  } catch (err) {
    handleErr(err, res);
  }
});

// ─── Upload a file ────────────────────────────────────────────────────────────

router.post("/files/upload", requireApiKey, upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file attached. Use multipart/form-data with field 'file'." }); return; }
    const parentId = typeof req.body.parentId === "string" ? req.body.parentId : null;

    const node = await uploadFile({
      userId: uid(req),
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      parentId: parentId ?? undefined,
    });

    res.status(201).json({
      id: node.id,
      name: node.name,
      type: node.type,
      parentId: node.parentId,
      mimeType: node.mimeType,
      size: Number(node.sizeBytes),
      createdAt: node.createdAt instanceof Date ? node.createdAt.toISOString() : node.createdAt,
      updatedAt: node.updatedAt instanceof Date ? node.updatedAt.toISOString() : node.updatedAt,
    });
  } catch (err) {
    handleErr(err, res);
  }
});

// ─── Create a folder ──────────────────────────────────────────────────────────

router.post("/folders", requireApiKey, async (req: Request, res: Response) => {
  try {
    const { name, parentId } = req.body as { name: string; parentId?: string };
    if (!name?.trim()) { res.status(400).json({ error: "name is required." }); return; }

    const node = await createFolder({ userId: uid(req), name, parentId: parentId ?? undefined });

    res.status(201).json({
      id: node.id,
      name: node.name,
      type: node.type,
      parentId: node.parentId,
      createdAt: node.createdAt instanceof Date ? node.createdAt.toISOString() : node.createdAt,
      updatedAt: node.updatedAt instanceof Date ? node.updatedAt.toISOString() : node.updatedAt,
    });
  } catch (err) {
    handleErr(err, res);
  }
});

// ─── Update (rename / description) ───────────────────────────────────────────

router.patch("/files/:id", requireApiKey, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const node = await updateNodeDetails({
      userId: uid(req),
      nodeId: param(req.params.id),
      name,
      description,
    });
    res.json({
      id: node.id,
      name: node.name,
      description: node.description,
      updatedAt: node.updatedAt instanceof Date ? node.updatedAt.toISOString() : node.updatedAt,
    });
  } catch (err) {
    handleErr(err, res);
  }
});

// ─── Download (presigned URL) ─────────────────────────────────────────────────

router.get("/files/:id/download", requireApiKey, async (req: Request, res: Response) => {
  try {
    const expiresIn = Number(req.query.expiresIn ?? 3600);
    const result = await downloadFile({
      userId: uid(req),
      nodeId: param(req.params.id),
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
    });
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete("/files/:id", requireApiKey, async (req: Request, res: Response) => {
  try {
    await deleteNode({ userId: uid(req), nodeId: param(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    handleErr(err, res);
  }
});

export default router;
