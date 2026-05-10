import multer from "multer";
import { Request, Response } from "express";
import {
  createStorageConnection,
  deleteNode,
  deleteStorageConnection,
  downloadFile,
  getStorageConnection,
  isStorageError,
  listFiles,
  listStorageConnections,
  listTrash,
  restoreNode,
  trashNode,
  updateNodeDetails,
  updateStorageConnection,
  uploadFile,
} from "../services/storageService";
import { AuthenticatedRequest } from "../middleware/requireAuth";

export const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

const getRouteParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

const handleStorageError = (error: unknown, res: Response) => {
  if (isStorageError(error)) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: "Something went wrong." });
};

export const createConnection = async (req: Request, res: Response) => {
  try {
    const result = await createStorageConnection(req.body);

    res.status(201).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const listConnections = async (_req: Request, res: Response) => {
  try {
    const result = await listStorageConnections();
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const getConnection = async (req: Request, res: Response) => {
  try {
    const result = await getStorageConnection(getRouteParam(req.params.id));
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const updateConnection = async (req: Request, res: Response) => {
  try {
    const result = await updateStorageConnection({
      id: getRouteParam(req.params.id),
      input: req.body,
    });

    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const deleteConnection = async (req: Request, res: Response) => {
  try {
    const result = await deleteStorageConnection(getRouteParam(req.params.id));
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const uploadFileHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;

    if (!req.file) {
      res.status(400).json({ message: "A file is required." });
      return;
    }

    const driveId =
      typeof req.body.driveId === "string" ? req.body.driveId : undefined;
    const parentId =
      typeof req.body.parentId === "string" ? req.body.parentId : undefined;

    const result = await uploadFile({
      userId,
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      driveId,
      parentId,
    });

    res.status(201).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const listFilesHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const driveId = typeof req.query.driveId === "string" ? req.query.driveId : undefined;
    const result = await listFiles({ userId, driveId });
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const trashNodeHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await trashNode({ userId, nodeId: getRouteParam(req.params.nodeId) });
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const listTrashHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const driveId = typeof req.query.driveId === "string" ? req.query.driveId : undefined;
    const result = await listTrash({ userId, driveId });
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const restoreNodeHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await restoreNode({ userId, nodeId: getRouteParam(req.params.nodeId) });
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const deleteNodeHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await deleteNode({ userId, nodeId: getRouteParam(req.params.nodeId) });
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const downloadFileHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const expiresIn =
      typeof req.query.expiresIn === "string" ? parseInt(req.query.expiresIn, 10) : 3600;
    const result = await downloadFile({
      userId,
      nodeId: getRouteParam(req.params.nodeId),
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
    });
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};

export const updateNodeHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { name, description, isFavorite, tags } = req.body as {
      name?: string;
      description?: string;
      isFavorite?: boolean;
      tags?: string[];
    };
    const result = await updateNodeDetails({
      userId,
      nodeId: getRouteParam(req.params.nodeId),
      name,
      description,
      isFavorite,
      tags: Array.isArray(tags) ? tags : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};