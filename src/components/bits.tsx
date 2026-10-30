"use client";
import { useEffect, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useInboxConfig, useSystemLabel } from "./config";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status, type System, type Task } from "@/lib/types";
import { PRIORITY_STYLE, STATUS_STYLE, fmtDateTime } from "@/lib/ui";

export const StatusPill = ({ status }: { status: Status }) => <span className={`pill pill-dot ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
export const PriorityPill = ({ priority }: { priority: Priority }) => priority === "normal" ? null : <span className={`pill ${PRIORITY_STYLE[priority]}`}>{PRIORITY_LABEL[priority]}</span>;
export function SystemChips({ systems }: { systems: System[] }) {
  const label = useSystemLabel();
  return <span className="flex flex-wrap gap-1">{systems.map((s) => <span key={s} className="chip">{label(s)}</span>)}</span>;
}

/**
 * Where a task stands with Claude's automatic intake: counting down the grace
 * period, ready, sent at once, or held. Uses the server's `readyAt`, so the
 * page needs no settings. `compact` is the board's one-word form.
 */
/** The clock for countdowns: ticks every 30 s so a chip does not call Date.now() during render. */
export function useNow(stepMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), stepMs); return () => clearInterval(t); }, [stepMs]);
  return now;
}

export function ReadinessChip({ task, compact = false }: { task: Task; compact?: boolean }) {
  const now = useNow();
  if (task.hold?.active) {
    return <span className="pill bg-coral/15 text-coral" title={`${task.hold.by} · ${fmtDateTime(task.hold.at)}${task.hold.note ? ` · ${task.hold.note}` : ""}`}>{compact ? "หยุดชั่วคราว" : "หยุดชั่วคราว — รอ Claude อ่านความเห็นใหม่"}</span>;
  }
  if (task.status !== "new" || !task.readyAt) return null;
  const left = Date.parse(task.readyAt) - now;
  const sentNow = Boolean(task.readyNowAt && task.readyNowAt >= (task.teamActivityAt ?? task.updatedAt));
  if (left > 0) {
    const minutes = Math.max(1, Math.ceil(left / 60_000));
    return <span className="pill bg-ink-3 text-mist" title={`พร้อมให้ Claude ${fmtDateTime(task.readyAt)}`}>{compact ? `Claude ใน ${minutes} นาที` : `พร้อมให้ Claude ใน ${minutes} นาที`}</span>;
  }
  if (sentNow) return <span className="pill bg-violet/15 text-violet">ส่งให้ Claude แล้ว</span>;
  return <span className="pill bg-violet/15 text-violet">พร้อมให้ Claude แล้ว</span>;
}

export function Md({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`prose-inbox ${className}`}>
      <Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{text}</Markdown>
    </div>
  );
}

/** Copies text; the label flips to "คัดลอกแล้ว" for a moment. */
export function CopyButton({ text, label = "คัดลอก", className = "btn btn-ghost btn-sm" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1500); return () => clearTimeout(t); }, [done]);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); } catch { /* clipboard blocked */ }
  }
  return <button type="button" onClick={copy} className={className}>{done ? "คัดลอกแล้ว ✓" : label}</button>;
}

export function Notice({ kind = "error", children }: { kind?: "error" | "ok" | "info"; children: ReactNode }) {
  const cls = kind === "error" ? "border-coral/40 bg-coral/10 text-coral" : kind === "ok" ? "border-mint/40 bg-mint/10 text-mint" : "border-sky/40 bg-sky/10 text-sky";
  return <div className={`rounded-xl border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function Avatar({ name, kind = "user", size = "size-8" }: { name: string; kind?: "user" | "claude"; size?: string }) {
  const initial = name.replace(/^Claude \(/, "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full text-xs font-bold ${kind === "claude" ? "bg-violet text-ink" : "bg-ink-3 text-fog border border-line"}`}>
      {kind === "claude" ? "C" : initial}
    </span>
  );
}

export const Spinner = () => <span className="inline-block size-4 animate-spin rounded-full border-2 border-fog/30 border-t-fog" />;

/** Priority selector as chips. */
export function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
        <button key={p} type="button" onClick={() => onChange(p)} className={`chip ${value === p ? "chip-on" : ""}`}>{PRIORITY_LABEL[p]}</button>
      ))}
    </div>
  );
}

export function SystemPicker({ value, onChange }: { value: System[]; onChange: (s: System[]) => void }) {
  const { systems } = useInboxConfig();
  const toggle = (s: System) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {systems.map((s) => (
        <button key={s.key} type="button" onClick={() => toggle(s.key)} className={`chip ${value.includes(s.key) ? "chip-on" : ""}`}>{s.label}</button>
      ))}
    </div>
  );
}
