/**
 * The task service: everything a page or the CLI can do to a task goes
 * through here, so the timeline is always written alongside the change.
 */
import { newId } from "./auth";
import { getFiles, objectPath, safeFileName } from "./files";
import { DEFAULT_GRACE_MINUTES, isHeld, isReady, normaliseGrace, sortReady, withReadiness, type InboxSettings } from "./ready";
import { getStore } from "./store";
import type { Store } from "./store";
import { systemKeys } from "./systems";
import { PRIORITIES, STATUSES, type Actor, type Attachment, type Hold, type Priority, type Status, type System, type Task, type TaskEvent, type TaskFilter, type TaskLink } from "./types";

export class TaskError extends Error {
  constructor(public readonly status: number, message: string, public readonly extra: Record<string, unknown> = {}) { super(message); }
}

/** The team pressed "หยุดก่อน": Claude's writes are refused until they press "ให้ทำต่อ" (or the caller forces). */
export class OnHoldError extends TaskError {
  constructor(hold: Hold) {
    super(409, "on-hold", { hold, message: `ทีมกด "หยุดก่อน" ไว้ (${hold.by}${hold.note ? `: ${hold.note}` : ""}) — อ่านความเห็นใหม่ในหน้างานก่อน` });
  }
}

export const isStatus = (s: unknown): s is Status => typeof s === "string" && (STATUSES as readonly string[]).includes(s);
export const isPriority = (s: unknown): s is Priority => typeof s === "string" && (PRIORITIES as readonly string[]).includes(s);
export const isSystem = (s: unknown): s is System => typeof s === "string" && systemKeys().includes(s);

export function parseSystems(v: unknown): System[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter(isSystem))];
}

export function parseLinks(v: unknown): TaskLink[] {
  if (!Array.isArray(v)) return [];
  const out: TaskLink[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const { label, url } = item as { label?: unknown; url?: unknown };
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) continue;
    out.push({ label: typeof label === "string" && label.trim() ? label.trim().slice(0, 80) : url, url: url.slice(0, 2000) });
  }
  return out.slice(0, 20);
}

export interface NewTask { title: string; body: string; systems: System[]; priority: Priority; status?: Status }

export class TaskService {
  constructor(private readonly store: Store = getStore(), private readonly now: () => string = () => new Date().toISOString()) {}

  private async event(e: Omit<TaskEvent, "id" | "at">): Promise<TaskEvent> {
    const full: TaskEvent = { id: newId(6), at: this.now(), ...e };
    await this.store.addEvent(full);
    return full;
  }

  /** A person changed the task: the grace period starts over. Claude's own entries leave it alone. */
  private touch(task: Task, actor: Actor, at = this.now()): void {
    task.updatedAt = at;
    if (actor.kind === "user") task.teamActivityAt = at;
  }

  /** Claude may not write to a held task unless the caller forces it; people always may. */
  private guard(task: Task, actor: Actor, force: boolean): void {
    if (actor.kind === "claude" && !force && task.hold?.active) throw new OnHoldError(task.hold);
  }

  async settings(): Promise<InboxSettings> {
    const s = await this.store.getSettings();
    return { graceMinutes: s?.graceMinutes === undefined ? DEFAULT_GRACE_MINUTES : normaliseGrace(s.graceMinutes) };
  }

  async saveSettings(patch: Partial<InboxSettings>): Promise<InboxSettings> {
    const cur = await this.settings();
    const next: InboxSettings = { graceMinutes: patch.graceMinutes === undefined ? cur.graceMinutes : normaliseGrace(patch.graceMinutes) };
    await this.store.saveSettings(next);
    return next;
  }

  private async decorate<T extends Task>(task: T): Promise<T> { return withReadiness(task, (await this.settings()).graceMinutes); }

  async create(input: NewTask, actor: Actor): Promise<Task> {
    const title = input.title.trim();
    if (!title) throw new TaskError(400, "ต้องมีชื่องาน");
    if (title.length > 200) throw new TaskError(400, "ชื่องานยาวเกินไป (200 ตัวอักษร)");
    if (input.body.length > 200_000) throw new TaskError(400, "รายละเอียดยาวเกินไป");
    const number = await this.store.nextTaskNumber();
    const at = this.now();
    const task: Task = {
      id: `T-${number}`,
      number,
      title,
      systems: input.systems,
      priority: input.priority,
      status: input.status ?? "new",
      body: input.body,
      attachments: [],
      createdBy: actor,
      createdAt: at,
      updatedAt: at,
      ...(actor.kind === "user" ? { teamActivityAt: at } : {}),
      links: [],
    };
    await this.store.saveTask(task);
    await this.event({ taskId: task.id, type: "created", actor, text: "สร้างงาน" });
    return this.decorate(task);
  }

  /** The stored task plus its computed `readyAt`. */
  async get(id: string): Promise<Task> {
    const t = await this.store.getTask(id.toUpperCase());
    if (!t) throw new TaskError(404, `ไม่พบงาน ${id}`);
    return this.decorate(t);
  }

  async list(filter: TaskFilter): Promise<Task[]> {
    const grace = (await this.settings()).graceMinutes;
    return (await this.store.listTasks(filter)).map((t) => withReadiness(t, grace));
  }

  /** New tasks Claude may take right now, most urgent first (`GET /api/tasks?ready=1`, `task-inbox list --ready`). */
  async listReady(now = Date.parse(this.now())): Promise<Task[]> {
    const grace = (await this.settings()).graceMinutes;
    const fresh = await this.store.listTasks({ status: ["new"] });
    return sortReady(fresh.filter((t) => isReady(t, grace, now)), grace).map((t) => withReadiness(t, grace));
  }

  events(taskId: string) { return this.store.listEvents(taskId); }

  /** Title / body / systems / priority / status; each change that matters gets its own line in the timeline. */
  async update(id: string, patch: Partial<NewTask> & { links?: TaskLink[] }, actor: Actor, opts: { force?: boolean } = {}): Promise<Task> {
    const task = await this.get(id);
    if (patch.status !== undefined && patch.status !== task.status) this.guard(task, actor, Boolean(opts.force));
    const changed: string[] = [];
    if (patch.title !== undefined && patch.title.trim() !== task.title) {
      if (!patch.title.trim()) throw new TaskError(400, "ต้องมีชื่องาน");
      task.title = patch.title.trim().slice(0, 200); changed.push("ชื่องาน");
    }
    if (patch.body !== undefined && patch.body !== task.body) {
      if (patch.body.length > 200_000) throw new TaskError(400, "รายละเอียดยาวเกินไป");
      task.body = patch.body; changed.push("รายละเอียด");
    }
    if (patch.systems !== undefined && patch.systems.join() !== task.systems.join()) { task.systems = patch.systems; changed.push("ระบบ"); }
    if (patch.links !== undefined) { task.links = patch.links; changed.push("ลิงก์"); }
    if (patch.priority !== undefined && patch.priority !== task.priority) {
      await this.event({ taskId: task.id, type: "priority", actor, from: task.priority, to: patch.priority });
      task.priority = patch.priority;
    }
    if (patch.status !== undefined && patch.status !== task.status) {
      await this.event({ taskId: task.id, type: "status", actor, from: task.status, to: patch.status });
      task.status = patch.status;
      this.releaseHold(task, actor);
    }
    if (changed.length) await this.event({ taskId: task.id, type: "edit", actor, text: `แก้ไข ${changed.join(", ")}` });
    this.touch(task, actor);
    await this.store.saveTask(task);
    return this.decorate(task);
  }

  /** A person who changes the status has decided what happens next: the hold has done its job. */
  private releaseHold(task: Task, actor: Actor): void {
    if (actor.kind === "user" && task.hold?.active) task.hold = { ...task.hold, active: false };
  }

  async comment(id: string, text: string, actor: Actor, status?: Status, opts: { force?: boolean } = {}): Promise<TaskEvent> {
    const task = await this.get(id);
    this.guard(task, actor, Boolean(opts.force));
    if (!text.trim()) throw new TaskError(400, "ข้อความว่าง");
    if (text.length > 100_000) throw new TaskError(400, "ข้อความยาวเกินไป");
    const ev = await this.event({ taskId: task.id, type: "comment", actor, text: text.trim() });
    if (status && status !== task.status) {
      await this.event({ taskId: task.id, type: "status", actor, from: task.status, to: status });
      task.status = status;
      this.releaseHold(task, actor);
    }
    this.touch(task, actor);
    await this.store.saveTask(task);
    return ev;
  }

  /** The CLI pulled the task into a job folder: it is being worked on. Allowed on a held task (the caller sees the hold and stops). */
  async pull(id: string, actor: Actor): Promise<Task> {
    const task = await this.get(id);
    await this.event({ taskId: task.id, type: "pulled", actor, text: "ดึงงานไปทำแล้ว" });
    if (task.status === "new" || task.status === "needs_info") {
      await this.event({ taskId: task.id, type: "status", actor, from: task.status, to: "in_progress" });
      task.status = "in_progress";
    }
    task.pulledAt = this.now();
    task.pulledBy = actor.name;
    this.touch(task, actor, task.pulledAt);
    await this.store.saveTask(task);
    return this.decorate(task);
  }

  /** "ส่งให้ Claude เลย": a new task may be taken without waiting out the grace period. */
  async readyNow(id: string, actor: Actor): Promise<Task> {
    const task = await this.get(id);
    if (task.status !== "new") throw new TaskError(400, "ส่งให้ Claude ได้เฉพาะงานสถานะ งานใหม่");
    task.readyNowAt = this.now();
    task.readyNowBy = actor.name;
    task.updatedAt = task.readyNowAt;
    await this.store.saveTask(task);
    await this.event({ taskId: task.id, type: "ready_now", actor, text: "ส่งให้ Claude เลย ไม่ต้องรอช่วงพัก" });
    return this.decorate(task);
  }

  /** "หยุดก่อน" / "ให้ทำต่อ": pause Claude on a task it is working on (or about to take). */
  async setHold(id: string, active: boolean, actor: Actor, note?: string): Promise<Task> {
    const task = await this.get(id);
    const at = this.now();
    const clean = (note ?? "").trim().slice(0, 300);
    if (active) {
      task.hold = { active: true, by: actor.name, at, ...(clean ? { note: clean } : {}) };
      await this.event({ taskId: task.id, type: "hold", actor, text: clean || undefined });
    } else {
      if (!isHeld(task)) return this.decorate(task);
      task.hold = { ...task.hold!, active: false };
      await this.event({ taskId: task.id, type: "resume", actor, text: clean || undefined });
    }
    this.touch(task, actor, at);
    await this.store.saveTask(task);
    return this.decorate(task);
  }

  /** The summary from the work session, with its links; the status usually moves to review (or needs_info for questions). */
  async report(id: string, text: string, actor: Actor, opts: { status?: Status; links?: TaskLink[]; force?: boolean } = {}): Promise<TaskEvent> {
    const task = await this.get(id);
    this.guard(task, actor, Boolean(opts.force));
    if (!text.trim()) throw new TaskError(400, "สรุปว่าง");
    if (text.length > 200_000) throw new TaskError(400, "สรุปยาวเกินไป");
    const links = opts.links ?? [];
    const ev = await this.event({ taskId: task.id, type: "report", actor, text: text.trim(), links });
    if (links.length) {
      const known = new Set(task.links.map((l) => l.url));
      task.links = [...task.links, ...links.filter((l) => !known.has(l.url))].slice(-20);
    }
    const status = opts.status ?? "review";
    if (status !== task.status) {
      await this.event({ taskId: task.id, type: "status", actor, from: task.status, to: status });
      task.status = status;
    }
    task.reportedAt = this.now();
    this.touch(task, actor, task.reportedAt);
    await this.store.saveTask(task);
    return ev;
  }

  async addFile(id: string, file: { name: string; type: string; bytes: Uint8Array }, actor: Actor): Promise<Attachment> {
    const task = await this.get(id);
    if (task.attachments.length >= 50) throw new TaskError(400, "ไฟล์แนบได้ไม่เกิน 50 ไฟล์ต่องาน");
    const att: Attachment = {
      id: newId(5),
      name: safeFileName(file.name),
      size: file.bytes.byteLength,
      type: file.type || "application/octet-stream",
      path: "",
      uploadedBy: actor,
      uploadedAt: this.now(),
    };
    att.path = objectPath(task.id, att.id, att.name);
    await getFiles().put(att.path, file.bytes, att.type);
    task.attachments = [...task.attachments, att];
    this.touch(task, actor, att.uploadedAt);
    await this.store.saveTask(task);
    await this.event({ taskId: task.id, type: "file_added", actor, files: [att.name] });
    return att;
  }

  async removeFile(id: string, attachmentId: string, actor: Actor): Promise<void> {
    const task = await this.get(id);
    const att = task.attachments.find((a) => a.id === attachmentId);
    if (!att) throw new TaskError(404, "ไม่พบไฟล์");
    await getFiles().remove(att.path);
    task.attachments = task.attachments.filter((a) => a.id !== attachmentId);
    this.touch(task, actor);
    await this.store.saveTask(task);
    await this.event({ taskId: task.id, type: "file_removed", actor, files: [att.name] });
  }

  async file(id: string, attachmentId: string): Promise<{ attachment: Attachment; stream: ReadableStream }> {
    const task = await this.get(id);
    const attachment = task.attachments.find((a) => a.id === attachmentId);
    if (!attachment) throw new TaskError(404, "ไม่พบไฟล์");
    const stream = await getFiles().get(attachment.path);
    if (!stream) throw new TaskError(404, "ไฟล์หายไปจากที่เก็บ");
    return { attachment, stream };
  }
}

let service: TaskService | null = null;
export const tasks = () => (service ??= new TaskService());
