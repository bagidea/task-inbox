/**
 * Route-handler glue: JSON helpers, the session cookie, and who is asking
 * (a browser with the cookie, or the CLI with a bearer token).
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeSession, encodeSession, fingerprint, hashToken, looksLikeToken } from "./auth";
import { isProd, sessionSecret } from "./config";
import { getStore } from "./store";
import { TaskError } from "./tasks";
import type { Actor, User } from "./types";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Browser writes must come from our own pages; a request without Origin is not a browser. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

const hits = new Map<string, number[]>();
export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now); hits.set(key, list);
  return true;
}
export const clientKey = (request: Request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";

const COOKIE = "inbox_session";
const SESSION_DAYS = 30;

export async function openSession(user: User): Promise<void> {
  (await cookies()).set(COOKIE, encodeSession(sessionSecret(), user.id, user.passwordHash, SESSION_DAYS * 86_400_000), {
    httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86_400,
  });
}
export async function closeSession(): Promise<void> { (await cookies()).delete(COOKIE); }

/** Who is signed in through the cookie (pages and browser calls). */
export async function sessionUser(): Promise<User | null> {
  const s = decodeSession(sessionSecret(), (await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  const user = await getStore().getUser(s.uid);
  if (!user || user.disabled) return null;
  return fingerprint(user.passwordHash) === s.pw ? user : null;
}

export interface Caller { user: User; actor: Actor; via: "cookie" | "token" }

/**
 * Cookie first, then `Authorization: Bearer tin_…`. A token call may say it
 * acts as Claude (`X-Actor: claude`), which the timeline shows as such.
 */
export async function caller(request: Request): Promise<Caller | null> {
  const auth = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (m && looksLikeToken(m[1])) {
    const store = getStore();
    const token = await store.getTokenByHash(hashToken(m[1]));
    if (!token) return null;
    const user = await store.getUser(token.userId);
    if (!user || user.disabled) return null;
    const last = token.lastUsedAt ? Date.parse(token.lastUsedAt) : 0;
    if (Date.now() - last > 600_000) { token.lastUsedAt = new Date().toISOString(); await store.saveToken(token); }
    const asClaude = (request.headers.get("x-actor") || "").toLowerCase() === "claude";
    return { user, via: "token", actor: asClaude ? { id: user.id, name: `Claude (${user.name})`, kind: "claude" } : { id: user.id, name: user.name, kind: "user" } };
  }
  const user = await sessionUser();
  return user ? { user, via: "cookie", actor: { id: user.id, name: user.name, kind: "user" } } : null;
}

/** 401 without a caller; 403 for a browser write from another origin. */
export async function requireCaller(request: Request): Promise<Caller | NextResponse> {
  const c = await caller(request);
  if (!c) return fail(401, "ต้องเข้าสู่ระบบก่อน");
  if (c.via === "cookie" && request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) return fail(403, "cross-origin");
  return c;
}
export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;

/** `?force=1`: Claude may write to a held task anyway (the CLI option --force). */
export const forced = (request: Request) => new URL(request.url).searchParams.get("force") === "1";

/** Runs a handler and turns TaskErrors into their status. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TaskError) return fail(e.status, e.message, e.extra);
    console.error("[inbox] unhandled", e);
    return fail(500, "เกิดข้อผิดพลาดภายใน");
  }
}

export function baseUrlOf(request: Request): string {
  const configured = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3300";
  const proto = request.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
