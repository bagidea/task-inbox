/**
 * `task.md`: the task as one markdown file for the job folder Claude works
 * from (the same shape as the NewJob folders: the brief, the files beside it,
 * and the conversation so far). Pure.
 */
import { PRIORITY_LABEL, STATUS_LABEL, type Task, type TaskEvent } from "./types";

const BKK = "Asia/Bangkok";

export function fmtDate(iso: string, withTime = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = new Intl.DateTimeFormat("th-TH", { timeZone: BKK, day: "numeric", month: "short", year: "numeric" }).format(d);
  if (!withTime) return date;
  const time = new Intl.DateTimeFormat("th-TH", { timeZone: BKK, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date} ${time}`;
}

export function describeEvent(e: TaskEvent): string {
  switch (e.type) {
    case "created": return "สร้างงาน";
    case "pulled": return "ดึงงานไปทำ";
    case "status": return `สถานะ ${STATUS_LABEL[e.from as keyof typeof STATUS_LABEL] ?? e.from} → ${STATUS_LABEL[e.to as keyof typeof STATUS_LABEL] ?? e.to}`;
    case "priority": return `ความเร่งด่วน ${PRIORITY_LABEL[e.from as keyof typeof PRIORITY_LABEL] ?? e.from} → ${PRIORITY_LABEL[e.to as keyof typeof PRIORITY_LABEL] ?? e.to}`;
    case "edit": return e.text ?? "แก้ไข";
    case "file_added": return `แนบไฟล์ ${(e.files ?? []).join(", ")}`;
    case "file_removed": return `ลบไฟล์ ${(e.files ?? []).join(", ")}`;
    case "comment": return "ความเห็น";
    case "report": return "สรุปงาน";
    case "ready_now": return "ส่งให้ Claude เลย (ไม่รอช่วงพัก)";
    case "hold": return `กด "หยุดก่อน"${e.text ? ` — ${e.text}` : ""}`;
    case "resume": return `กด "ให้ทำต่อ"${e.text ? ` — ${e.text}` : ""}`;
  }
}

/** The markdown Claude reads first. `baseUrl` makes the file links absolute; `label` turns a system key into its chip text. */
export function taskMarkdown(task: Task, events: TaskEvent[], baseUrl: string, label: (key: string) => string = (k) => k): string {
  const lines: string[] = [];
  lines.push(`# ${task.id} · ${task.title}`, "");
  lines.push(`- สถานะ: ${STATUS_LABEL[task.status]}`);
  lines.push(`- ความเร่งด่วน: ${PRIORITY_LABEL[task.priority]}`);
  lines.push(`- ระบบ: ${task.systems.length ? task.systems.map(label).join(", ") : "-"}`);
  lines.push(`- ผู้สั่งงาน: ${task.createdBy.name} (${fmtDate(task.createdAt)})`);
  lines.push(`- แก้ไขล่าสุด: ${fmtDate(task.updatedAt)}`);
  lines.push(`- หน้างาน: ${baseUrl}/t/${task.id}`);
  if (task.links.length) lines.push(`- ลิงก์: ${task.links.map((l) => `[${l.label}](${l.url})`).join(" · ")}`);
  if (task.hold?.active) lines.push(`- **หยุดก่อน** โดย ${task.hold.by} (${fmtDate(task.hold.at)})${task.hold.note ? `: ${task.hold.note}` : ""} — อ่านความเห็นล่าสุดก่อนทำต่อ`);
  lines.push("", "## รายละเอียดงาน", "", task.body.trim() || "_(ไม่มีรายละเอียด)_", "");
  lines.push("## ไฟล์แนบ", "");
  if (!task.attachments.length) lines.push("_(ไม่มี)_");
  for (const a of task.attachments) lines.push(`- \`files/${a.name}\` (${fmtSize(a.size)}, ${a.uploadedBy.name}, ${fmtDate(a.uploadedAt, false)})`);
  lines.push("");
  const talk = events.filter((e) => e.type === "comment" || e.type === "report" || e.type === "status" || e.type === "priority" || e.type === "hold" || e.type === "resume");
  lines.push("## ความเห็นและสรุปที่ผ่านมา", "");
  if (!talk.length) lines.push("_(ยังไม่มี)_");
  for (const e of talk) {
    if (e.type === "comment" || e.type === "report") {
      lines.push(`### ${e.type === "report" ? "สรุปงาน" : "ความเห็น"} · ${e.actor.name} · ${fmtDate(e.at)}`, "", (e.text ?? "").trim(), "");
      if (e.links?.length) lines.push(e.links.map((l) => `- [${l.label}](${l.url})`).join("\n"), "");
    } else {
      lines.push(`- ${fmtDate(e.at)} ${e.actor.name}: ${describeEvent(e)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A folder name for the job: `2026-10-29_T-12` (date in Bangkok). */
export function jobFolderName(task: Task, now = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: BKK, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `${ymd}_${task.id}`;
}
