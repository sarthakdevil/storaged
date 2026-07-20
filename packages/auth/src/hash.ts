// ─── SHA-256 hashing via Web Crypto ──────────────────────────────────────────
// Works in Cloudflare Workers, Node.js, and browsers — no Node crypto dependency.

/**
 * Returns the hex-encoded SHA-256 digest of the given string.
 * Used for API key hashing and password-reset token hashing.
 */
export async function hashSha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}
