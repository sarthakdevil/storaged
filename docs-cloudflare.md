# Cloudflare Edge Deployment

This repo is configured for Cloudflare Workers:

- `apps/frontend` deploys the Next.js app with OpenNext for Cloudflare.
- `apps/backend` has a Worker-native entrypoint at `src/edge.ts` and a Wrangler config.

## Install

```sh
npm install
```

## Local previews

```sh
npm run preview:cloudflare --workspace=backend
npm run preview:cloudflare --workspace=frontend
```

Backend preview runs on `http://localhost:7`. Frontend preview uses the OpenNext preview server.

## Deploy

```sh
npm run deploy:cloudflare --workspace=backend
npm run deploy:cloudflare --workspace=frontend
```

Update `apps/frontend/wrangler.jsonc` so `NEXT_PUBLIC_API_URL` points at the deployed backend Worker URL.

## Secrets

Set secrets with Wrangler. Do not commit real values.

```sh
cd apps/backend
wrangler secret put JWT_SECRET
wrangler secret put RESEND_KEY
wrangler secret put DATABASE_URL
wrangler secret put DIRECT_URL
```

## Backend status

The current Express/Prisma backend uses Node-only runtime assumptions. The Worker entrypoint is deployable and exposes `/api/health`; the remaining API routes need to be ported to Worker-safe handlers before they are fully functional on the edge. For Postgres on Workers, create a Hyperdrive binding and route database access through that binding. For file storage, create an R2 bucket and add the commented `STORAGE_BUCKET` binding in `apps/backend/wrangler.jsonc`.
