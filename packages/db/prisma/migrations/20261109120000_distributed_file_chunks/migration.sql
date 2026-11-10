ALTER TYPE "UploadSessionStatus" ADD VALUE 'ABORTING';

ALTER TABLE "FileObject" ADD COLUMN "sizeBytes" BIGINT,
    ADD COLUMN "chunkIndex" INTEGER;

CREATE TABLE "UploadChunk" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "objectKey" TEXT NOT NULL,
    CONSTRAINT "UploadChunk_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UploadChunk_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UploadChunk_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UploadChunk_sessionId_partNumber_key" ON "UploadChunk"("sessionId", "partNumber");
CREATE INDEX "UploadChunk_bucketId_idx" ON "UploadChunk"("bucketId");
