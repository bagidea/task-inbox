/**
 * What the inbox calls itself and how it looks: app name, short name (under
 * the home-screen icon), page title, accent colour and logo. The defaults are
 * "Task Inbox" and its own logo; an owner/admin can rename it (e.g. "Acme
 * Tasks") in Settings. The env INBOX_NAME only changes the default name. Pure
 * apart from reading env.
 */

export interface Branding {
  /** Full app name: install prompt, notifications, login page. */
  name: string;
  /** Under the home-screen icon (≤ 12 characters looks right). */
  shortName: string;
  /** Browser tab title. */
  title: string;
  /** Accent colour (#rrggbb): buttons, chips, the "ถึงตาคุณ" badge. */
  accent: string;
  /** Custom logo as a data: URL (PNG / JPEG / WebP / SVG); empty = the built-in Task Inbox logo. */
  logo: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_ACCENT = "#c8f135";
export const MAX_LOGO_BYTES = 200 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export function defaultBranding(env: Record<string, string | undefined> = process.env): Branding {
  const name = (env.INBOX_NAME || "").trim().slice(0, 60) || "Task Inbox";
  return { name, shortName: shorten(name), title: name, accent: DEFAULT_ACCENT, logo: "" };
}

function shorten(name: string): string {
  if (name.length <= 12) return name;
  const words = name.split(/\s+/);
  const tail = words.slice(-2).join(" ");
  return tail.length <= 12 ? tail : name.slice(0, 12).trim();
}

/** Stored values over the defaults; anything missing or broken falls back. */
export function resolveBranding(stored: Partial<Branding> | null | undefined, env: Record<string, string | undefined> = process.env): Branding {
  const d = defaultBranding(env);
  const s = stored ?? {};
  const name = clean(s.name, 60) || d.name;
  return {
    name,
    shortName: clean(s.shortName, 24) || (clean(s.name, 60) ? shorten(name) : d.shortName),
    title: clean(s.title, 80) || (clean(s.name, 60) ? name : d.title),
    accent: isHex(s.accent) ? s.accent!.toLowerCase() : d.accent,
    logo: typeof s.logo === "string" && logoProblem(s.logo) === null ? s.logo : "",
    ...(s.updatedAt ? { updatedAt: s.updatedAt } : {}),
    ...(s.updatedBy ? { updatedBy: s.updatedBy } : {}),
  };
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "");
export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** null = fine; otherwise why the logo is refused. */
export function logoProblem(dataUrl: string): string | null {
  if (!dataUrl) return null;
  const m = /^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return "โลโก้ต้องเป็นไฟล์รูป";
  if (!(LOGO_TYPES as readonly string[]).includes(m[1])) return "โลโก้ใช้ได้เฉพาะ PNG, JPG, WebP หรือ SVG";
  if (Math.floor((m[2].length * 3) / 4) > MAX_LOGO_BYTES) return "โลโก้ใหญ่เกิน 200 KB";
  return null;
}

export function decodeLogo(dataUrl: string): { type: string; bytes: Buffer } | null {
  const m = /^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  return m ? { type: m[1], bytes: Buffer.from(m[2], "base64") } : null;
}

/** The changes an admin sent, checked; throws a message for the page. Empty strings reset a field to its default. */
export function brandingPatch(body: Record<string, unknown>): Partial<Branding> {
  const next: Partial<Branding> = {};
  if (body.name !== undefined) next.name = clean(body.name, 60);
  if (body.shortName !== undefined) next.shortName = clean(body.shortName, 24);
  if (body.title !== undefined) next.title = clean(body.title, 80);
  if (body.accent !== undefined) {
    const a = String(body.accent ?? "").trim();
    if (a && !isHex(a)) throw new Error("สีต้องเป็นรหัสแบบ #c8f135");
    next.accent = a.toLowerCase();
  }
  if (body.logo !== undefined) {
    const l = String(body.logo ?? "");
    const problem = logoProblem(l);
    if (problem) throw new Error(problem);
    next.logo = l;
  }
  return next;
}

/** Text colour that reads on the accent: ink on light accents, white on dark ones. */
export function onAccent(hex: string): string {
  if (!isHex(hex)) return "#0b0f14";
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.35 ? "#0b0f14" : "#ffffff";
}

/** A slightly darker accent for hover / secondary use. */
export function accentShade(hex: string, f = 0.85): string {
  if (!isHex(hex)) return "#a7d41a";
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
