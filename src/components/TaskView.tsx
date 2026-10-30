"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileDrop } from "./FileDrop";
import { Avatar, CopyButton, Md, Notice, PriorityPicker, ReadinessChip, Spinner, StatusPill, SystemChips, SystemPicker, useNow } from "./bits";
import { describeEvent, fmtSize } from "@/lib/export";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type PublicUser, type Status, type System, type Task, type TaskEvent } from "@/lib/types";
import { STATUS_STYLE, api, fmtDateTime, timeAgo } from "@/lib/ui";

interface Props { initialTask: Task; initialEvents: TaskEvent[]; user: PublicUser }

export function TaskView({ initialTask, initialEvents, user }: Props) {
  const [task, setTask] = useState(initialTask);
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await api<{ task: Task; events: TaskEvent[] }>(`/api/tasks/${task.id}`);
      setTask(r.task); setEvents(r.events);
    } catch { /* keep what we have */ }
  }, [task.id]);

  useEffect(() => { const t = setInterval(reload, 20_000); return () => clearInterval(t); }, [reload]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try { await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(body) }); await reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function post(path: string, body?: Record<string, unknown>) {
    setBusy(true); setError("");
    try { await api(`/api/tasks/${task.id}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined }); await reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function hold() {
    const note = window.prompt("จะให้ Claude หยุดรอก่อน — บอกสั้น ๆ ได้ว่าจะแก้อะไร (เว้นว่างได้)", "");
    if (note === null) return;
    post("hold", { active: true, note });
  }
  const now = useNow();
  const waiting = task.status === "new" && task.readyAt ? Date.parse(task.readyAt) > now : false;

  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-mist">
        <Link href="/" className="hover:text-paper">← งานทั้งหมด</Link>
        <span>·</span>
        <span className="font-mono">{task.id}</span>
      </div>
      {error && <Notice>{error}</Notice>}

      <header className="card space-y-4 p-5">
        {editing ? (
          <EditForm task={task} busy={busy} onCancel={() => setEditing(false)} onSave={async (b) => { await patch(b); setEditing(false); }} />
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-3">
              <h1 className="display min-w-0 flex-1 text-2xl sm:text-3xl">{task.title}</h1>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>แก้ไข</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-mist">
              <StatusPill status={task.status} />
              <span className="pill bg-ink-3 text-fog">{PRIORITY_LABEL[task.priority]}</span>
              <SystemChips systems={task.systems} />
              <span>· สั่งโดย {task.createdBy.name} · {fmtDateTime(task.createdAt)}</span>
              {task.pulledAt && <span>· ดึงไปทำ {timeAgo(task.pulledAt)}</span>}
              <ReadinessChip task={task} />
            </div>
            {(task.status === "new" || task.status === "in_progress" || task.hold?.active) && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ink-3/60 px-3 py-2 text-sm">
                <span className="text-mist">Claude รับงานเอง:</span>
                {task.status === "new" && waiting && <button type="button" className="btn btn-lime btn-sm" disabled={busy} onClick={() => post("ready-now")}>ส่งให้ Claude เลย</button>}
                {task.status === "new" && !waiting && !task.hold?.active && <span className="text-mist">Claude จะดึงงานนี้ในรอบถัดไป (ทุก 10–30 นาที)</span>}
                {!task.hold?.active && (task.status === "in_progress" || task.status === "new") && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={hold}>หยุดก่อน</button>}
                {task.hold?.active && <button type="button" className="btn btn-lime btn-sm" disabled={busy} onClick={() => post("hold", { active: false })}>ให้ทำต่อ</button>}
                {task.hold?.active && <span className="text-mist">กดโดย {task.hold.by} · {fmtDateTime(task.hold.at)}{task.hold.note ? ` · ${task.hold.note}` : ""} — Claude จะไม่ deploy/ไม่ส่งสรุปจนกว่าจะกด ให้ทำต่อ</span>}
                {!task.hold?.active && task.status === "in_progress" && <span className="text-mist">กด หยุดก่อน ถ้าจะแก้โจทย์หรือเพิ่มข้อมูลระหว่างที่ Claude ทำอยู่</span>}
              </div>
            )}
            {task.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {task.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="chip hover:border-sky hover:text-sky">↗ {l.label}</a>)}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-mist">เปลี่ยนสถานะ</span>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <button key={s} type="button" disabled={busy || s === task.status} onClick={() => patch({ status: s })} className={`pill transition ${s === task.status ? STATUS_STYLE[s] : "bg-ink-3 text-mist hover:text-paper"}`}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
          </>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-5">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-mist">รายละเอียดงาน</h2>
              <div className="flex gap-1">
                <CopyButton text={task.body} label="คัดลอก md" />
                <a href={`/api/tasks/${task.id}/export`} className="btn btn-ghost btn-sm">ดาวน์โหลด task.md</a>
              </div>
            </div>
            <Md text={task.body || "_(ไม่มีรายละเอียด)_"} />
          </div>
          <Timeline task={task} events={events} onChange={reload} />
        </section>
        <aside className="space-y-5">
          <Files task={task} onChange={reload} />
          <div className="card p-4 text-xs text-mist">
            <div className="font-semibold text-fog">รับงานนี้ด้วย Claude</div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-2 font-mono text-[11px] text-fog">รับงาน {task.id} จาก task inbox</pre>
            <div className="mt-2">หรือ CLI: <code className="font-mono">task-inbox pull {task.id}</code></div>
            {isAdmin && <div className="mt-2">ตั้งค่า CLI ได้ที่หน้า <Link href="/settings" className="underline">ตั้งค่า</Link></div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function EditForm({ task, busy, onSave, onCancel }: { task: Task; busy: boolean; onSave: (b: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body);
  const [systems, setSystems] = useState<System[]>(task.systems);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [links, setLinks] = useState(task.links.map((l) => `${l.label} | ${l.url}`).join("\n"));
  const [preview, setPreview] = useState(false);
  async function loadMd(f: File | undefined) { if (f) setBody(await f.text()); }
  const parsedLinks = links.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [a, b] = line.split("|").map((s) => s.trim());
    return b ? { label: a, url: b } : { label: a, url: a };
  });
  return (
    <div className="space-y-4">
      <div><label className="label">ชื่องาน</label><input className="field text-lg" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><span className="label">ระบบ</span><SystemPicker value={systems} onChange={setSystems} /></div>
        <div><span className="label">ความเร่งด่วน</span><PriorityPicker value={priority} onChange={setPriority} /></div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label mb-0">รายละเอียด (markdown)</span>
          <div className="flex gap-2">
            <label className="btn btn-ghost btn-sm cursor-pointer">แทนที่ด้วย .md<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={(e) => { loadMd(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <button type="button" className={`btn btn-sm ${preview ? "btn-lime" : "btn-ghost"}`} onClick={() => setPreview(!preview)}>{preview ? "แก้ไข" : "ดูตัวอย่าง"}</button>
          </div>
        </div>
        {preview ? <div className="card bg-ink-3 p-4"><Md text={body} /></div> : <textarea className="field field-mono min-h-[18rem]" value={body} onChange={(e) => setBody(e.target.value)} />}
      </div>
      <div>
        <label className="label">ลิงก์ (บรรทัดละลิงก์: ชื่อ | URL)</label>
        <textarea className="field field-mono min-h-[4rem]" value={links} onChange={(e) => setLinks(e.target.value)} placeholder={"ลิงก์ทดสอบ | https://…"} />
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-lime" disabled={busy || !title.trim()} onClick={() => onSave({ title, body, systems, priority, links: parsedLinks })}>{busy ? <Spinner /> : "บันทึก"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>ยกเลิก</button>
      </div>
    </div>
  );
}

function Files({ task, onChange }: { task: Task; onChange: () => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload() {
    if (!files.length) return;
    setBusy(true); setError("");
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      await api(`/api/tasks/${task.id}/files`, { method: "POST", body: form });
      setFiles([]);
      await onChange();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(id: string, name: string) {
    if (!window.confirm(`ลบไฟล์ ${name}?`)) return;
    setBusy(true); setError("");
    try { await api(`/api/tasks/${task.id}/files/${id}`, { method: "DELETE" }); await onChange(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-mist">ไฟล์แนบ ({task.attachments.length})</h2>
      {error && <Notice>{error}</Notice>}
      {task.attachments.length === 0 && <div className="text-sm text-mist">ยังไม่มีไฟล์</div>}
      <ul className="space-y-1.5">
        {task.attachments.map((a) => (
          <li key={a.id} className="group flex items-center gap-2 rounded-lg bg-ink-3 px-3 py-2 text-sm">
            {a.type.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/tasks/${task.id}/files/${a.id}`} alt="" className="size-9 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-ink text-[10px] font-bold uppercase text-mist">{ext(a.name)}</span>
            )}
            <a href={`/api/tasks/${task.id}/files/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
              <div className="truncate hover:text-lime">{a.name}</div>
              <div className="text-[11px] text-mist">{fmtSize(a.size)} · {a.uploadedBy.name}</div>
            </a>
            <button type="button" disabled={busy} onClick={() => remove(a.id, a.name)} className="text-xs text-mist hover:text-coral">ลบ</button>
          </li>
        ))}
      </ul>
      <FileDrop files={files} onChange={setFiles} hint="เพิ่มไฟล์: ลากมาวาง หรือแตะเลือก" />
      {files.length > 0 && <button type="button" className="btn btn-lime btn-sm w-full" disabled={busy} onClick={upload}>{busy ? <Spinner /> : `อัปโหลด ${files.length} ไฟล์`}</button>}
    </div>
  );
}

const ext = (name: string) => (name.split(".").pop() || "").slice(0, 4) || "file";

function Timeline({ task, events, onChange }: { task: Task; events: TaskEvent[]; onChange: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(status?: Status) {
    if (!text.trim()) return;
    setBusy(true); setError("");
    try { await api(`/api/tasks/${task.id}/comments`, { method: "POST", body: JSON.stringify({ text, status }) }); setText(""); await onChange(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const latestReport = [...events].reverse().find((e) => e.type === "report");
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist">ไทม์ไลน์</h2>
        {latestReport && <CopyButton text={reportForLine(task, latestReport)} label="คัดลอกสรุปล่าสุดไปวาง LINE" className="btn btn-ghost btn-sm" />}
      </div>
      <ol className="space-y-4">
        {events.map((e) => <EventRow key={e.id} e={e} task={task} />)}
      </ol>
      <div className="mt-5 space-y-2 border-t border-line pt-4">
        {error && <Notice>{error}</Notice>}
        <textarea className="field min-h-[5rem]" placeholder="เขียนความเห็น ตอบคำถาม หรือเพิ่มรายละเอียด (markdown ได้)" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-lime btn-sm" disabled={busy || !text.trim()} onClick={() => send()}>{busy ? <Spinner /> : "ส่งความเห็น"}</button>
          {task.status === "needs_info" && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !text.trim()} onClick={() => send("new")}>ตอบแล้ว → กลับเป็นงานใหม่</button>}
          {task.status === "review" && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !text.trim()} onClick={() => send("done")}>ทดสอบผ่าน → เสร็จแล้ว</button>}
          {task.status === "review" && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !text.trim()} onClick={() => send("new")}>ยังไม่ผ่าน → ส่งกลับไปแก้</button>}
        </div>
      </div>
    </div>
  );
}

function EventRow({ e, task }: { e: TaskEvent; task: Task }) {
  const rich = e.type === "comment" || e.type === "report";
  return (
    <li className="relative flex gap-3">
      <Avatar name={e.actor.name} kind={e.actor.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">{e.actor.name}</span>
          {!rich && <span className={e.type === "hold" ? "text-coral" : e.type === "resume" || e.type === "ready_now" ? "text-violet" : "text-mist"}>{describeEvent(e)}</span>}
          {e.type === "report" && <span className="pill bg-violet/15 text-violet">สรุปงาน</span>}
          <span className="text-xs text-mist">{fmtDateTime(e.at)}</span>
        </div>
        {rich && (
          <div className={`mt-2 rounded-xl border p-3 ${e.type === "report" ? "border-violet/30 bg-violet/5" : "border-line bg-ink-3"}`}>
            <Md text={e.text ?? ""} />
            {e.links && e.links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">{e.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="chip hover:border-sky hover:text-sky">↗ {l.label}</a>)}</div>
            )}
            {e.type === "report" && <div className="mt-3"><CopyButton text={reportForLine(task, e)} label="คัดลอกไปวาง LINE" /></div>}
          </div>
        )}
      </div>
    </li>
  );
}

/** What goes into the team chat: the title, the summary, the links. Plain text, no markdown noise. */
export function reportForLine(task: Task, e: TaskEvent): string {
  const lines = [`[${task.id}] ${task.title}`, "", (e.text ?? "").trim()];
  if (e.links?.length) lines.push("", ...e.links.map((l) => `${l.label}: ${l.url}`));
  return lines.join("\n");
}
