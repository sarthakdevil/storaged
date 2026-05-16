import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { createKeyHandler, listKeysHandler, revokeKeyHandler } from "../controllers/apiKeyController";

const router = Router();

// All routes require a session (the user must be logged in to manage their keys)
router.get("/apikeys", requireAuth, listKeysHandler);
router.post("/apikeys", requireAuth, createKeyHandler);
router.delete("/apikeys/:keyId", requireAuth, revokeKeyHandler);

export default router;
