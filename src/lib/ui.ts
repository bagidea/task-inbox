/** Shared presentation bits (client-safe): colours per status / priority, relative time. */
import type { Priority, Status } from "./types";

export const STATUS_STYLE: Record<Status, string> = {
  new: "bg-sky/15 text-sky",
  in_progress: "bg-violet/15 text-violet",
  needs_info: "bg-amber/15 text-amber",
  review: "bg-mint/15 text-mint",
  done: "bg-fog/10 text-fog",
  cancelled: "bg-coral/10 text-coral",
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  urgent: "bg-coral text-paper",
  high: "bg-amber/20 text-amber",
  normal: "bg-ink-3 text-fog",
  low: "bg-ink-3 text-mist",
};

export function timeAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "เมื่อครู่";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} วันที่แล้ว`;
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }).format(new Date(t));
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) }, credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
