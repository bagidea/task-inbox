/**
 * The systems (areas, products, repos) a task can be filed under. Configured
 * per deployment with `INBOX_SYSTEMS="key:Label,key:Label"`; keys are lower
 * case `[a-z0-9-]`, labels are shown on chips. Read at request time, never at
 * build time, so one image serves every team.
 */
import type { SystemDef } from "./types";

export const DEFAULT_SYSTEMS = "web:เว็บไซต์,backend:ระบบหลังบ้าน,mobile:แอปมือถือ,other:อื่น ๆ";
export const DEFAULT_INBOX_NAME = "Task Inbox";

export function parseSystemDefs(raw: string | undefined): SystemDef[] {
  const out: SystemDef[] = [];
  for (const part of (raw && raw.trim() ? raw : DEFAULT_SYSTEMS).split(",")) {
    const [k, ...rest] = part.split(":");
    const key = (k ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(key) || out.some((s) => s.key === key)) continue;
    const label = rest.join(":").trim() || key;
    out.push({ key, label: label.slice(0, 40) });
  }
  return out.length ? out : parseSystemDefs(DEFAULT_SYSTEMS);
}

export const systemDefs = (): SystemDef[] => parseSystemDefs(process.env.INBOX_SYSTEMS);
export const systemKeys = (): string[] => systemDefs().map((s) => s.key);
export const systemLabel = (key: string): string => systemDefs().find((s) => s.key === key)?.label ?? key;

/** What the inbox calls itself in the title bar, exports and hand-over notes. */
export const inboxName = (): string => (process.env.INBOX_NAME || "").trim() || DEFAULT_INBOX_NAME;
