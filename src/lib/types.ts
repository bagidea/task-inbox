/**
 * Task Inbox: a team hands work to its developer (and to Claude) here instead
 * of a chat thread. A task is a markdown brief with files attached; its life
 * is a timeline of events (comments, status changes, Claude's reports).
 */

/** A system / area a task belongs to. The list is configured per deployment (`INBOX_SYSTEMS`, see `systems.ts`). */
export type System = string;
export interface SystemDef { key: string; label: string }

export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "ด่วนมาก", high: "ด่วน", normal: "ปกติ", low: "ไม่รีบ" };

/**
 * new → in_progress (Claude pulled it) → review (done, waiting for the team
 * to test) → done. needs_info: Claude or the developer has a question for the team.
 * Any status can be set by hand from the page.
 */
export const STATUSES = ["new", "in_progress", "needs_info", "review", "done", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  new: "งานใหม่",
  in_progress: "กำลังทำ",
  needs_info: "รอข้อมูลเพิ่ม",
  review: "รอทดสอบ",
  done: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};

export type Role = "admin" | "member";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
  disabled?: boolean;
  /** Set when an admin issued a temporary password; the next login must replace it. */
  mustChangePassword?: boolean;
}

export type PublicUser = Pick<User, "id" | "email" | "name" | "role" | "createdAt" | "disabled" | "mustChangePassword">;
export const publicUser = (u: User): PublicUser => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt, disabled: u.disabled, mustChangePassword: u.mustChangePassword });

/** A personal API token for the CLI / Claude. Only its hash is kept. */
export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  hash: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Object path in the file store. */
  path: string;
  uploadedBy: Actor;
  uploadedAt: string;
}

export interface Actor {
  id: string;
  name: string;
  /** "claude" when the CLI posted it on behalf of a work session. */
  kind: "user" | "claude";
}

export interface Task {
  id: string; // T-12
  number: number;
  title: string;
  systems: System[];
  priority: Priority;
  status: Status;
  /** The brief, markdown. */
  body: string;
  attachments: Attachment[];
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
  /** Last time the CLI pulled the task into a job folder. */
  pulledAt?: string;
  pulledBy?: string;
  /** Last report (summary) posted from the work session. */
  reportedAt?: string;
  /** Links the work left behind (test URL, PR, revision). */
  links: TaskLink[];
  /** Last change by a PERSON (brief, files, comment, status); Claude's own entries do not move it. Missing on old tasks → `updatedAt`. */
  teamActivityAt?: string;
  /** "ส่งให้ Claude เลย": skip the grace period (only counts when newer than `teamActivityAt`). */
  readyNowAt?: string;
  readyNowBy?: string;
  /** Computed on read (`src/lib/ready.ts`): when Claude may take this task. */
  readyAt?: string;
  /** "หยุดก่อน": the team wants Claude to stop and read the new comments before going on. */
  hold?: Hold;
}

export interface Hold { active: boolean; by: string; at: string; note?: string }

export interface TaskLink { label: string; url: string }

export type EventType = "created" | "comment" | "status" | "edit" | "file_added" | "file_removed" | "pulled" | "report" | "priority" | "ready_now" | "hold" | "resume";

export interface TaskEvent {
  id: string;
  taskId: string;
  type: EventType;
  actor: Actor;
  at: string;
  /** Markdown for comments / reports; a one-liner for the rest. */
  text?: string;
  from?: string;
  to?: string;
  links?: TaskLink[];
  files?: string[];
}

export interface TaskFilter {
  status?: Status[];
  system?: System;
  q?: string;
  limit?: number;
}
