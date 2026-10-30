"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PriorityPill, ReadinessChip, StatusPill, SystemChips } from "./bits";
import { useInboxConfig } from "./config";
import { STATUS_LABEL, type Status, type System, type Task } from "@/lib/types";
import { api, timeAgo } from "@/lib/ui";

const TABS: { key: string; label: string; statuses: Status[] }[] = [
  { key: "open", label: "ค้างอยู่", statuses: ["new", "in_progress", "needs_info", "review"] },
  { key: "new", label: STATUS_LABEL.new, statuses: ["new"] },
  { key: "needs_info", label: STATUS_LABEL.needs_info, statuses: ["needs_info"] },
  { key: "review", label: STATUS_LABEL.review, statuses: ["review"] },
  { key: "done", label: STATUS_LABEL.done, statuses: ["done", "cancelled"] },
  { key: "all", label: "ทั้งหมด", statuses: [] },
];

export function Board({ initialTasks }: { initialTasks: Task[] }) {
  const { systems: systemDefs } = useInboxConfig();
  const [tasks, setTasks] = useState(initialTasks);
  const [tab, setTab] = useState("open");
  const [system, setSystem] = useState<System | "">("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setInterval(() => { api<{ tasks: Task[] }>("/api/tasks?limit=500").then((r) => setTasks(r.tasks)).catch(() => {}); }, 30_000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of TABS) c[t.key] = t.statuses.length ? tasks.filter((x) => t.statuses.includes(x.status)).length : tasks.length;
    return c;
  }, [tasks]);

  const shown = useMemo(() => {
    const statuses = TABS.find((t) => t.key === tab)?.statuses ?? [];
    const needle = q.trim().toLowerCase();
    return tasks
      .filter((t) => (!statuses.length || statuses.includes(t.status)) && (!system || t.systems.includes(system)) && (!needle || t.id.toLowerCase().includes(needle) || t.title.toLowerCase().includes(needle) || t.createdBy.name.toLowerCase().includes(needle)))
      .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
  }, [tasks, tab, system, q]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl">งาน</h1>
          <p className="mt-1 text-sm text-mist">{counts.open} งานค้างอยู่ · {counts.new} งานใหม่ · {counts.needs_info} รอข้อมูล</p>
        </div>
        <Link href="/new" className="btn btn-lime hidden sm:inline-flex">+ สร้างงาน</Link>
      </div>

      <div className="scroll-x -mx-4 flex gap-1 px-4">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`tab ${tab === t.key ? "tab-on" : ""}`}>
            {t.label} <span className="ml-1 opacity-60">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="field sm:max-w-xs" placeholder="ค้นหา: ชื่องาน, T-12, ผู้สั่ง" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="scroll-x flex gap-1.5">
          <button type="button" onClick={() => setSystem("")} className={`chip ${system === "" ? "chip-on" : ""}`}>ทุกระบบ</button>
          {systemDefs.map((s) => (
            <button key={s.key} type="button" onClick={() => setSystem(system === s.key ? "" : s.key)} className={`chip ${system === s.key ? "chip-on" : ""}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card p-10 text-center text-mist">
          ไม่มีงานในมุมมองนี้
          <div className="mt-3"><Link href="/new" className="btn btn-ghost btn-sm">สร้างงานแรก</Link></div>
        </div>
      ) : (
        <ul className="grid gap-2">
          {shown.map((t) => (
            <li key={t.id} className="rise">
              <Link href={`/t/${t.id}`} className="card card-hover block p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-mist">{t.id}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{t.title}</h2>
                      <PriorityPill priority={t.priority} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mist">
                      <StatusPill status={t.status} />
                      <ReadinessChip task={t} compact />
                      <SystemChips systems={t.systems} />
                      <span>· {t.createdBy.name}</span>
                      {t.attachments.length > 0 && <span>· {t.attachments.length} ไฟล์</span>}
                      <span className="ml-auto">{timeAgo(t.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
const STATUS_RANK: Record<Status, number> = { needs_info: 0, new: 1, in_progress: 2, review: 3, done: 4, cancelled: 5 };
const rank = (t: Task) => STATUS_RANK[t.status] * 10 + PRIORITY_RANK[t.priority];
