import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobFolderName, taskMarkdown } from "@/lib/export";
import { parseSystemDefs, systemLabel } from "@/lib/systems";
import { MemoryStore } from "@/lib/store/memory";
import { TaskError, TaskService, parseLinks, parseSystems } from "@/lib/tasks";
import type { Actor } from "@/lib/types";

const alice: Actor = { id: "u-alice", name: "Alice", kind: "user" };
const claude: Actor = { id: "u-dev", name: "Claude", kind: "claude" };

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "inbox-")); process.env.INBOX_FILES_DIR = dir; process.env.INBOX_SYSTEMS = "web:Website,shop:Online shop,cafe:Café,members:Members,other:อื่น ๆ"; });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function svc() {
  let t = Date.parse("2026-10-29T03:00:00Z");
  return new TaskService(new MemoryStore(), () => new Date((t += 60_000)).toISOString());
}

describe("a task's life", () => {
  it("is numbered T-1, T-2…, starts new, and every change leaves a line in the timeline", async () => {
    const s = svc();
    const a = await s.create({ title: "  Custom Lab: ช่องสีด้าย ", body: "## สิ่งที่ต้องการ\n- เลือกสีด้ายได้", systems: ["custom-lab"], priority: "high" }, alice);
    const b = await s.create({ title: "Café: โลโก้ใหม่", body: "", systems: ["cafe"], priority: "normal" }, alice);
    expect([a.id, b.id]).toEqual(["T-1", "T-2"]);
    expect(a.title).toBe("Custom Lab: ช่องสีด้าย");
    expect(a.status).toBe("new");

    await s.update("t-1", { priority: "urgent", status: "needs_info", title: "Custom Lab: ช่องสีด้าย (ด่วน)" }, alice);
    const events = await s.events("T-1");
    expect(events.map((e) => e.type)).toEqual(["created", "priority", "status", "edit"]);
    expect(events[1]).toMatchObject({ from: "high", to: "urgent" });
    expect(events[3].text).toBe("แก้ไข ชื่องาน");
    // Nothing changed → nothing written.
    await s.update("T-1", { priority: "urgent" }, alice);
    expect((await s.events("T-1")).length).toBe(4);
  });

  it("pull marks it in progress (once), report moves it to review with its links, a question goes to needs_info", async () => {
    const s = svc();
    const t = await s.create({ title: "MIRA: ไม่สแกนซ้ำ", body: "x", systems: ["web"], priority: "normal" }, alice);
    const pulled = await s.pull(t.id, claude);
    expect(pulled.status).toBe("in_progress");
    expect(pulled.pulledBy).toBe("Claude");
    await s.pull(t.id, claude);
    expect((await s.events(t.id)).filter((e) => e.type === "status").length).toBe(1);

    await s.report(t.id, "ทำแล้ว ทดสอบที่ลิงก์", claude, { links: [{ label: "ทดสอบ", url: "https://uat.example/x" }] });
    let cur = await s.get(t.id);
    expect(cur.status).toBe("review");
    expect(cur.links).toEqual([{ label: "ทดสอบ", url: "https://uat.example/x" }]);
    expect(cur.reportedAt).toBeTruthy();

    await s.report(t.id, "ติดคำถาม: ใช้ SKU ไหน?", claude, { status: "needs_info", links: [{ label: "ทดสอบ", url: "https://uat.example/x" }] });
    cur = await s.get(t.id);
    expect(cur.status).toBe("needs_info");
    expect(cur.links.length).toBe(1);

    await s.comment(t.id, "ใช้ SER01 ครับ", alice, "new");
    cur = await s.get(t.id);
    expect(cur.status).toBe("new");
    const types = (await s.events(t.id)).map((e) => e.type);
    expect(types).toEqual(["created", "pulled", "status", "pulled", "report", "status", "report", "status", "comment", "status"]);
  });

  it("refuses an empty title, an empty comment, an unknown task", async () => {
    const s = svc();
    await expect(s.create({ title: " ", body: "", systems: [], priority: "normal" }, alice)).rejects.toBeInstanceOf(TaskError);
    const t = await s.create({ title: "ok", body: "", systems: [], priority: "normal" }, alice);
    await expect(s.comment(t.id, "  ", alice)).rejects.toMatchObject({ status: 400 });
    await expect(s.get("T-99")).rejects.toMatchObject({ status: 404 });
  });

  it("stores and removes attachments, with safe names, and streams them back", async () => {
    const s = svc();
    const t = await s.create({ title: "files", body: "", systems: [], priority: "low" }, alice);
    const att = await s.addFile(t.id, { name: "../../โลโก้ new:v2?.png", type: "image/png", bytes: new TextEncoder().encode("PNG!") }, alice);
    expect(att.name).toBe("โลโก้ new_v2_.png");
    expect(att.path).toBe(`tasks/${t.id}/${att.id}-โลโก้ new_v2_.png`);
    const { attachment, stream } = await s.file(t.id, att.id);
    expect(attachment.size).toBe(4);
    expect(await new Response(stream).text()).toBe("PNG!");
    await s.removeFile(t.id, att.id, alice);
    expect((await s.get(t.id)).attachments).toEqual([]);
    await expect(s.file(t.id, att.id)).rejects.toMatchObject({ status: 404 });
    expect((await s.events(t.id)).map((e) => e.type)).toEqual(["created", "file_added", "file_removed"]);
  });

  it("lists by status, system and text, newest change first", async () => {
    const s = svc();
    await s.create({ title: "A web", body: "", systems: ["web"], priority: "normal" }, alice);
    const b = await s.create({ title: "B cafe", body: "เมนูใหม่", systems: ["cafe"], priority: "normal" }, alice);
    await s.update(b.id, { status: "done" }, alice);
    expect((await s.list({})).map((t) => t.id)).toEqual(["T-2", "T-1"]);
    expect((await s.list({ status: ["new"] })).map((t) => t.id)).toEqual(["T-1"]);
    expect((await s.list({ system: "cafe" })).map((t) => t.id)).toEqual(["T-2"]);
    expect((await s.list({ q: "เมนู" })).map((t) => t.id)).toEqual(["T-2"]);
    expect((await s.list({ q: "t-1" })).map((t) => t.id)).toEqual(["T-1"]);
  });
});

describe("task.md for the job folder", () => {
  it("carries the brief, the files as files/<name>, and the conversation", async () => {
    const s = svc();
    const t = await s.create({ title: "Café: ลบการ์ด", body: "เอาการ์ด Health ออก", systems: ["cafe", "members"], priority: "high" }, alice);
    await s.addFile(t.id, { name: "screen.png", type: "image/png", bytes: new Uint8Array(2048) }, alice);
    await s.comment(t.id, "เพิ่มเติม: การ์ด Shop ด้วย", alice);
    await s.report(t.id, "ทำแล้ว", claude, { links: [{ label: "UAT", url: "https://uat.example" }] });
    const md = taskMarkdown(await s.get(t.id), await s.events(t.id), "https://inbox.example", systemLabel);
    expect(md).toContain("# T-1 · Café: ลบการ์ด");
    expect(md).toContain("- ระบบ: Café, Members");
    expect(md).toContain("- ความเร่งด่วน: ด่วน");
    expect(md).toContain("- หน้างาน: https://inbox.example/t/T-1");
    expect(md).toContain("เอาการ์ด Health ออก");
    expect(md).toContain("- `files/screen.png` (2 KB, Alice");
    expect(md).toContain("### ความเห็น · Alice ·");
    expect(md).toContain("### สรุปงาน · Claude ·");
    expect(md).toContain("- [UAT](https://uat.example)");
    expect(md).toContain("สถานะ งานใหม่ → รอทดสอบ");
    expect(jobFolderName(await s.get(t.id), new Date("2026-10-29T20:30:00Z"))).toBe("2026-10-30_T-1");
  });
});

describe("input parsing", () => {
  it("systems from a list or a comma string, unknown ones dropped; links need http(s)", () => {
    expect(parseSystems("web, CAFE,nope,web")).toEqual(["web", "cafe"]);
    expect(parseSystems(["shop"])).toEqual(["shop"]);
    expect(parseSystemDefs("a:Alpha, b, Bad Key:x,a:dup")).toEqual([{ key: "a", label: "Alpha" }, { key: "b", label: "b" }]);
    expect(parseSystemDefs("").length).toBeGreaterThan(0);
    expect(parseSystems(undefined)).toEqual([]);
    expect(parseLinks([{ label: "a", url: "https://x" }, { url: "ftp://y" }, { url: "https://z" }, "junk"])).toEqual([{ label: "a", url: "https://x" }, { label: "https://z", url: "https://z" }]);
  });
});
