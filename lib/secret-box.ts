import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto"

// Small AES-256-GCM wrapper for the handful of secrets that have to live in the
// database. The database file gets copied into NAS snapshots and backups far
// more casually than a compose file does, so a stored mail password shouldn't
// be readable from one.
//
// The key comes from AUTH_SECRET, which the app already requires. Rotating
// AUTH_SECRET therefore makes existing ciphertext undecryptable — decrypt()
// returns null in that case so callers can ask for the value again rather than
// failing in a way that looks like a broken mail server.

const VERSION = "v1"
// Fixed salt: the secret itself is high-entropy, and a random per-record salt
// would have to be stored alongside anyway.
const SALT = "homecenter.secret-box"

function key() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is not set — cannot encrypt stored secrets")
  return scryptSync(secret, SALT, 32)
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":")
}

/** Returns null when the value can't be decrypted — usually a rotated AUTH_SECRET. */
export function decrypt(payload: string): string | null {
  try {
    const [version, iv, tag, data] = payload.split(":")
    if (version !== VERSION || !iv || !tag || !data) return null

    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
  } catch {
    // Wrong key, tampered ciphertext, or malformed input — all mean "unusable".
    return null
  }
}
