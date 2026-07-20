// ─── Session token generation ─────────────────────────────────────────────────
// Uses Web Crypto getRandomValues — works in all edge runtimes.

const TOKEN_BYTES = 32;

/**
 * Generate a cryptographically secure random session token.
 * Returns a 64-character lowercase hex string.
 */
export function generateSessionToken(): string {
  const buf = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
