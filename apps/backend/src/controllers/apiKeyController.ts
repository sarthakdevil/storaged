import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/requireAuth";
import { createApiKey, listApiKeys, revokeApiKey } from "../services/apiKeyService";

const handleErr = (err: unknown, res: Response) => {
  const e = err as { statusCode?: number; message?: string };
  res.status(e.statusCode ?? 500).json({ message: e.message ?? "Something went wrong." });
};

export const createKeyHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { name, expiresIn } = req.body as { name: string; expiresIn?: number };
    const result = await createApiKey({ userId, name, expiresIn });
    res.status(201).json(result);
  } catch (err) {
    handleErr(err, res);
  }
};

export const listKeysHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await listApiKeys(userId);
    res.status(200).json(result);
  } catch (err) {
    handleErr(err, res);
  }
};

export const revokeKeyHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const keyId = Array.isArray(req.params.keyId) ? req.params.keyId[0] : req.params.keyId ?? "";
    const result = await revokeApiKey({ userId, keyId });
    res.status(200).json(result);
  } catch (err) {
    handleErr(err, res);
  }
};
