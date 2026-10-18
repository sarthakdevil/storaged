/// <reference types="@cloudflare/workers-types" />

import {
  isAuthError,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from "./services/authService";
import {
  abortUpload,
  finalizeUploadNow,
  getUploadPartUrl,
  getUploadSessionStatus,
  initiateMultipartUpload,
  isUploadError,
  listUploadedParts,
  requestUploadCompletion,
} from "./services/uploadSessionService";
import {
  createFolder,
  createShareLink,
  createStorageConnection,
  deleteNode,
  deleteStorageConnection,
  downloadFile,
  emptyTrash,
  getStorageConnection,
  getStorageDashboard,
  getUserStorageQuota,
  isStorageError,
  listFiles,
  listShareLinks,
  listStorageConnections,
  listTrash,
  previewFile,
  purgeExpiredTrash,
  resolveShareLink,
  restoreNode,
  revokeShareLink,
  trashNode,
  updateNodeDetails,
  updateStorageConnection,
  uploadFile,
} from "./services/storageService";
import { createApiKey, listApiKeys, revokeApiKey } from "./services/apiKeyService";
import { prisma, configurePrisma, disconnectPrisma } from "./utils/prisma";
import { configureRuntimeEnv } from "./utils/runtimeEnv";
import { requireAuth, requireApiKey, getBearerToken } from "@repo/auth";

// ─── Auth ─────────────────────────────────────────────────────────────────────

type Env = {
  ENVIRONMENT?: string;
  FRONTEND_ORIGIN?: string;
  FRONTEND_ORIGINS?: string;
  FRONTEND_URL?: string;
  APP_URL?: string;
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  RESEND_KEY?: string;
  JWT_SECRET?: string;
  HYPERDRIVE?: Hyperdrive;
  // Optional: durable upload finalization (see wrangler.jsonc). When absent,
  // finalization falls back to ctx.waitUntil() in the request lifetime.
  UPLOAD_QUEUE?: Queue<UploadFinalizeMessage>;
};

type UploadFinalizeMessage = { uploadSessionId: string };

// Enqueue durable finalization when the queue binding exists; otherwise run it
// inline before the request context ends.
const scheduleFinalize = (env: Env, ctx: ExecutionContext, uploadSessionId: string) => {
  if (env.UPLOAD_QUEUE) {
    return env.UPLOAD_QUEUE.send({ uploadSessionId });
  }
  ctx.waitUntil(finalizeUploadNow({ uploadSessionId }));
  return Promise.resolve();
};

type HandlerContext = {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  params: Record<string, string>;
};

type Route = {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: (context: HandlerContext) => Promise<Response>;
};

type HttpErrorLike = {
  statusCode?: number;
  message?: string;
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value)), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });

const getCorsHeaders = (request: Request, env: Env): HeadersInit => {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = env.FRONTEND_ORIGIN ?? "*";

  const isLocal = origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  const additionalOrigins = (env.FRONTEND_ORIGINS ?? "").split(",").map((value) => value.trim());
  const isAllowed = origin === allowedOrigin || additionalOrigins.includes(origin) || isLocal;

  return {
    "access-control-allow-origin": isAllowed ? origin : allowedOrigin,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-api-key",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
};

const withCors = (response: Response, request: Request, env: Env) => {
  const headers = new Headers(response.headers);
  Object.entries(getCorsHeaders(request, env)).forEach(([key, value]) => headers.set(key, String(value)));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const bodyJson = async <T>(request: Request): Promise<T> => {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return {} as T;
  }

  return request.json() as Promise<T>;
};

const parseMultipartFile = async (request: Request) => {
  const form = await request.formData();
  const file = form.get("file");

  if (
    !file ||
    typeof file !== "object" ||
    !("arrayBuffer" in file) ||
    !("name" in file) ||
    !("size" in file)
  ) {
    throw { statusCode: 400, message: "A file is required." };
  }

  const uploadedFile = file as {
    arrayBuffer: () => Promise<ArrayBuffer>;
    name: string;
    type?: string;
    size: number;
  };

  return {
    fileBuffer: Buffer.from(await uploadedFile.arrayBuffer()),
    originalName: uploadedFile.name,
    mimeType: uploadedFile.type || "application/octet-stream",
    sizeBytes: uploadedFile.size,
    driveId: stringValue(form.get("driveId")),
    parentId: stringValue(form.get("parentId")),
  };
};

const stringValue = (value: unknown) => (typeof value === "string" && value ? value : undefined);


const getRequestMeta = (request: Request) => ({
  ipAddress: request.headers.get("cf-connecting-ip") ?? undefined,
  userAgent: request.headers.get("user-agent") ?? undefined,
});

const route = (
  method: string,
  path: string,
  handler: (context: HandlerContext) => Promise<Response>,
): Route => {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path
      .replace(/\/:([^/]+)/g, (_match, key: string) => {
        keys.push(key);
        return "/([^/]+)";
      })
      .replace(/\//g, "\\/")}$`,
  );
  return { method, pattern, keys, handler };
};

const getParams = (routeDef: Route, match: RegExpMatchArray) =>
  Object.fromEntries(routeDef.keys.map((key, index) => [key, decodeURIComponent(match[index + 1] ?? "")]));

const getPaginationOptions = (url: URL) => {
  const limit = Number(url.searchParams.get("limit") ?? undefined);
  return {
    limit: Number.isFinite(limit) ? limit : undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  };
};

const handleError = (error: unknown) => {
  if (isAuthError(error) || isStorageError(error) || isUploadError(error)) {
    return json({ message: error.message }, { status: error.statusCode });
  }

  const err = error as HttpErrorLike;
  if (typeof err?.statusCode === "number") {
    return json({ message: err.message ?? "Something went wrong." }, { status: err.statusCode });
  }

  console.error("Request error", error);
  return json({ message: "Something went wrong." }, { status: 500 });
};

const routes: Route[] = [
  route("GET", "/api/health", async ({ env }) =>
    json({
      status: "ok",
      runtime: "cloudflare-workers",
      environment: env.ENVIRONMENT ?? "production",
      timestamp: new Date().toISOString(),
    }),
  ),

  route("POST", "/api/auth/register", async ({ request }) => {
    const body = await bodyJson<{ email?: string; password?: string; name?: string }>(request);
    return json(
      await registerUser({
        email: body.email ?? "",
        password: body.password ?? "",
        name: body.name,
        ...getRequestMeta(request),
      }),
      { status: 201 },
    );
  }),
  route("POST", "/api/auth/login", async ({ request }) => {
    const body = await bodyJson<{ email?: string; password?: string }>(request);
    return json(
      await loginUser({
        email: body.email ?? "",
        password: body.password ?? "",
        ...getRequestMeta(request),
      }),
    );
  }),
  route("POST", "/api/auth/logout", async ({ request }) => json(await logoutUser({ token: getBearerToken(request) }))),
  route("POST", "/api/auth/forgot-password", async ({ request }) => {
    const body = await bodyJson<{ email?: string }>(request);
    return json(await requestPasswordReset({ email: body.email ?? "" }));
  }),
  route("POST", "/api/auth/reset-password", async ({ request }) => {
    const body = await bodyJson<{ token?: string; password?: string }>(request);
    return json(await resetPassword({ token: body.token ?? "", password: body.password ?? "" }));
  }),

  route("POST", "/api/storage/connections", async ({ request }) => {
    await requireAuth(request, prisma);
    return json(await createStorageConnection(await bodyJson(request)), { status: 201 });
  }),
  route("GET", "/api/storage/connections", async ({ request, url }) => {
    await requireAuth(request, prisma);
    return json(await listStorageConnections(getPaginationOptions(url)));
  }),
  route("GET", "/api/storage/dashboard", async ({ request, url }) => {
    await requireAuth(request, prisma);
    return json(await getStorageDashboard(getPaginationOptions(url)));
  }),
  route("GET", "/api/storage/connections/:id", async ({ request, params }) => {
    await requireAuth(request, prisma);
    return json(await getStorageConnection(params.id));
  }),
  route("PATCH", "/api/storage/connections/:id", async ({ request, params }) => {
    await requireAuth(request, prisma);
    return json(await updateStorageConnection({ id: params.id, input: await bodyJson(request) }));
  }),
  route("DELETE", "/api/storage/connections/:id", async ({ request, params }) => {
    await requireAuth(request, prisma);
    return json(await deleteStorageConnection(params.id));
  }),

  route("GET", "/api/files", async ({ request, url }) => {
    const userId = await requireAuth(request, prisma);
    return json(await listFiles({ userId, driveId: url.searchParams.get("driveId") ?? undefined }));
  }),
  route("GET", "/api/files/trash", async ({ request, url }) => {
    const userId = await requireAuth(request, prisma);
    return json(await listTrash({ userId, driveId: url.searchParams.get("driveId") ?? undefined }));
  }),
  route("DELETE", "/api/files/trash", async ({ request, url }) => {
    const userId = await requireAuth(request, prisma);
    return json(await emptyTrash({ userId, driveId: url.searchParams.get("driveId") ?? undefined }));
  }),
  route("GET", "/api/storage/quota", async ({ request, url }) => {
    const userId = await requireAuth(request, prisma);
    return json(await getUserStorageQuota({ userId, driveId: url.searchParams.get("driveId") ?? undefined }));
  }),
  route("POST", "/api/files/folders", async ({ request }) => {
    const userId = await requireAuth(request, prisma);
    const body = await bodyJson<{ name?: string; driveId?: string; parentId?: string }>(request);
    return json(
      await createFolder({ userId, name: body.name ?? "", driveId: body.driveId, parentId: body.parentId }),
      { status: 201 },
    );
  }),
  route("POST", "/api/files", async ({ request }) => {
    const userId = await requireAuth(request, prisma);
    const file = await parseMultipartFile(request);
    return json(await uploadFile({ userId, ...file }), { status: 201 });
  }),
  route("GET", "/api/files/:nodeId/preview", async ({ request, url, params }) => {
    const userId = await requireAuth(request, prisma);
    const expiresIn = Number(url.searchParams.get("expiresIn") ?? 900);
    return json(await previewFile({ userId, nodeId: params.nodeId, expiresIn }));
  }),
  route("GET", "/api/files/:nodeId/download", async ({ request, url, params }) => {
    const userId = await requireAuth(request, prisma);
    const expiresIn = Number(url.searchParams.get("expiresIn") ?? 3600);
    return json(await downloadFile({ userId, nodeId: params.nodeId, expiresIn }));
  }),
  route("PATCH", "/api/files/:nodeId", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    const body = await bodyJson<{ name?: string; description?: string; isFavorite?: boolean; tags?: string[] }>(request);
    return json(await updateNodeDetails({ userId, nodeId: params.nodeId, ...body }));
  }),
  route("POST", "/api/files/:nodeId/trash", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    return json(await trashNode({ userId, nodeId: params.nodeId }));
  }),
  route("POST", "/api/files/:nodeId/restore", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    return json(await restoreNode({ userId, nodeId: params.nodeId }));
  }),
  route("DELETE", "/api/files/:nodeId", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    return json(await deleteNode({ userId, nodeId: params.nodeId }));
  }),
  route("POST", "/api/files/:nodeId/shares", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    const body = await bodyJson<{ expiresIn?: number }>(request);
    return json(await createShareLink({ userId, nodeId: params.nodeId, expiresIn: body.expiresIn }), { status: 201 });
  }),
  route("GET", "/api/files/:nodeId/shares", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    return json(await listShareLinks({ userId, nodeId: params.nodeId }));
  }),
  route("DELETE", "/api/shares/:linkId", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    return json(await revokeShareLink({ userId, linkId: params.linkId }));
  }),
  route("GET", "/api/share/:token", async ({ params }) => json(await resolveShareLink(params.token))),

  route("POST", "/api/uploads/initiate", async ({ request }) => {
    const userId = await requireAuth(request, prisma);
    const body = await bodyJson<{
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
      driveId?: string;
      parentId?: string;
    }>(request);
    return json(
      await initiateMultipartUpload({
        userId,
        driveId: body.driveId,
        parentId: body.parentId,
        fileName: body.fileName ?? "",
        mimeType: body.mimeType,
        sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : NaN,
      }),
      { status: 201 },
    );
  }),
  route("GET", "/api/uploads/:id", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    return json(await getUploadSessionStatus({ userId, uploadSessionId: params.id }));
  }),
  route("POST", "/api/uploads/:id/part-url", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    const body = await bodyJson<{ partNumber?: number }>(request);
    return json(
      await getUploadPartUrl({
        userId,
        uploadSessionId: params.id,
        partNumber: typeof body.partNumber === "number" ? body.partNumber : NaN,
      }),
    );
  }),
  route("GET", "/api/uploads/:id/parts", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    return json(await listUploadedParts({ userId, uploadSessionId: params.id }));
  }),
  route("POST", "/api/uploads/:id/complete", async ({ request, params, ctx, env }) => {
    const userId = await requireAuth(request, prisma);
    const body = await bodyJson<{ parts?: { partNumber: number; etag: string }[] }>(request);
    const result = await requestUploadCompletion({ userId, uploadSessionId: params.id, parts: body.parts ?? [] });
    await scheduleFinalize(env, ctx, params.id);
    return json(result, { status: 202 });
  }),
  route("POST", "/api/uploads/:id/abort", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    return json(await abortUpload({ userId, uploadSessionId: params.id }));
  }),

  route("GET", "/api/apikeys", async ({ request }) => {
    const userId = await requireAuth(request, prisma);
    return json(await listApiKeys(userId));
  }),
  route("POST", "/api/apikeys", async ({ request }) => {
    const userId = await requireAuth(request, prisma);
    const body = await bodyJson<{ name?: string; expiresIn?: number }>(request);
    return json(await createApiKey({ userId, name: body.name ?? "", expiresIn: body.expiresIn }), { status: 201 });
  }),
  route("DELETE", "/api/apikeys/:keyId", async ({ request, params }) => {
    const userId = await requireAuth(request, prisma);
    return json(await revokeApiKey({ userId, keyId: params.keyId }));
  }),

  route("GET", "/api/v1/files", async ({ request, url, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    let result = await listFiles({ userId });
    const parentId = url.searchParams.get("parentId");
    const type = url.searchParams.get("type");
    const search = url.searchParams.get("search");
    if (parentId !== null) result = result.filter((node) => node.parentId === (parentId || null));
    if (type === "FILE" || type === "FOLDER") result = result.filter((node) => node.type === type);
    if (search) result = result.filter((node) => node.name.toLowerCase().includes(search.toLowerCase()));
    return json({ data: result, total: result.length });
  }),
  route("GET", "/api/v1/files/:id", async ({ request, params, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    const node = await prisma.node.findFirst({
      where: { id: params.id, isDeleted: false, drive: { ownerId: userId } },
      include: { tags: { include: { tag: true } } },
    });
    if (!node) {
      throw { statusCode: 404, message: "Not found." };
    }
    return json({
      id: node.id,
      name: node.name,
      type: node.type,
      parentId: node.parentId,
      mimeType: node.mimeType,
      size: Number(node.sizeBytes),
      description: node.description,
      isFavorite: node.isFavorite,
      tags: node.tags.map((nodeTag) => nodeTag.tag.name),
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    });
  }),
  route("POST", "/api/v1/folders", async ({ request, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    const body = await bodyJson<{ name?: string; parentId?: string }>(request);
    return json(await createFolder({ userId, name: body.name ?? "", parentId: body.parentId }), { status: 201 });
  }),
  route("POST", "/api/v1/files/upload", async ({ request, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    const file = await parseMultipartFile(request);
    return json(await uploadFile({ userId, ...file }), { status: 201 });
  }),
  route("GET", "/api/v1/files/:id/download", async ({ request, url, params, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    const expiresIn = Number(url.searchParams.get("expiresIn") ?? 3600);
    return json(await downloadFile({ userId, nodeId: params.id, expiresIn }));
  }),
  route("GET", "/api/v1/files/:id/preview", async ({ request, url, params, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    const expiresIn = Number(url.searchParams.get("expiresIn") ?? 900);
    return json(await previewFile({ userId, nodeId: params.id, expiresIn }));
  }),
  route("PATCH", "/api/v1/files/:id", async ({ request, params, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    const body = await bodyJson<{ name?: string; description?: string }>(request);
    return json(await updateNodeDetails({ userId, nodeId: params.id, ...body }));
  }),
  route("DELETE", "/api/v1/files/:id", async ({ request, params, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    return json(await deleteNode({ userId, nodeId: params.id }));
  }),

  // API Key Trash & Quota Routes
  route("GET", "/api/v1/trash", async ({ request, url, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    return json(await listTrash({ userId, driveId: url.searchParams.get("driveId") ?? undefined }));
  }),
  route("POST", "/api/v1/files/:id/trash", async ({ request, params, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    return json(await trashNode({ userId, nodeId: params.id }));
  }),
  route("POST", "/api/v1/files/:id/restore", async ({ request, params, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    return json(await restoreNode({ userId, nodeId: params.id }));
  }),
  route("DELETE", "/api/v1/trash", async ({ request, url, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    return json(await emptyTrash({ userId, driveId: url.searchParams.get("driveId") ?? undefined }));
  }),
  route("GET", "/api/v1/storage/quota", async ({ request, url, ctx }) => {
    const userId = await requireApiKey(request, prisma, ctx);
    return json(await getUserStorageQuota({ userId, driveId: url.searchParams.get("driveId") ?? undefined }));
  }),

  // ── Admin — Stats ─────────────────────────────────────────────────────────
];

const configureForRequest = (env: Env) => {
  configureRuntimeEnv({
    DATABASE_URL: env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL,
    DIRECT_URL: env.HYPERDRIVE?.connectionString ?? env.DIRECT_URL,
    FRONTEND_URL: env.FRONTEND_URL ?? env.FRONTEND_ORIGIN,
    APP_URL: env.APP_URL,
    RESEND_KEY: env.RESEND_KEY,
    JWT_SECRET: env.JWT_SECRET,
  });

  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (connectionString) {
    configurePrisma(connectionString);
  }
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    configureForRequest(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
    }

    const url = new URL(request.url);

    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
      return Response.redirect(url.toString(), 308);
    }

    try {
      for (const routeDef of routes) {
        if (routeDef.method !== request.method) continue;
        const match = url.pathname.match(routeDef.pattern);
        if (!match) continue;

        const response = await routeDef.handler({
          request,
          env,
          ctx,
          url,
          params: getParams(routeDef, match),
        });
        return withCors(response, request, env);
      }

      return withCors(json({ message: "Not found." }, { status: 404 }), request, env);
    } catch (error) {
      return withCors(handleError(error), request, env);
    } finally {
      // Workers isolate I/O per request — a `pg` Pool's TCP connection can't
      // be safely reused across separate fetch() invocations. Hyperdrive
      // keeps the real upstream Postgres connection warm, so tearing this
      // down and reconnecting each request stays cheap.
      ctx.waitUntil(disconnectPrisma());
    }
  },

  // Durable upload finalization consumer. Only invoked when the UPLOAD_QUEUE
  // binding + consumer are configured in wrangler.jsonc; Cloudflare Queues
  // handles retries/DLQ per that config.
  async queue(batch: MessageBatch<UploadFinalizeMessage>, env: Env): Promise<void> {
    configureForRequest(env);

    for (const message of batch.messages) {
      try {
        await finalizeUploadNow({ uploadSessionId: message.body.uploadSessionId });
        message.ack();
      } catch (error) {
        console.error("Upload finalization failed", message.body.uploadSessionId, error);
        message.retry();
      }
    }
  },

  // Cloudflare Workers Scheduled Event handler (Cron Trigger).
  // Automatically purges items from the trash older than 30 days.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    configureForRequest(env);
    ctx.waitUntil(purgeExpiredTrash());
  },
};
