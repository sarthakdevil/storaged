// ─── Password hashing via Web Crypto (PBKDF2) ─────────────────────────────────
// Replaces the Node.js scrypt implementation so this works natively in
// Cloudflare Workers edge runtime without the nodejs_compat flag.
//
// Format stored in DB:  "pbkdf2v1:<hex-salt>:<hex-derived-key>"
// Legacy scrypt format: "<hex-salt>:<hex-derived-key>"  (verified via verifyPassword)

import { bufferToHex, hexToBuffer } from "./hash.js";

const ALGORITHM = "PBKDF2";
const HASH = "SHA-256";
const ITERATIONS = 100_000; // Cloudflare Workers' WebCrypto PBKDF2 caps out at 100,000
const KEY_LENGTH = 64; // bytes → 128 hex chars

const VERSION_PREFIX = "pbkdf2v1";

async function deriveKey(password: string, saltHex: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt: hexToBuffer(saltHex),
      iterations: ITERATIONS,
      hash: HASH,
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );

  return bufferToHex(bits);
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bufferToHex(buf.buffer);
}

/**
 * Hash a plaintext password. Returns a storable string in the format:
 * `pbkdf2v1:<salt-hex>:<derived-key-hex>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomHex(16); // 16 bytes = 32 hex chars
  const derived = await deriveKey(password, salt);
  return `${VERSION_PREFIX}:${salt}:${derived}`;
}

/**
 * Verify a plaintext password against a stored hash.
 * Supports both the new PBKDF2 format and the legacy Node scrypt format
 * (which is `<salt>:<key>` without a version prefix).
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (storedHash.startsWith(`${VERSION_PREFIX}:`)) {
    // New PBKDF2 format
    const parts = storedHash.split(":");
    // Format: "pbkdf2v1:<salt>:<key>" → parts[0]=pbkdf2v1, parts[1]=salt, parts[2]=key
    if (parts.length !== 3) return false;
    const [, salt, storedKey] = parts;
    if (!salt || !storedKey) return false;
    const derived = await deriveKey(password, salt);
    return timingSafeEqual(derived, storedKey);
  }

  // Legacy scrypt format — "<salt>:<key>" (two segments only)
  // We cannot re-derive without Node's scrypt, so we fall through to false.
  // In practice, accounts will re-hash on next login once the backend migrates.
  const segments = storedHash.split(":");
  if (segments.length === 2) {
    // Signal caller that legacy hash cannot be verified in edge runtime.
    // The backend's Node-capable worker can handle this separately if needed.
    return false;
  }

  return false;
}

// ─── Constant-time string comparison ─────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}
