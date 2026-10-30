"use client";
import { useEffect, useState, type FormEvent } from "react";
import { CopyButton, Notice, Spinner } from "./bits";
import type { PublicUser } from "@/lib/types";
import { useInboxConfig } from "./config";
import { api, fmtDateTime } from "@/lib/ui";

interface TokenInfo { id: string; name: string; prefix: string; createdAt: string; lastUsedAt?: string }

export function Settings({ user, baseUrl, changePasswordFirst }: { user: PublicUser; baseUrl: string; changePasswordFirst: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-3xl">ตั้งค่า</h1>
        <p className="mt-1 text-sm text-mist">{user.name} · {user.email} · {user.role === "admin" ? "ผู้ดูแล" : "สมาชิกทีม"}</p>
      </div>
      {changePasswordFirst && <Notice kind="info">นี่เป็นรหัสผ่านชั่วคราว กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน</Notice>}
      <Password />
      <Tokens baseUrl={baseUrl} />
      {user.role === "admin" && <AutoIntake />}
      {user.role === "admin" && <Users me={user} />}
    </div>
  );
}

function Password() {
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.next !== f.again) { setMsg({ kind: "error", text: "รหัสผ่านใหม่ไม่ตรงกัน" }); return; }
    setBusy(true); setMsg(null);
    try { await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current: f.current, next: f.next }) }); setMsg({ kind: "ok", text: "เปลี่ยนรหัสผ่านแล้ว" }); setF({ current: "", next: "", again: "" }); }
    catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="font-semibold">รหัสผ่าน</h2>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label">รหัสผ่านเดิม</label><input className="field" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></div>
        <div><label className="label">รหัสผ่านใหม่</label><input className="field" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></div>
        <div><label className="label">ยืนยันอีกครั้ง</label><input className="field" type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} required /></div>
      </div>
      <button className="btn btn-ghost btn-sm" disabled={busy}>{busy ? <Spinner /> : "เปลี่ยนรหัสผ่าน"}</button>
    </form>
  );
}

/** Admin: how long the team's last change must be old before Claude takes a new task on its own. */
function AutoIntake() {
  const [minutes, setMinutes] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  useEffect(() => { api<{ settings: { graceMinutes: number } }>("/api/settings").then((r) => { setMinutes(String(r.settings.graceMinutes)); setSaved(r.settings.graceMinutes); }).catch(() => {}); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ settings: { graceMinutes: number } }>("/api/settings", { method: "PATCH", body: JSON.stringify({ graceMinutes: Number(minutes) }) });
      setMinutes(String(r.settings.graceMinutes)); setSaved(r.settings.graceMinutes); setMsg({ kind: "ok", text: "บันทึกแล้ว" });
    } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <div>
        <h2 className="font-semibold">Claude รับงานอัตโนมัติ</h2>
        <p className="mt-1 text-sm text-mist">Claude Code บนเครื่องของผู้ดูแล (เมื่อเปิดลูป task-inbox-auto) เช็กงานใหม่เองทุก 10–30 นาที งานใหม่ (หรืองานที่ทีมเปิดกลับมา) จะถูกดึงไปทำเมื่อไม่มีใครแก้ไขอะไรครบช่วงพักนี้ กด &quot;ส่งให้ Claude เลย&quot; ที่หน้างานถ้าไม่อยากรอ และกด &quot;หยุดก่อน&quot; ถ้าจะแก้โจทย์ระหว่างที่ Claude ทำอยู่</p>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="label">ช่วงพักก่อน Claude รับงาน (นาที)</label><input className="field w-32" type="number" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} required /></div>
        <button className="btn btn-ghost btn-sm" disabled={busy || minutes === "" || Number(minutes) === saved}>{busy ? <Spinner /> : "บันทึก"}</button>
        {saved !== null && <span className="text-xs text-mist">ตอนนี้ {saved} นาที · 0 = ดึงทันทีในรอบถัดไป</span>}
      </div>
    </form>
  );
}

function Tokens({ baseUrl }: { baseUrl: string }) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => api<{ tokens: TokenInfo[] }>("/api/tokens").then((r) => setTokens(r.tokens)).catch(() => {});
  useEffect(() => { load(); }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { const r = await api<{ token: string }>("/api/tokens", { method: "POST", body: JSON.stringify({ name }) }); setFresh(r.token); setName(""); await load(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!window.confirm("ยกเลิก token นี้? เครื่องที่ใช้อยู่จะใช้ไม่ได้ทันที")) return;
    try { await api(`/api/tokens/${id}`, { method: "DELETE" }); await load(); } catch (err) { setError((err as Error).message); }
  }
  const tok = fresh ?? "<token>";
  const skillDir = "~/.claude/skills/task-inbox";
  const ps = `$d="$env:USERPROFILE\\.claude\\skills\\task-inbox"; New-Item -ItemType Directory -Force $d | Out-Null; iwr "${baseUrl}/skill/task-inbox/SKILL.md" -OutFile "$d\\SKILL.md"; iwr "${baseUrl}/skill/task-inbox/task-inbox.mjs" -OutFile "$d\\task-inbox.mjs"; node "$d\\task-inbox.mjs" config --url ${baseUrl} --token ${tok}`;
  const sh = `d=${skillDir}; mkdir -p $d; curl -fsSL ${baseUrl}/skill/task-inbox/SKILL.md -o $d/SKILL.md; curl -fsSL ${baseUrl}/skill/task-inbox/task-inbox.mjs -o $d/task-inbox.mjs; node $d/task-inbox.mjs config --url ${baseUrl} --token ${tok}`;
  const nodeCfg = `node "${skillDir}/task-inbox.mjs" config --url ${baseUrl} --token ${tok}`;
  const nodeCli = `node "${skillDir}/task-inbox.mjs"`;
  const autoPs = `$d="$env:USERPROFILE\\.claude\\skills\\task-inbox-auto"; New-Item -ItemType Directory -Force $d | Out-Null; iwr "${baseUrl}/skill/task-inbox-auto/SKILL.md" -OutFile "$d\\SKILL.md"`;
  const autoSh = `d=~/.claude/skills/task-inbox-auto; mkdir -p $d; curl -fsSL ${baseUrl}/skill/task-inbox-auto/SKILL.md -o $d/SKILL.md`;
  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Claude / CLI</h2>
        <p className="mt-1 text-sm text-mist">token ส่วนตัวสำหรับให้ Claude Code บนเครื่องของคุณดึงงานและส่งสรุปกลับมาที่นี่ (ดูวิธีติดตั้งด้านล่าง)</p>
      </div>
      {error && <Notice>{error}</Notice>}
      {fresh && (
        <div className="space-y-2 rounded-xl border border-lime/40 bg-lime/5 p-3">
          <div className="text-sm font-semibold text-lime">token ใหม่ แสดงครั้งเดียว เก็บไว้ให้ดี</div>
          <pre className="overflow-x-auto rounded-lg bg-ink p-2 font-mono text-xs">{fresh}</pre>
          <div className="text-xs text-mist">ครั้งแรกบนเครื่องนี้: ติดตั้ง skill + ตั้งค่าในคำสั่งเดียว (PowerShell บน Windows / Terminal บน Mac):</div>
          <pre className="overflow-x-auto rounded-lg bg-ink p-2 font-mono text-[11px]">{ps}</pre>
          <div className="text-xs text-mist">ติดตั้ง skill ไว้แล้ว แค่เปลี่ยน token (รันในช่องแชทของ Claude Code ได้เลย โดยพิมพ์ <code className="font-mono">!</code> นำหน้า):</div>
          <pre className="overflow-x-auto rounded-lg bg-ink p-2 font-mono text-[11px]">{nodeCfg}</pre>
          <div className="flex flex-wrap gap-2"><CopyButton text={fresh} label="คัดลอก token" /><CopyButton text={ps} label="คัดลอกติดตั้ง (Windows)" /><CopyButton text={sh} label="คัดลอกติดตั้ง (Mac/Linux)" /><CopyButton text={nodeCfg} label="คัดลอกเฉพาะ config" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => setFresh(null)}>ปิด</button></div>
        </div>
      )}
      <ul className="divide-y divide-line">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="font-mono text-xs text-mist">{t.prefix}…</span>
            <span className="font-medium">{t.name}</span>
            <span className="text-xs text-mist">สร้าง {fmtDateTime(t.createdAt)}{t.lastUsedAt ? ` · ใช้ล่าสุด ${fmtDateTime(t.lastUsedAt)}` : ""}</span>
            <button type="button" className="ml-auto text-xs text-mist hover:text-coral" onClick={() => revoke(t.id)}>ยกเลิก</button>
          </li>
        ))}
        {tokens.length === 0 && <li className="py-2 text-sm text-mist">ยังไม่มี token</li>}
      </ul>
      <form onSubmit={create} className="flex gap-2">
        <input className="field" placeholder="ชื่อเครื่อง เช่น โน้ตบุ๊กทำงาน" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <button className="btn btn-lime btn-sm shrink-0" disabled={busy}>{busy ? <Spinner /> : "สร้าง token"}</button>
      </form>
      <details className="text-sm text-fog" open>
        <summary className="cursor-pointer font-semibold">วิธีใช้กับ Claude Code (ติดตั้ง + คำสั่ง)</summary>
        <div className="mt-3 space-y-4 text-mist">
          <div>
            <div className="font-semibold text-fog">1. ติดตั้ง skill ครั้งแรก (ต้องมี Node 18+)</div>
            <p className="mt-1">สร้าง token ด้านบน แล้วคัดลอกคำสั่งติดตั้งที่แสดงไปรัน <strong>หนึ่งครั้ง</strong> ใน PowerShell (Windows) หรือ Terminal (Mac) คำสั่งจะดาวน์โหลด skill ไปไว้ที่ <code className="font-mono">{skillDir}/</code> และเก็บ token ไว้ที่ <code className="font-mono">~/.task-inbox.json</code></p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-2 font-mono text-[11px]">{ps}</pre>
            <p className="mt-1 text-xs">คำสั่งนี้เป็น PowerShell: <strong>ห้ามวางในช่องแชทของ Claude Code</strong> (ช่อง <code className="font-mono">!</code> ของ Claude Code รันด้วย bash จะขึ้น command not found) ให้เปิดหน้าต่าง PowerShell แยก หรือใช้คำสั่งข้อ 2 แทน</p>
          </div>
          <div>
            <div className="font-semibold text-fog">2. ตั้งค่าหรือเปลี่ยน token เมื่อติดตั้ง skill ไว้แล้ว</div>
            <p className="mt-1">คำสั่งนี้ใช้ได้ทุกที่ รวมถึงในช่องแชทของ Claude Code (พิมพ์ <code className="font-mono">!</code> นำหน้า) หรือจะบอก Claude ว่า &quot;ตั้งค่า token ของ task inbox ให้หน่อย&quot; แล้ววาง token ก็ได้</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-2 font-mono text-[11px]">{nodeCfg}</pre>
          </div>
          <div>
            <div className="font-semibold text-fog">3. พูดกับ Claude</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>&quot;รับงานจาก task inbox&quot; / &quot;รับงาน T-12&quot; / &quot;รับงานถัดไป&quot; → Claude ดึงงานลงโฟลเดอร์ <code className="font-mono">NewJob/&lt;วันที่&gt;_T-12/</code> (task.md + files/) ทำงาน แล้วส่งสรุป + ลิงก์ทดสอบกลับขึ้นหน้างานนี้ให้ (สถานะ → รอทดสอบ)</li>
              <li>&quot;เพิ่มงานใน task inbox: …&quot; → Claude สร้างงานใหม่ให้ (ชื่อ, ระบบ, ความเร่งด่วน, รายละเอียด, ไฟล์แนบ)</li>
              <li>&quot;ส่งสรุปงาน T-12 ขึ้นเว็บ&quot; / &quot;ถามทีมในงาน T-12 ว่า …&quot; → report / comment</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-fog">4. ใช้ CLI ตรง ๆ (ไม่ผ่าน Claude)</div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-2 font-mono text-[11px]">{`${nodeCli} list                      # งานที่ค้างอยู่ (--status all / new,needs_info)
${nodeCli} list --ready              # งานใหม่ที่พ้นช่วงพักและไม่ถูกกด "หยุดก่อน" (ที่ Claude รับเองได้)
${nodeCli} show T-12                 # งานเป็น markdown
${nodeCli} pull T-12                 # ดึงลง NewJob/<วันที่>_T-12/ (หรือ pull next, pull next --ready)
${nodeCli} hold T-12                 # ดูว่าทีมกด "หยุดก่อน" ไว้ไหม (JSON)
${nodeCli} report T-12 --file summary.md --link "ทดสอบ=https://…"
${nodeCli} comment T-12 --text "ถามหน่อย…" --status needs_info
${nodeCli} create --title "…" --body-file brief.md --systems web --priority high --files a.png
${nodeCli} status T-12 done
${nodeCli} upload T-12 file1.png file2.zip`}</pre>
            <p className="mt-1 text-xs">บน Windows ใช้ <code className="font-mono">%USERPROFILE%\.claude\skills\task-inbox\task-inbox.mjs</code> แทน <code className="font-mono">{skillDir}</code> ได้ ถ้าโฟลเดอร์งานไม่ใช่ <code className="font-mono">./NewJob</code> ตั้งได้ด้วย <code className="font-mono">config --jobs &lt;โฟลเดอร์&gt;</code></p>
          </div>
          <div>
            <div className="font-semibold text-fog">5. (ทางเลือก) ให้ Claude รับงานเองเป็นลูป</div>
            <p className="mt-1">ติดตั้ง skill ตัวที่สอง <code className="font-mono">task-inbox-auto</code> แล้วพิมพ์ <code className="font-mono">/task-inbox-auto on</code> ใน Claude Code: Claude จะเช็กงานที่พ้นช่วงพักทุก 10–30 นาที ดึงมาทำ แล้วส่งสรุปเอง (<code className="font-mono">off</code> หยุด, <code className="font-mono">status</code> ดูสถานะ) ลูปอยู่ใน session นั้น ปิด terminal แล้วต้อง on ใหม่</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-2 font-mono text-[11px]">{autoSh}</pre>
            <div className="mt-1 flex gap-2"><CopyButton text={autoPs} label="คัดลอก (Windows)" /><CopyButton text={autoSh} label="คัดลอก (Mac/Linux)" /></div>
          </div>
          <div className="text-xs">ไฟล์ของ skill: <a className="underline" href="/skill/task-inbox/SKILL.md" target="_blank" rel="noreferrer">SKILL.md</a> · <a className="underline" href="/skill/task-inbox/task-inbox.mjs" target="_blank" rel="noreferrer">task-inbox.mjs</a> · <a className="underline" href="/skill/task-inbox-auto/SKILL.md" target="_blank" rel="noreferrer">task-inbox-auto/SKILL.md</a> · token ที่เคยวางในแชทถือว่าเปิดเผยแล้ว ยกเลิกแล้วสร้างใหม่ได้ด้านบน</div>
        </div>
      </details>
    </div>
  );
}

function Users({ me }: { me: PublicUser }) {
  const { name: inboxName } = useInboxConfig();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [f, setF] = useState({ name: "", email: "", role: "member" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const load = () => api<{ users: PublicUser[] }>("/api/users").then((r) => setUsers(r.users)).catch(() => {});
  useEffect(() => { load(); }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { const r = await api<{ temporaryPassword: string }>("/api/users", { method: "POST", body: JSON.stringify(f) }); setIssued({ email: f.email, password: r.temporaryPassword }); setF({ name: "", email: "", role: "member" }); await load(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function patch(id: string, body: Record<string, unknown>, email: string) {
    setBusy(true); setError("");
    try { const r = await api<{ temporaryPassword?: string }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }); if (r.temporaryPassword) setIssued({ email, password: r.temporaryPassword }); await load(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const handover = issued ? `${inboxName}\n${window.location.origin}\nอีเมล: ${issued.email}\nรหัสผ่านชั่วคราว: ${issued.password}\n(ระบบจะให้ตั้งรหัสใหม่ตอนเข้าครั้งแรก)` : "";
  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">ทีม</h2>
        <p className="mt-1 text-sm text-mist">สร้างบัญชีให้ทีม ระบบออกรหัสผ่านชั่วคราวให้ ส่งให้เจ้าตัวทางแชทของทีม แล้วเขาจะถูกขอให้ตั้งรหัสใหม่ตอนเข้าครั้งแรก</p>
      </div>
      {error && <Notice>{error}</Notice>}
      {issued && (
        <div className="space-y-2 rounded-xl border border-lime/40 bg-lime/5 p-3">
          <div className="text-sm font-semibold text-lime">รหัสผ่านชั่วคราวของ {issued.email} (แสดงครั้งเดียว)</div>
          <pre className="overflow-x-auto rounded-lg bg-ink p-2 font-mono text-sm">{issued.password}</pre>
          <div className="flex gap-2"><CopyButton text={handover} label="คัดลอกข้อความส่งให้ทีม" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => setIssued(null)}>ปิด</button></div>
        </div>
      )}
      <ul className="divide-y divide-line">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className={`font-medium ${u.disabled ? "line-through text-mist" : ""}`}>{u.name}</span>
            <span className="text-mist">{u.email}</span>
            <span className="chip">{u.role === "admin" ? "ผู้ดูแล" : "ทีม"}</span>
            {u.mustChangePassword && <span className="pill bg-amber/15 text-amber">ยังไม่ตั้งรหัส</span>}
            {u.id !== me.id && (
              <span className="ml-auto flex gap-1">
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => patch(u.id, { resetPassword: true }, u.email)}>ออกรหัสใหม่</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => patch(u.id, { role: u.role === "admin" ? "member" : "admin" }, u.email)}>{u.role === "admin" ? "ลดเป็นทีม" : "ตั้งเป็นผู้ดูแล"}</button>
                <button type="button" className={`btn btn-sm ${u.disabled ? "btn-ghost" : "btn-danger"}`} disabled={busy} onClick={() => patch(u.id, { disabled: !u.disabled }, u.email)}>{u.disabled ? "เปิดใช้" : "ปิดบัญชี"}</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input className="field" placeholder="ชื่อ" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input className="field" type="email" placeholder="อีเมล" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="member">ทีม</option><option value="admin">ผู้ดูแล</option></select>
        <button className="btn btn-lime btn-sm" disabled={busy}>{busy ? <Spinner /> : "สร้างบัญชี"}</button>
      </form>
    </div>
  );
}
