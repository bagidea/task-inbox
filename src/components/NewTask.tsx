"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FileDrop } from "./FileDrop";
import { Md, Notice, PriorityPicker, Spinner, SystemPicker } from "./bits";
import type { Priority, System, Task } from "@/lib/types";
import { api } from "@/lib/ui";

const TEMPLATE = `## สิ่งที่ต้องการ

-

## ทำไม / บริบท



## ไฟล์ที่แนบ

-
`;

export function NewTask() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [systems, setSystems] = useState<System[]>([]);
  const [priority, setPriority] = useState<Priority>("normal");
  const [body, setBody] = useState(TEMPLATE);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadMd(f: File | undefined) {
    if (!f) return;
    setBody(await f.text());
    if (!title) setTitle(f.name.replace(/\.md$/i, ""));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.set("title", title); form.set("body", body); form.set("priority", priority);
      for (const s of systems) form.append("systems", s);
      for (const f of files) form.append("files", f);
      const r = await api<{ task: Task }>("/api/tasks", { method: "POST", body: form });
      router.push(`/t/${r.task.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="display text-3xl">สร้างงาน</h1>
        <p className="mt-1 text-sm text-mist">เขียนเป็น markdown หรืออัปโหลดไฟล์ .md แล้วแนบรูป/ไฟล์ได้เลย แก้ไขได้ทุกเมื่อหลังสร้าง</p>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="card space-y-5 p-5">
        <div>
          <label className="label" htmlFor="title">ชื่องาน</label>
          <input id="title" className="field text-lg" placeholder="เช่น Custom Lab: เพิ่มช่องเลือกสีด้าย" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div><span className="label">ระบบที่เกี่ยวข้อง</span><SystemPicker value={systems} onChange={setSystems} /></div>
          <div><span className="label">ความเร่งด่วน</span><PriorityPicker value={priority} onChange={setPriority} /></div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0" htmlFor="body">รายละเอียด (markdown)</label>
            <div className="flex items-center gap-2">
              <label className="btn btn-ghost btn-sm cursor-pointer">
                อัปโหลด .md
                <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={(e) => { loadMd(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <button type="button" className={`btn btn-sm ${preview ? "btn-lime" : "btn-ghost"}`} onClick={() => setPreview(!preview)}>{preview ? "แก้ไข" : "ดูตัวอย่าง"}</button>
            </div>
          </div>
          {preview ? <div className="card bg-ink-3 p-4"><Md text={body} /></div> : <textarea id="body" className="field field-mono min-h-[18rem]" value={body} onChange={(e) => setBody(e.target.value)} />}
        </div>
        <div>
          <span className="label">ไฟล์แนบ</span>
          <FileDrop files={files} onChange={setFiles} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn btn-lime" disabled={busy || !title.trim()}>{busy ? <Spinner /> : "สร้างงาน"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()} disabled={busy}>ยกเลิก</button>
      </div>
    </form>
  );
}
