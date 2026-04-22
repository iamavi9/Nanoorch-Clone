import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { loadSecret } from "./secrets";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const encKey = loadSecret("ENCRYPTION_KEY");
  if (encKey) {
    const hex = encKey.replace(/\s/g, "");
    if (hex.length === 64) {
      // Direct 32-byte key — no KDF/salt needed
      return Buffer.from(hex, "hex");
    }
    // Passphrase mode: require ENCRYPTION_KEY_SALT (no hardcoded fallback)
    const kdfSalt = loadSecret("ENCRYPTION_KEY_SALT");
    if (!kdfSalt) {
      throw new Error(
        "[encryption] Set ENCRYPTION_KEY_SALT when ENCRYPTION_KEY is a passphrase. " +
        "For backward compatibility with the default deployment, set it to the value " +
        "documented in the project README.",
      );
    }
    return scryptSync(encKey, kdfSalt, 32);
  }

  const sessionSecret = loadSecret("SESSION_SECRET");
  if (!sessionSecret) {
    throw new Error(
      "[encryption] Neither ENCRYPTION_KEY nor SESSION_SECRET is set. " +
      "Set at least SESSION_SECRET (or preferably ENCRYPTION_KEY) before starting the app.",
    );
  }
  const kdfSalt = loadSecret("ENCRYPTION_KEY_SALT");
  if (!kdfSalt) {
    throw new Error(
      "[encryption] Set ENCRYPTION_KEY_SALT when using SESSION_SECRET for encryption. " +
      "For backward compatibility with the default deployment, set it to the value " +
      "documented in the project README.",
    );
  }
  return scryptSync(sessionSecret, kdfSalt, 32);
}

interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decrypt(encryptedBase64: string): string {
  const key = getKey();
  const payload: EncryptedPayload = JSON.parse(Buffer.from(encryptedBase64, "base64").toString("utf8"));
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
