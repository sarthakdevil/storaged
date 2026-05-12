import multer from "multer";
import { Request, Response } from "express";
import {
  createStorageConnection,
  createFolder,
  deleteNode,
  deleteStorageConnection,
  downloadFile,
  previewFile,
  getStorageConnection,
  getStorageDashboard,
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
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

const getRouteParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

const getPaginationOptions = (req: Request) => {
  const limit =
    typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;

  return {
    limit: Number.isFinite(limit) ? limit : undefined,
    cursor: typeof req.query.cursor === "string" ? req.query.cursor : undefined,
  };
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

export const listConnections = async (req: Request, res: Response) => {
  try {
    const result = await listStorageConnections(getPaginationOptions(req));
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

export const createFolderHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { name, driveId, parentId } = req.body as {
      name?: string;
      driveId?: string;
      parentId?: string;
    };

    if (!name || typeof name !== "string") {
      res.status(400).json({ message: "Folder name is required." });
      return;
    }

    const result = await createFolder({
      userId,
      name,
      driveId: typeof driveId === "string" ? driveId : undefined,
      parentId: typeof parentId === "string" ? parentId : undefined,
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

export const previewFileHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const expiresIn =
      typeof req.query.expiresIn === "string" ? parseInt(req.query.expiresIn, 10) : 900;
    const result = await previewFile({
      userId,
      nodeId: getRouteParam(req.params.nodeId),
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 900,
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

export const storageDashboard = async (req: Request, res: Response) => {
  try {
    const result = await getStorageDashboard(getPaginationOptions(req));
    res.status(200).json(result);
  } catch (error) {
    handleStorageError(error, res);
  }
};
