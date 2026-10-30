/**
 * When may Claude take a task without being told? ("As soon as work comes in,
 * let it pick the task up" — with a pause first, so the person who filed the
 * task can still edit it.)
 *
 * A task is ready when it is `new`, the team has left it alone for the grace
 * period (counted from the last HUMAN change — Claude's own comments and
 * reports do not count), and nobody has pressed "หยุดก่อน". "ส่งให้ Claude เลย"
 * skips the wait. Pure: every function takes `now`.
 */
import { PRIORITIES, type Priority, type Task } from "./types";

export const DEFAULT_GRACE_MINUTES = 10;
export const MAX_GRACE_MINUTES = 24 * 60;

export interface InboxSettings {
  /** Minutes the team's last change must be old before Claude may pull a new task. */
  graceMinutes: number;
}

export function normaliseGrace(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_GRACE_MINUTES;
  return Math.min(MAX_GRACE_MINUTES, Math.max(0, n));
}

/** The last change made by a person; tasks from before this field existed fall back to their last change. */
export const teamActivityAt = (task: Pick<Task, "teamActivityAt" | "updatedAt">): string => task.teamActivityAt ?? task.updatedAt;

/** When Claude may take the task: the grace after the team's last change, or at once if "ส่งให้ Claude เลย" came after that change. */
export function readyAt(task: Pick<Task, "teamActivityAt" | "updatedAt" | "readyNowAt">, graceMinutes: number): string {
  const activity = teamActivityAt(task);
  if (task.readyNowAt && task.readyNowAt >= activity) return task.readyNowAt;
  return new Date(Date.parse(activity) + graceMinutes * 60_000).toISOString();
}

export const isHeld = (task: Pick<Task, "hold">): boolean => Boolean(task.hold?.active);

export function isReady(task: Task, graceMinutes: number, now: number): boolean {
  return task.status === "new" && !isHeld(task) && Date.parse(readyAt(task, graceMinutes)) <= now;
}

export type Readiness =
  | { kind: "waiting"; minutes: number; at: string }
  | { kind: "ready"; at: string }
  | { kind: "sent"; at: string }
  | { kind: "held" }
  | null;

/** What the page shows next to a task: the countdown, "ready", "sent to Claude", or the hold. Null when it does not apply. */
export function readiness(task: Task, graceMinutes: number, now: number): Readiness {
  if (isHeld(task)) return { kind: "held" };
  if (task.status !== "new") return null;
  const at = readyAt(task, graceMinutes);
  const sentNow = Boolean(task.readyNowAt && task.readyNowAt >= teamActivityAt(task));
  if (Date.parse(at) <= now) return { kind: sentNow ? "sent" : "ready", at };
  return { kind: "waiting", minutes: Math.max(1, Math.ceil((Date.parse(at) - now) / 60_000)), at };
}

const RANK: Record<Priority, number> = Object.fromEntries(PRIORITIES.map((p, i) => [p, i])) as Record<Priority, number>;

/** Ready tasks, most urgent first, then the one that has waited longest. */
export function sortReady(tasks: Task[], graceMinutes: number): Task[] {
  return [...tasks].sort((a, b) => RANK[a.priority] - RANK[b.priority] || readyAt(a, graceMinutes).localeCompare(readyAt(b, graceMinutes)) || a.number - b.number);
}

/** Adds the computed `readyAt` so pages and the CLI need no settings of their own. */
export function withReadiness<T extends Task>(task: T, graceMinutes: number): T {
  return { ...task, readyAt: readyAt(task, graceMinutes) };
}
