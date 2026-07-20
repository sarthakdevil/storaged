// ─── Upload session types ─────────────────────────────────────────────────────

export type UploadSessionStatus =
  | "INITIATED"
  | "UPLOADING"
  | "COMPLETING"
  | "COMPLETED"
  | "FAILED"
  | "ABORTED";

export type UploadPart = {
  partNumber: number;
  etag: string;
};

export type InitiateUploadResponse = {
  uploadSessionId: string;
  partSizeBytes: number;
};

export type UploadPartUrlResponse = {
  url: string;
};

export type UploadStatusResponse = {
  id: string;
  status: UploadSessionStatus;
  nodeId: string | null;
  errorMessage: string | null;
};

export type CompleteUploadInput = {
  parts: UploadPart[];
};
