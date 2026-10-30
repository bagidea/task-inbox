import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession, hashPassword, hashToken, looksLikeToken, newApiToken, passwordProblem, temporaryPassword, verifyPassword } from "@/lib/auth";

describe("passwords", () => {
  it("hash and verify, salted, with NFKC so a Thai password typed two ways still matches", () => {
    const h = hashPassword("ปลาทู-sardine-9");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("ปลาทู-sardine-9", h)).toBe(true);
    expect(verifyPassword("ปลาทู-sardine-8", h)).toBe(false);
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
    expect(verifyPassword("x", "plain$nope")).toBe(false);
  });
  it("rejects short passwords; temporary passwords are long enough and unambiguous", () => {
    expect(passwordProblem("1234567")).toMatch(/8/);
    expect(passwordProblem("12345678")).toBeNull();
    const t = temporaryPassword();
    expect(t).toHaveLength(12);
    expect(t).not.toMatch(/[0OIl1]/);
    expect(passwordProblem(t)).toBeNull();
  });
});

describe("api tokens", () => {
  it("look like tin_<48 hex>, keep only the hash, and the prefix identifies them", () => {
    const t = newApiToken();
    expect(looksLikeToken(t.token)).toBe(true);
    expect(t.hash).toBe(hashToken(t.token));
    expect(t.prefix).toBe(t.token.slice(0, 10));
    expect(looksLikeToken("tin_short")).toBe(false);
  });
});

describe("session cookie", () => {
  const secret = "s3cret";
  it("round-trips, expires, and dies with the password", () => {
    const hash = hashPassword("pw-123456");
    const raw = encodeSession(secret, "u1", hash, 1000, 1_000_000);
    expect(decodeSession(secret, raw, 1_000_500)?.uid).toBe("u1");
    expect(decodeSession(secret, raw, 1_001_001)).toBeNull();
    expect(decodeSession("other", raw, 1_000_500)).toBeNull();
    expect(decodeSession(secret, raw.slice(0, -2) + "zz", 1_000_500)).toBeNull();
    expect(decodeSession(secret, undefined)).toBeNull();
    const s = decodeSession(secret, raw, 1_000_500)!;
    expect(s.pw).not.toBe(encodeSession(secret, "u1", hashPassword("changed-1"), 1000, 1_000_000).split(".")[0]);
  });
});
