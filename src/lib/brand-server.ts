/** The workspace branding on the server, cached for a few seconds per process. */
import { resolveBranding, type Branding } from "./branding";
import { getStore } from "./store";

let cache: { at: number; value: Branding } | null = null;
const TTL_MS = 15_000;

export async function getBranding(): Promise<Branding> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let stored = null;
  // `next build` prerenders a few pages: never reach for the database there.
  if (process.env.NEXT_PHASE === "phase-production-build") return resolveBranding(null);
  try { stored = await getStore().getBranding(); } catch { /* the store is down or not configured (build): defaults */ }
  const value = resolveBranding(stored);
  cache = { at: Date.now(), value };
  return value;
}

export function forgetBranding(): void { cache = null; }

/** Branding for the browser: the logo itself stays behind /brand/icon (it can be 200 KB). */
export function publicBranding(b: Branding) {
  const { logo, ...rest } = b;
  return { ...rest, hasLogo: Boolean(logo), logoUrl: logo ? `/brand/icon?v=${encodeURIComponent(b.updatedAt ?? "1")}` : "/icon.svg" };
}
export type PublicBranding = ReturnType<typeof publicBranding>;
