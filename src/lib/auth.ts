/** Passwords (scrypt), API tokens, and the signed session cookie body. Pure: no I/O. */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const key = scryptSync(password.normalize("NFKC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const candidate = scryptSync(password.normalize("NFKC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  const expected = Buffer.from(key, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร";
  if (password.length > 200) return "รหัสผ่านยาวเกินไป";
  return null;
}

/** A fresh API token (shown once) and what we keep of it. */
export function newApiToken(): { token: string; hash: string; prefix: string } {
  const token = `tin_${randomBytes(24).toString("hex")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const looksLikeToken = (s: string) => /^tin_[0-9a-f]{48}$/.test(s);

/** A random temporary password an admin hands to a new team member. */
export function temporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
}

export interface SessionBody { uid: string; exp: number; pw: string }

const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url");

/** `pw` is a fingerprint of the password hash so a password change signs every other device out. */
export function encodeSession(secret: string, uid: string, passwordHash: string, ttlMs: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ uid, exp: now + ttlMs, pw: fingerprint(passwordHash) } satisfies SessionBody)).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

export function decodeSession(secret: string, raw: string | undefined, now = Date.now()): SessionBody | null {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = sign(secret, body);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionBody;
    return s.exp > now && typeof s.uid === "string" ? s : null;
  } catch {
    return null;
  }
}

export const fingerprint = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("hex").slice(0, 12);
export const newId = (bytes = 8) => randomBytes(bytes).toString("hex");
