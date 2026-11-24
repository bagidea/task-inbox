/**
 * "ถึงตาใคร": who has to do something next on a task, and what — so "รอข้อมูล
 * เพิ่ม" / "รอทดสอบ" also say who must answer or test.
 *
 * By default it follows the status:
 *   needs_info → the person who filed the task answers   ("รอ Alice ตอบ")
 *   review     → the person who filed the task tests      ("รอ Alice ทดสอบ")
 *   new / in_progress → whoever does the task             ("รอ Claude ทำ")
 *   done / cancelled  → nobody
 * Anyone can override it from the task page or the CLI (`--wait Alice
 * --wait-action approve`). An override only holds for the status it was set
 * in; when the awaited person writes a comment, the turn goes back to the
 * people doing the task. Tasks stored before this existed are derived on read.
 * Pure.
 */
import type { Actor, Status, Task } from "./types";

export const WAIT_ACTIONS = ["answer", "test", "approve", "do"] as const;
export type WaitAction = (typeof WAIT_ACTIONS)[number];
export const WAIT_ACTION_LABEL: Record<WaitAction, string> = { answer: "ตอบ", test: "ทดสอบ", approve: "อนุมัติ", do: "ทำ" };

/** Thai words and English keys both work (`--wait-action ตอบ` or `answer`). */
export function parseWaitAction(raw: unknown): WaitAction | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if ((WAIT_ACTIONS as readonly string[]).includes(s)) return s as WaitAction;
  const hit = (Object.entries(WAIT_ACTION_LABEL) as [WaitAction, string][]).find(([, th]) => th === s);
  if (hit) return hit[0];
  if (s === "review" || s === "check" || s === "ตรวจ") return "test";
  if (s === "reply" || s === "info") return "answer";
  return null;
}

export type WaitTarget = { kind: "claude" } | { kind: "user"; id: string; name: string };

export interface Waiting {
  who: WaitTarget[];
  action: WaitAction;
  /** The status this was decided in; a stored value for another status is ignored (the status moved on). */
  status?: Status;
  /** Set by a person (or the CLI) rather than by the rules above. */
  manual?: boolean;
  at?: string;
}

/** The person who filed the task; Claude when the CLI filed it as Claude. */
export function requesterOf(task: Pick<Task, "createdBy">): WaitTarget {
  return task.createdBy.kind === "claude" ? { kind: "claude" } : { kind: "user", id: task.createdBy.id, name: task.createdBy.name };
}

/** The people doing the task: in this inbox, Claude (working for the inbox owner). */
export function doersOf(task?: unknown): WaitTarget[] {
  void task;
  return [{ kind: "claude" }];
}

export function deriveWaiting(task: Pick<Task, "status" | "createdBy">): Waiting | null {
  switch (task.status) {
    case "needs_info": return { who: [requesterOf(task)], action: "answer", status: task.status };
    case "review": return { who: [requesterOf(task)], action: "test", status: task.status };
    case "new":
    case "in_progress": return { who: doersOf(task), action: "do", status: task.status };
    default: return null;
  }
}

/** What applies now: an override set in this status, or the rules. An override with nobody means "nobody". */
export function waitingOf(task: Pick<Task, "status" | "createdBy" | "waitingOn">): Waiting | null {
  const stored = task.waitingOn;
  if (stored && stored.status === task.status) return stored.who.length ? stored : null;
  return deriveWaiting(task);
}

const targetName = (t: WaitTarget, claudeName: string) => (t.kind === "claude" ? claudeName : t.name);

/**
 * "รอ Alice ตอบ", "รอ Alice + Bob ทดสอบ", "รอ Alice (Claude) ทำ"; null when nobody is awaited.
 * `claudeName` says whose Claude has the turn (the owner's).
 */
export function waitingLabel(w: Waiting | null, claudeName = "Claude"): string | null {
  if (!w || !w.who.length) return null;
  return `รอ ${w.who.map((t) => targetName(t, claudeName)).join(" + ")} ${WAIT_ACTION_LABEL[w.action]}`;
}

/** Is it this signed-in person's turn ("รอฉัน")? Claude's turns are Claude's, not the owner's. */
export function isWaitingOn(w: Waiting | null | undefined, userId: string): boolean {
  return Boolean(w) && w!.who.some((t) => t.kind === "user" && t.id === userId);
}

/** Did this actor (a person, or Claude through the CLI) answer for one of the awaited? */
export function actorIsAwaited(w: Waiting | null, actor: Pick<Actor, "id" | "kind">, ownerId?: string | null): boolean {
  if (!w) return false;
  // Claude writes with the owner's token, so only a person-kind entry counts as the person answering.
  const ownerInPerson = actor.kind === "user" && Boolean(ownerId) && actor.id === ownerId;
  return w.who.some((t) => (t.kind === "claude" ? actor.kind === "claude" || ownerInPerson : actor.kind === "user" && t.id === actor.id));
}

const key = (list: WaitTarget[]) => list.map((t) => (t.kind === "claude" ? "claude" : t.id)).sort().join(",");
export const sameTargets = (a: WaitTarget[], b: WaitTarget[]) => key(a) === key(b);

/**
 * After a comment that did not change the status: if the awaited person wrote
 * it, the turn goes back to the people doing the task ("รอ Claude ทำ").
 * A comment from the people doing it (a progress note) changes nothing: they
 * move the turn on by changing the status or with an explicit "รอใคร".
 * Returns the new stored value, or undefined when nothing changes.
 */
export function afterComment(task: Pick<Task, "status" | "createdBy" | "waitingOn">, actor: Pick<Actor, "id" | "kind">, ownerId: string | null | undefined, at: string): Waiting | undefined {
  const w = waitingOf(task);
  if (!w || !actorIsAwaited(w, actor, ownerId)) return undefined;
  const doers = doersOf(task);
  if (sameTargets(w.who, doers)) return undefined;
  return { who: doers, action: "do", status: task.status, at };
}
