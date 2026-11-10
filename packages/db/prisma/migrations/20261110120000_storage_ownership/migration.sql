ALTER TABLE "Bucket" ADD COLUMN "ownerId" TEXT;
-- Only assign legacy connections with unambiguous ownership evidence.
WITH evidence AS (
  SELECT f."bucketId", d."ownerId" FROM "FileObject" f
  JOIN "Node" n ON n.id = f."nodeId" JOIN "Drive" d ON d.id = n."driveId"
  UNION SELECT s."bucketId", s."userId" FROM "UploadSession" s
  UNION SELECT c."bucketId", s."userId" FROM "UploadChunk" c JOIN "UploadSession" s ON s.id = c."sessionId"
), owners AS (
  SELECT "bucketId", MIN("ownerId") AS "ownerId" FROM evidence
  GROUP BY "bucketId" HAVING COUNT(DISTINCT "ownerId") = 1
)
UPDATE "Bucket" b SET "ownerId" = owners."ownerId" FROM owners WHERE b.id = owners."bucketId";
DROP INDEX "Bucket_providerName_bucketName_key";
CREATE UNIQUE INDEX "Bucket_ownerId_providerName_bucketName_key" ON "Bucket"("ownerId", "providerName", "bucketName");
CREATE INDEX "Bucket_ownerId_idx" ON "Bucket"("ownerId");
ALTER TABLE "Bucket" ADD CONSTRAINT "Bucket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
