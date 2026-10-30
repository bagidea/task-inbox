#!/usr/bin/env node
/**
 * task-inbox: a Task Inbox from a terminal (and from Claude Code).
 * Zero dependencies, Node 18+. Config in ~/.task-inbox.json.
 *
 *   task-inbox config --url https://… --token tin_… [--jobs DIR]
 *   task-inbox list [--status open|new,needs_info|all] [--system web] [--ready] [--json]
 *   task-inbox show T-12 [--json]
 *   task-inbox pull T-12|next [--ready] [--out DIR]   → job folder with task.md + files/ (next --ready: most urgent task Claude may take now; exit 2 when none)
 *   task-inbox hold T-12                          → {active,by,at,note} — did the team press "หยุดก่อน"?
 *   task-inbox create --title "…" (--body-file brief.md | --body "…") [--systems web,backend] [--priority urgent|high|normal|low] [--files a.png b.zip]
 *   task-inbox comment T-12 (--text "…" | --file note.md) [--status new|…]
 *   task-inbox report T-12 (--text "…" | --file summary.md) [--status review|needs_info|done] [--link "ชื่อ=https://…"]…
 *   task-inbox status T-12 review
 *   task-inbox upload T-12 file1 file2 …
 *   task-inbox rm-file T-12 <attachmentId>
 *
 * --as-claude (or TASK_INBOX_ACTOR=claude) marks comments / reports / pulls as Claude's in the timeline.
 * While the team's "หยุดก่อน" is on, report / comment / status as Claude exit 3 (409 on-hold); --force overrides.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const CONFIG = join(homedir(), ".task-inbox.json");
const STATUSES = ["new", "in_progress", "needs_info", "review", "done", "cancelled"];
const STATUS_TH = { new: "งานใหม่", in_progress: "กำลังทำ", needs_info: "รอข้อมูลเพิ่ม", review: "รอทดสอบ", done: "เสร็จแล้ว", cancelled: "ยกเลิก" };
const PRIORITY_TH = { urgent: "ด่วนมาก", high: "ด่วน", normal: "ปกติ", low: "ไม่รีบ" };

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (key === "json" || key === "as-claude" || key === "open" || key === "quiet" || key === "ready" || key === "force") { opt[key] = true; continue; }
      if (next === undefined || next.startsWith("--")) { opt[key] = true; continue; }
      if (key === "link" || key === "files") { (opt[key] ??= []).push(next); } else { opt[key] = next; }
      i++;
    } else pos.push(a);
  }
  return { pos, opt };
}

function loadConfig() {
  if (!existsSync(CONFIG)) return {};
  try { return JSON.parse(readFileSync(CONFIG, "utf8")); } catch { return {}; }
}

function need(cfg) {
  const url = process.env.TASK_INBOX_URL || cfg.url;
  const token = process.env.TASK_INBOX_TOKEN || cfg.token;
  if (!url || !token) die("ยังไม่ได้ตั้งค่า: รัน  task-inbox config --url <URL> --token <token>  (สร้าง token ได้ที่หน้า ตั้งค่า ของ Task Inbox)");
  return { url: url.replace(/\/+$/, ""), token };
}

function die(msg, code = 1) { console.error(msg); process.exit(code); }

async function call(cfg, path, { method = "GET", body, form, asClaude, force } = {}) {
  const headers = { authorization: `Bearer ${cfg.token}`, accept: "application/json" };
  if (asClaude) headers["x-actor"] = "claude";
  if (body !== undefined) headers["content-type"] = "application/json";
  if (force) path += (path.includes("?") ? "&" : "?") + "force=1";
  const res = await fetch(`${cfg.url}${path}`, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (res.status === 409 && data.error === "on-hold") {
    const h = data.hold || {};
    die(`หยุดก่อน: ทีม (${h.by || "?"}) กด "หยุดก่อน" ไว้ที่งานนี้เมื่อ ${h.at ? fmt(h.at) : "?"}${h.note ? ` — "${h.note}"` : ""}\nอ่านความเห็นใหม่ในหน้างานก่อน (show <id>) แล้วค่อยส่งต่อ หรือใส่ --force ถ้าทีมบอกให้ทำต่อแล้ว`, 3);
  }
  if (!res.ok) die(`${method} ${path} → ${res.status}: ${data.error || text.slice(0, 300)}`);
  return data;
}

const holdLine = (task) => (task.hold?.active ? `hold: ${JSON.stringify(task.hold)}` : "hold: none");

const readText = (file) => readFileSync(resolve(file), "utf8");
const isClaude = (opt) => Boolean(opt["as-claude"]) || (process.env.TASK_INBOX_ACTOR || "").toLowerCase() === "claude";

function statusList(s) {
  if (!s || s === "open") return ["new", "in_progress", "needs_info", "review"];
  if (s === "all") return [];
  const list = s.split(",").map((x) => x.trim()).filter((x) => STATUSES.includes(x));
  if (!list.length) die(`สถานะไม่ถูกต้อง: ${s} (ใช้ ${STATUSES.join(", ")}, open, all)`);
  return list;
}

function parseLinks(list = []) {
  return list.map((l) => {
    const i = l.indexOf("=");
    return i > 0 ? { label: l.slice(0, i).trim(), url: l.slice(i + 1).trim() } : { label: l.trim(), url: l.trim() };
  });
}

function fmt(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function printTasks(tasks) {
  if (!tasks.length) { console.log("(ไม่มีงาน)"); return; }
  const rank = { needs_info: 0, new: 1, in_progress: 2, review: 3, done: 4, cancelled: 5 };
  const prank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const sorted = [...tasks].sort((a, b) => rank[a.status] - rank[b.status] || prank[a.priority] - prank[b.priority] || b.updatedAt.localeCompare(a.updatedAt));
  for (const t of sorted) {
    const sys = t.systems.length ? ` [${t.systems.join(",")}]` : "";
    const pri = t.priority === "normal" ? "" : ` (${PRIORITY_TH[t.priority]})`;
    const held = t.hold?.active ? " · หยุดก่อน!" : "";
    const ready = t.status === "new" && t.readyAt ? (Date.parse(t.readyAt) <= Date.now() ? " · พร้อมให้ Claude" : ` · พร้อมให้ Claude ${fmt(t.readyAt)}`) : "";
    console.log(`${t.id.padEnd(6)} ${STATUS_TH[t.status].padEnd(12)} ${t.title}${sys}${pri} · ${t.createdBy.name} · ${fmt(t.updatedAt)} · ${t.attachments.length} ไฟล์${ready}${held}`);
  }
}

async function download(url, token, dest) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok || !res.body) die(`ดาวน์โหลดไม่ได้ ${url} → ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function fileForm(files, extra = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) {
    if (Array.isArray(v)) for (const x of v) form.append(k, x);
    else if (v !== undefined && v !== null) form.set(k, String(v));
  }
  for (const f of files) {
    const p = resolve(f);
    if (!existsSync(p)) die(`ไม่พบไฟล์ ${f}`);
    if (statSync(p).size > 30 * 1024 * 1024) die(`ไฟล์ ${f} ใหญ่เกิน 30 MB`);
    form.append("files", new Blob([readFileSync(p)]), basename(p));
  }
  return form;
}

const commands = {
  async config({ opt }) {
    const cfg = loadConfig();
    if (opt.url) cfg.url = String(opt.url).replace(/\/+$/, "");
    if (opt.token) cfg.token = String(opt.token);
    if (opt.jobs) cfg.jobsDir = resolve(String(opt.jobs));
    writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
    console.log(`บันทึกแล้วที่ ${CONFIG}: url=${cfg.url || "-"} token=${cfg.token ? cfg.token.slice(0, 10) + "…" : "-"} jobs=${cfg.jobsDir || "(./NewJob)"}`);
    if (cfg.url && cfg.token) {
      const me = await call(need(cfg), "/api/me");
      console.log(me.user ? `เข้าใช้ได้ในชื่อ ${me.user.name} (${me.user.email})` : "token ใช้ไม่ได้");
    }
  },

  async list({ opt }) {
    const cfg = need(loadConfig());
    const q = new URLSearchParams();
    if (opt.ready) {
      const { tasks } = await call(cfg, "/api/tasks?ready=1");
      if (opt.json) console.log(JSON.stringify(tasks, null, 2)); else if (!tasks.length) console.log("ไม่มีงานพร้อมทำ"); else printTasks(tasks);
      return;
    }
    const st = statusList(opt.status);
    if (st.length) q.set("status", st.join(","));
    if (opt.system) q.set("system", String(opt.system));
    if (opt.q) q.set("q", String(opt.q));
    const { tasks } = await call(cfg, `/api/tasks?${q}`);
    if (opt.json) console.log(JSON.stringify(tasks, null, 2)); else printTasks(tasks);
  },

  async show({ pos, opt }) {
    const id = pos[0] || die("ต้องระบุรหัสงาน เช่น T-12");
    const cfg = need(loadConfig());
    if (opt.json) { console.log(JSON.stringify(await call(cfg, `/api/tasks/${id}`), null, 2)); return; }
    const res = await fetch(`${cfg.url}/api/tasks/${id}/export`, { headers: { authorization: `Bearer ${cfg.token}` } });
    if (!res.ok) die(`ไม่พบงาน ${id} (${res.status})`);
    console.log(await res.text());
  },

  async pull({ pos, opt }) {
    const cfgFile = loadConfig();
    const cfg = need(cfgFile);
    let id = pos[0] || "next";
    if (id === "next" && opt.ready) {
      // Only what the team has left alone for the grace period and not held; the server orders by urgency.
      const { tasks } = await call(cfg, "/api/tasks?ready=1");
      if (!tasks.length) { console.log("ไม่มีงานพร้อมทำ"); process.exit(2); }
      id = tasks[0].id;
    } else if (id === "next") {
      const { tasks } = await call(cfg, "/api/tasks?status=new,needs_info");
      const prank = { urgent: 0, high: 1, normal: 2, low: 3 };
      const pick = [...tasks].sort((a, b) => prank[a.priority] - prank[b.priority] || a.createdAt.localeCompare(b.createdAt))[0];
      if (!pick) { console.log("ไม่มีงานใหม่หรือรอข้อมูลค้างอยู่"); return; }
      id = pick.id;
    }
    const data = await call(cfg, `/api/tasks/${id}/pull`, { method: "POST", asClaude: isClaude(opt) });
    // Tell the team the work has started and how to stop it; skipped while a hold is on (the hold is the message then).
    if (isClaude(opt) && !data.task.hold?.active) {
      await call(cfg, `/api/tasks/${id}/comments`, { method: "POST", asClaude: true, body: { text: "Claude รับงานแล้ว กำลังทำอยู่ — ถ้าจะแก้โจทย์หรือเพิ่มข้อมูล กด 'หยุดก่อน' ที่หน้างานนี้ก่อนครับ" } }).catch(() => {});
    }
    const root = opt.out ? resolve(String(opt.out)) : join(cfgFile.jobsDir || resolve("NewJob"), data.folder);
    mkdirSync(join(root, "files"), { recursive: true });
    writeFileSync(join(root, "task.md"), data.markdown);
    writeFileSync(join(root, "task.json"), JSON.stringify({ task: data.task, pulledAt: new Date().toISOString() }, null, 2));
    for (const f of data.files) await download(f.url, cfg.token, join(root, "files", f.name));
    console.log(`ดึงงาน ${data.task.id} · ${data.task.title}`);
    console.log(`โฟลเดอร์: ${root}`);
    console.log(`  task.md + ${data.files.length} ไฟล์ใน files/`);
    console.log(`สถานะตอนนี้: ${STATUS_TH[data.task.status]}`);
    console.log(holdLine(data.task));
  },

  /** `{active,by,at,note}` for scripts: has the team pressed "หยุดก่อน" on this task? */
  async hold({ pos }) {
    const id = pos[0] || die("ต้องระบุรหัสงาน เช่น T-12");
    const cfg = need(loadConfig());
    const r = await call(cfg, `/api/tasks/${id}/hold`);
    console.log(JSON.stringify(r.hold?.active ? r.hold : { active: false }));
  },

  async create({ opt }) {
    const cfg = need(loadConfig());
    const title = opt.title || die("ต้องมี --title");
    const body = opt["body-file"] ? readText(String(opt["body-file"])) : String(opt.body ?? "");
    const files = opt.files ?? [];
    const form = await fileForm(files, { title, body, priority: opt.priority || "normal", systems: String(opt.systems || "").split(",").map((s) => s.trim()).filter(Boolean) });
    const { task } = await call(cfg, "/api/tasks", { method: "POST", form, asClaude: isClaude(opt) });
    console.log(`สร้างงาน ${task.id} · ${task.title}`);
    console.log(`${cfg.url}/t/${task.id}`);
  },

  async comment({ pos, opt }) {
    const id = pos[0] || die("ต้องระบุรหัสงาน");
    const cfg = need(loadConfig());
    const text = opt.file ? readText(String(opt.file)) : String(opt.text ?? "");
    if (!text.trim()) die("ต้องมี --text หรือ --file");
    if (opt.status && !STATUSES.includes(opt.status)) die(`สถานะไม่ถูกต้อง: ${opt.status}`);
    const { task } = await call(cfg, `/api/tasks/${id}/comments`, { method: "POST", body: { text, status: opt.status }, asClaude: isClaude(opt), force: Boolean(opt.force) });
    console.log(`ส่งความเห็นใน ${task.id} แล้ว · สถานะ ${STATUS_TH[task.status]}`);
  },

  async report({ pos, opt }) {
    const id = pos[0] || die("ต้องระบุรหัสงาน");
    const cfg = need(loadConfig());
    const text = opt.file ? readText(String(opt.file)) : String(opt.text ?? "");
    if (!text.trim()) die("ต้องมี --text หรือ --file (สรุปงานเป็น markdown)");
    const status = opt.status || "review";
    if (!STATUSES.includes(status)) die(`สถานะไม่ถูกต้อง: ${status}`);
    const { task } = await call(cfg, `/api/tasks/${id}/report`, { method: "POST", body: { text, status, links: parseLinks(opt.link) }, asClaude: isClaude(opt), force: Boolean(opt.force) });
    console.log(`ส่งสรุปงาน ${task.id} แล้ว · สถานะ ${STATUS_TH[task.status]}`);
    console.log(`${cfg.url}/t/${task.id}`);
  },

  async status({ pos, opt }) {
    const [id, status] = pos;
    if (!id || !STATUSES.includes(status)) die(`ใช้: task-inbox status T-12 <${STATUSES.join("|")}>`);
    const cfg = need(loadConfig());
    const { task } = await call(cfg, `/api/tasks/${id}`, { method: "PATCH", body: { status }, asClaude: isClaude(opt), force: Boolean(opt.force) });
    console.log(`${task.id} → ${STATUS_TH[task.status]}`);
  },

  async upload({ pos }) {
    const [id, ...files] = pos;
    if (!id || !files.length) die("ใช้: task-inbox upload T-12 file1 file2 …");
    const cfg = need(loadConfig());
    const form = await fileForm(files);
    const { attachments } = await call(cfg, `/api/tasks/${id}/files`, { method: "POST", form });
    for (const a of attachments) console.log(`แนบ ${a.name} (${a.id})`);
  },

  async "rm-file"({ pos }) {
    const [id, fid] = pos;
    if (!id || !fid) die("ใช้: task-inbox rm-file T-12 <attachmentId>");
    const cfg = need(loadConfig());
    await call(cfg, `/api/tasks/${id}/files/${fid}`, { method: "DELETE" });
    console.log(`ลบไฟล์ ${fid} จาก ${id} แล้ว`);
  },

  async me() {
    const cfg = need(loadConfig());
    const me = await call(cfg, "/api/me");
    console.log(me.user ? `${me.user.name} <${me.user.email}> (${me.user.role}) @ ${cfg.url}` : "token ใช้ไม่ได้");
  },

  help() {
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n/, "").replace(/^ \* ?/gm, ""));
  },
};

const { pos, opt } = parseArgs(process.argv.slice(2));
const cmd = pos.shift() || "help";
if (!commands[cmd]) die(`ไม่รู้จักคำสั่ง ${cmd}\n` + Object.keys(commands).join(", "));
Promise.resolve(commands[cmd]({ pos, opt })).catch((e) => die(e?.message || String(e)));
