import { Router } from "express";
import {
  createConnection,
  deleteConnection,
  deleteNodeHandler,
  downloadFileHandler,
  getConnection,
  listConnections,
  listFilesHandler,
  listTrashHandler,
  multerUpload,
  restoreNodeHandler,
  trashNodeHandler,
  updateConnection,
  updateNodeHandler,
  uploadFileHandler,
} from "../controllers/storageController";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.post("/storage/connections", createConnection);
router.get("/storage/connections", listConnections);
router.get("/storage/connections/:id", getConnection);
router.patch("/storage/connections/:id", updateConnection);
router.delete("/storage/connections/:id", deleteConnection);

// Static sub-paths before /:nodeId so Express doesn't treat "trash" as a nodeId
router.get("/files", requireAuth, listFilesHandler);
router.get("/files/trash", requireAuth, listTrashHandler);
router.post("/files", requireAuth, multerUpload.single("file"), uploadFileHandler);
router.get("/files/:nodeId/download", requireAuth, downloadFileHandler);
router.patch("/files/:nodeId", requireAuth, updateNodeHandler);
router.post("/files/:nodeId/trash", requireAuth, trashNodeHandler);
router.post("/files/:nodeId/restore", requireAuth, restoreNodeHandler);
router.delete("/files/:nodeId", requireAuth, deleteNodeHandler);

export default router;