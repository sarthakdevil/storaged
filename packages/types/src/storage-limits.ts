import type { StorageProvider } from "./storage.js";

export const MAX_UPLOAD_BYTES = 3 * 1024 ** 3;

// Conservative defaults, capped at the application's 3 GiB maximum.
// Supabase Free projects permit 50 MiB; paid/custom settings may override it.
// References and verification date: docs-folder-uploads.md.
export const DEFAULT_MAX_FILE_SIZE_MB = {
  s3: 3072,
  supabase: 50,
  backblaze: 3072,
  storj: 3072,
  "cloudflare-r2": 3072,
  "idrive-e2": 3072,
  filebase: 3072,
  "oracle-oci": 3072,
} satisfies Record<StorageProvider, number>;

export function defaultMaxFileSizeMb(provider: string): number {
  return DEFAULT_MAX_FILE_SIZE_MB[provider as StorageProvider] ?? 3072;
}

export function resolveMaxFileSizeBytes(provider: string, overrideMb?: number | null): number {
  return Math.min(MAX_UPLOAD_BYTES, Math.floor(
    (overrideMb ?? defaultMaxFileSizeMb(provider)) * 1024 ** 2,
  ));
}
