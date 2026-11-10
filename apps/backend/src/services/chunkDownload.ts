import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { signJwt, verifyJwt } from "@repo/auth";
import { prisma } from "../utils/prisma";
import { getRuntimeValue } from "../utils/runtimeEnv";
import { createS3Client } from "../utils/s3";

const secret = () => {
  const value = getRuntimeValue("JWT_SECRET");
  if (!value)
    throw new Error("JWT_SECRET is required for distributed file downloads.");
  return value;
};

export async function chunkDownloadUrl(
  nodeId: string,
  inline: boolean,
  expiresIn: number,
  shareToken?: string,
) {
  const ttl = Math.max(1, Math.min(3600, Math.floor(expiresIn) || 900));
  const token = await signJwt(
    {
      purpose: "file-content",
      nodeId,
      inline,
      shareToken,
      exp: Math.floor(Date.now() / 1000) + ttl,
    },
    secret(),
  );
  return `/api/content/${token}`;
}

// Kept separate so range validation can be checked without storage or a database.
export function parseByteRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= size
  )
    return null;
  return { start, end, partial: true };
}

export async function streamChunkDownload(token: string, request: Request) {
  let payload;
  try {
    payload = await verifyJwt(token, secret());
  } catch {
    return new Response("Invalid or expired download link.", { status: 403 });
  }
  if (
    payload.purpose !== "file-content" ||
    typeof payload.nodeId !== "string" ||
    typeof payload.exp !== "number"
  )
    return new Response("Invalid download link.", { status: 403 });
  const node = await prisma.node.findFirst({
    where: { id: payload.nodeId, isDeleted: false, type: "FILE" },
    include: {
      fileObjects: {
        include: { bucket: true },
        orderBy: { chunkIndex: "asc" },
      },
    },
  });
  if (!node) return new Response("File not found.", { status: 404 });
  if (typeof payload.shareToken === "string") {
    const link = await prisma.shareLink.findUnique({
      where: { token: payload.shareToken },
    });
    if (
      !link ||
      link.nodeId !== node.id ||
      (link.expiresAt && link.expiresAt <= new Date())
    ) {
      return new Response("Share link is no longer available.", {
        status: 403,
      });
    }
  }
  const size = Number(node.sizeBytes);
  const range = parseByteRange(request.headers.get("range"), size);
  if (!range)
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  let offset = 0;
  const chunks = node.fileObjects
    .map((fo, index) => {
      if (fo.chunkIndex !== index + 1 || fo.sizeBytes === null)
        throw new Error("Incomplete file manifest.");
      const start = offset;
      offset += Number(fo.sizeBytes);
      return { ...fo, start, end: offset - 1 };
    })
    .filter((c) => c.end >= range.start && c.start <= range.end);
  if (offset !== size)
    return new Response("Incomplete file manifest.", { status: 502 });

  let index = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let cancelled = false;
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (!reader) {
            const c = chunks[index++];
            if (!c) {
              controller.close();
              return;
            }
            const config = c.bucket.config as {
              endpointUrl: string;
              region: string;
              accessKeyId: string;
              secretAccessKey: string;
              forcePathStyle: boolean;
            };
            const url = await getSignedUrl(
              createS3Client(config),
              new GetObjectCommand({
                Bucket: c.bucket.bucketName,
                Key: c.objectKey,
              }),
              { expiresIn: 900 },
            );
            const start = Math.max(range.start, c.start) - c.start;
            const end = Math.min(range.end, c.end) - c.start;
            const response = await fetch(url, {
              headers: { Range: `bytes=${start}-${end}` },
              signal: abort.signal,
            });
            if (
              !response.body ||
              response.status !== 206 ||
              response.headers.get("content-range") !==
                `bytes ${start}-${end}/${c.sizeBytes}`
            ) {
              await response.body?.cancel();
              throw new Error("Storage returned an invalid chunk range.");
            }
            reader = response.body.getReader();
          }
          const result = await reader.read();
          if (result.done) {
            reader.releaseLock();
            reader = undefined;
            continue;
          }
          controller.enqueue(result.value);
          return;
        }
      } catch (error) {
        await reader?.cancel(error).catch(() => undefined);
        if (!cancelled) controller.error(error);
      }
    },
    async cancel(reason) {
      cancelled = true;
      abort.abort(reason);
      await reader?.cancel(reason);
    },
  });
  const headers: Record<string, string> = {
    "Content-Type": node.mimeType ?? "application/octet-stream",
    "Content-Length": String(range.end - range.start + 1),
    "Content-Disposition": `${payload.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(node.name)}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };
  if (range.partial)
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
  return new Response(body, { status: range.partial ? 206 : 200, headers });
}
