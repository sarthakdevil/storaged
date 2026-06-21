import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  abortUploadHandler,
  completeUploadHandler,
  initiateUploadHandler,
  listPartsHandler,
  uploadPartUrlHandler,
  uploadStatusHandler,
} from "../controllers/uploadController";

const router = Router();

router.post("/uploads/initiate", requireAuth, initiateUploadHandler);
router.get("/uploads/:id", requireAuth, uploadStatusHandler);
router.post("/uploads/:id/part-url", requireAuth, uploadPartUrlHandler);
router.get("/uploads/:id/parts", requireAuth, listPartsHandler);
router.post("/uploads/:id/complete", requireAuth, completeUploadHandler);
router.post("/uploads/:id/abort", requireAuth, abortUploadHandler);

export default router;
