import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
type Config = Record<string, unknown>;
const AAD = Buffer.from("storaged:bucket-credentials:v1");
const keyBytes = (key?: string) => {
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error(
      "STORAGE_ENCRYPTION_KEY must be a 32-byte hexadecimal secret.",
    );
  return Buffer.from(key, "hex");
};
export function decryptCredentials(config: Config, key?: string): Config {
  if (config.encryptedCredentials === undefined) return { ...config };
  const e = config.encryptedCredentials as {
    version?: number;
    iv?: string;
    tag?: string;
    ciphertext?: string;
  };
  if (
    !e ||
    e.version !== 1 ||
    typeof e.iv !== "string" ||
    typeof e.tag !== "string" ||
    typeof e.ciphertext !== "string"
  )
    throw new Error("Invalid encrypted storage credentials.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyBytes(key),
    Buffer.from(e.iv, "base64"),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(e.tag, "base64"));
  const credentials = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(e.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  ) as Config;
  if (
    typeof credentials.accessKeyId !== "string" ||
    typeof credentials.secretAccessKey !== "string"
  )
    throw new Error("Invalid decrypted storage credentials.");
  const {
    encryptedCredentials: _e,
    accessKeyId: _id,
    secretAccessKey: _secret,
    ...publicConfig
  } = config;
  return {
    ...publicConfig,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
  };
}
export function encryptCredentials(config: Config, key?: string): Config {
  const {
    accessKeyId,
    secretAccessKey,
    encryptedCredentials: _old,
    ...publicConfig
  } = decryptCredentials(config, key);
  if (typeof accessKeyId !== "string" || typeof secretAccessKey !== "string")
    throw new Error("Storage credentials are required.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ accessKeyId, secretAccessKey }), "utf8"),
    cipher.final(),
  ]);
  return {
    ...publicConfig,
    encryptedCredentials: {
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    },
  };
}
