"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PriorityPill, ReadinessChip, StatusPill, SystemChips, WaitingChip, useNow } from "./bits";
import { useInboxConfig } from "./config";
import { STATUS_LABEL, type PublicUser, type Status, type System, type Task } from "@/lib/types";
import { claudeIsStale } from "@/lib/ready";
import { isWaitingOn } from "@/lib/waiting";
import { api, timeAgo } from "@/lib/ui";

const TABS: { key: string; label: string; statuses: Status[] }[] = [
  { key: "open", label: "ค้างอยู่", statuses: ["new", "in_progress", "needs_info", "review"] },
  { key: "new", label: STATUS_LABEL.new, statuses: ["new"] },
  { key: "needs_info", label: STATUS_LABEL.needs_info, statuses: ["needs_info"] },
  { key: "review", label: STATUS_LABEL.review, statuses: ["review"] },
  { key: "done", label: STATUS_LABEL.done, statuses: ["done", "cancelled"] },
  { key: "all", label: "ทั้งหมด", statuses: [] },
];

const MINE_KEY = "inbox-wait-me";

export function Board({ initialTasks, user }: { initialTasks: Task[]; user: PublicUser }) {
  const { systems: systemDefs } = useInboxConfig();
  const [tasks, setTasks] = useState(initialTasks);
  const [tab, setTab] = useState("open");
  const [system, setSystem] = useState<System | "">("");
  const [q, setQ] = useState("");
  const [waitMe, setWaitMe] = useState(false);
  const [claude, setClaude] = useState<{ name: string; polledAt?: string } | null>(null);
  const now = useNow();
  const stale = claudeIsStale(claude?.polledAt, now);

  useEffect(() => {
    const load = () => { api<{ claude: { name: string; polledAt?: string } }>("/api/settings").then((r) => setClaude(r.claude)).catch(() => {}); };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // The saved choice is applied after hydration on purpose (the server renders "all").
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setWaitMe(window.localStorage.getItem(MINE_KEY) === "1"); } catch { /* private mode */ }
  }, []);
  const pickWaitMe = (on: boolean) => { setWaitMe(on); try { window.localStorage.setItem(MINE_KEY, on ? "1" : "0"); } catch { /* ignore */ } };
  const myTurn = useMemo(() => tasks.filter((t) => isWaitingOn(t.waiting, user.id)).length, [tasks, user.id]);

  useEffect(() => {
    const t = setInterval(() => { api<{ tasks: Task[] }>("/api/tasks?limit=500").then((r) => setTasks(r.tasks)).catch(() => {}); }, 30_000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    const pool = waitMe ? tasks.filter((x) => isWaitingOn(x.waiting, user.id)) : tasks;
    for (const t of TABS) c[t.key] = t.statuses.length ? pool.filter((x) => t.statuses.includes(x.status)).length : pool.length;
    return c;
  }, [tasks, waitMe, user.id]);

  const shown = useMemo(() => {
    const statuses = TABS.find((t) => t.key === tab)?.statuses ?? [];
    const needle = q.trim().toLowerCase();
    return tasks
      .filter((t) => (!statuses.length || statuses.includes(t.status)) && (!waitMe || isWaitingOn(t.waiting, user.id)) && (!system || t.systems.includes(system)) && (!needle || t.id.toLowerCase().includes(needle) || t.title.toLowerCase().includes(needle) || t.createdBy.name.toLowerCase().includes(needle)))
      .sort((a, b) => Number(isWaitingOn(b.waiting, user.id)) - Number(isWaitingOn(a.waiting, user.id)) || rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
  }, [tasks, tab, system, q, waitMe, user.id]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl">งาน</h1>
          <p className="mt-1 text-sm text-mist">{counts.open} งานค้างอยู่ · {counts.new} งานใหม่ · {counts.needs_info} รอข้อมูล</p>
          {claude?.polledAt && (
            <p className={`mt-1 text-xs ${stale ? "font-semibold text-amber" : "text-mist"}`} data-testid="claude-poll" suppressHydrationWarning>
              {stale ? "⚠ " : ""}{claude.name} เช็กงานล่าสุด {timeAgo(claude.polledAt, now)}{stale ? " · ลูปน่าจะหยุดอยู่ งานใหม่จะยังไม่มีใครรับ" : ""}
            </p>
          )}
          {myTurn > 0 && !waitMe && <button type="button" onClick={() => pickWaitMe(true)} className="wait-me pill mt-2">ถึงตาคุณ {myTurn} งาน → ดู</button>}
        </div>
        <div className="hidden sm:block"><Link href="/new" className="btn btn-lime">+ สร้างงาน</Link></div>
      </div>

      <div className="scroll-x flex gap-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`tab ${tab === t.key ? "tab-on" : ""}`}>
            {t.label} <span className="ml-1 opacity-60">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="scroll-x flex items-center gap-1.5">
        <span className="shrink-0 text-xs text-mist">ใคร:</span>
        <button type="button" onClick={() => pickWaitMe(false)} className={`chip ${!waitMe ? "chip-on" : ""}`}>ทุกคน</button>
        <button type="button" onClick={() => pickWaitMe(true)} className={`chip ${waitMe ? "chip-on" : ""}`}>รอฉัน{myTurn ? ` ${myTurn}` : ""}</button>
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <input className="field min-w-0 sm:max-w-xs" placeholder="ค้นหา: ชื่องาน, T-12, ผู้สั่ง" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="scroll-x flex min-w-0 gap-1.5">
          <button type="button" onClick={() => setSystem("")} className={`chip ${system === "" ? "chip-on" : ""}`}>ทุกระบบ</button>
          {systemDefs.map((s) => (
            <button key={s.key} type="button" onClick={() => setSystem(system === s.key ? "" : s.key)} className={`chip ${system === s.key ? "chip-on" : ""}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card p-10 text-center text-mist">
          {waitMe ? "ไม่มีงานที่รอคุณอยู่ 🎉" : "ไม่มีงานในมุมมองนี้"}
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
                    <div className="flex min-w-0 items-start gap-2">
                      <h2 className="line-clamp-2 min-w-0 flex-1 break-words font-semibold">{t.title}</h2>
                      <PriorityPill priority={t.priority} />
                    </div>
                    {t.waitingLabel && <div className="mt-2"><WaitingChip task={t} meId={user.id} /></div>}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mist">
                      <StatusPill status={t.status} />
                      <ReadinessChip task={t} compact />
                      <SystemChips systems={t.systems} />
                      <span>· {t.createdBy.name}</span>
                      {t.attachments.length > 0 && <span>· {t.attachments.length} ไฟล์</span>}
                      <span className="ml-auto whitespace-nowrap">{timeAgo(t.updatedAt)}</span>
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
