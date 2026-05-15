import { Router } from "express";
import {
  createConnection,
  createFolderHandler,
  deleteConnection,
  deleteNodeHandler,
  downloadFileHandler,
  previewFileHandler,
  getConnection,
  listConnections,
  listFilesHandler,
  listTrashHandler,
  multerUpload,
  restoreNodeHandler,
  storageDashboard,
  trashNodeHandler,
  updateConnection,
  updateNodeHandler,
  uploadFileHandler,
  createShareLinkHandler,
  listShareLinksHandler,
  revokeShareLinkHandler,
  resolveShareLinkHandler,
} from "../controllers/storageController";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.post("/storage/connections", requireAuth, createConnection);
router.get("/storage/connections", requireAuth, listConnections);
router.get("/storage/dashboard", requireAuth, storageDashboard);
router.get("/storage/connections/:id", requireAuth, getConnection);
router.patch("/storage/connections/:id", requireAuth, updateConnection);
router.delete("/storage/connections/:id", requireAuth, deleteConnection);

// Static sub-paths before /:nodeId so Express doesn't treat "trash" as a nodeId
router.get("/files", requireAuth, listFilesHandler);
router.get("/files/trash", requireAuth, listTrashHandler);
router.post("/files/folders", requireAuth, createFolderHandler);
router.post("/files", requireAuth, multerUpload.single("file"), uploadFileHandler);
router.get("/files/:nodeId/preview", requireAuth, previewFileHandler);
router.get("/files/:nodeId/download", requireAuth, downloadFileHandler);
router.patch("/files/:nodeId", requireAuth, updateNodeHandler);
router.post("/files/:nodeId/trash", requireAuth, trashNodeHandler);
router.post("/files/:nodeId/restore", requireAuth, restoreNodeHandler);
router.delete("/files/:nodeId", requireAuth, deleteNodeHandler);

// Share links — create/list require auth; resolve is public
router.post("/files/:nodeId/shares", requireAuth, createShareLinkHandler);
router.get("/files/:nodeId/shares", requireAuth, listShareLinksHandler);
router.delete("/shares/:linkId", requireAuth, revokeShareLinkHandler);
router.get("/share/:token", resolveShareLinkHandler);

export default router;
