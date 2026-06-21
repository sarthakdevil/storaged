import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/requireAuth";
import {
  abortUpload,
  getUploadPartUrl,
  getUploadSessionStatus,
  initiateMultipartUpload,
  isUploadError,
  listUploadedParts,
  requestUploadCompletion,
} from "../services/uploadSessionService";
import { enqueueUploadFinalize } from "../queue/uploadJobs";

const getRouteParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};

const handleUploadError = (error: unknown, res: Response) => {
  if (isUploadError(error)) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: "Something went wrong." });
};

export const initiateUploadHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const body = req.body as {
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
      driveId?: string;
      parentId?: string;
    };

    const result = await initiateMultipartUpload({
      userId,
      driveId: typeof body.driveId === "string" ? body.driveId : undefined,
      parentId: typeof body.parentId === "string" ? body.parentId : undefined,
      fileName: typeof body.fileName === "string" ? body.fileName : "",
      mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
      sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : NaN,
    });

    res.status(201).json(result);
  } catch (error) {
    handleUploadError(error, res);
  }
};

export const uploadStatusHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const uploadSessionId = getRouteParam(req.params.id);

    const result = await getUploadSessionStatus({ userId, uploadSessionId });
    res.status(200).json(result);
  } catch (error) {
    handleUploadError(error, res);
  }
};

export const uploadPartUrlHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const uploadSessionId = getRouteParam(req.params.id);
    const partNumber = (req.body as { partNumber?: number }).partNumber;

    const result = await getUploadPartUrl({
      userId,
      uploadSessionId,
      partNumber: typeof partNumber === "number" ? partNumber : NaN,
    });

    res.status(200).json(result);
  } catch (error) {
    handleUploadError(error, res);
  }
};

export const listPartsHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const uploadSessionId = getRouteParam(req.params.id);

    const result = await listUploadedParts({ userId, uploadSessionId });
    res.status(200).json(result);
  } catch (error) {
    handleUploadError(error, res);
  }
};

export const completeUploadHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const uploadSessionId = getRouteParam(req.params.id);
    const body = req.body as { parts?: { partNumber: number; etag: string }[] };

    const result = await requestUploadCompletion({
      userId,
      uploadSessionId,
      parts: body.parts ?? [],
    });

    await enqueueUploadFinalize(uploadSessionId);

    // Completion is async (worker will finalize).
    res.status(202).json(result);
  } catch (error) {
    handleUploadError(error, res);
  }
};

export const abortUploadHandler = async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const uploadSessionId = getRouteParam(req.params.id);

    const result = await abortUpload({ userId, uploadSessionId });
    res.status(200).json(result);
  } catch (error) {
    handleUploadError(error, res);
  }
};
