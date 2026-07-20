// ─── JWT signing & verification via Web Crypto (HMAC-SHA256) ─────────────────
// Used for service-to-service tokens between the AI microservice and the backend.
// Fully edge-runtime compatible — no third-party JWT library required.

import { bufferToHex } from "./hash.js";

function base64UrlEncode(data: ArrayBuffer | string): string {
  let binary: string;
  if (typeof data === "string") {
    binary = data;
  } else {
    binary = String.fromCharCode(...new Uint8Array(data));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str: string): string {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Sign a payload as a compact HS256 JWT. */
export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(sig)}`;
}

/** Verify an HS256 JWT and return its payload. Throws on invalid token. */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const [header, body, signature] = parts as [string, string, string];
  const signingInput = `${header}.${body}`;

  const key = await importHmacKey(secret);

  const sigBytes = Uint8Array.from(base64UrlDecode(signature), (c) =>
    c.charCodeAt(0),
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(signingInput),
  );

  if (!valid) throw new Error("JWT signature invalid");

  const payload = JSON.parse(base64UrlDecode(body)) as Record<string, unknown>;

  if (typeof payload["exp"] === "number" && payload["exp"] < Date.now() / 1000) {
    throw new Error("JWT expired");
  }

  return payload;
}
