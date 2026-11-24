import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { TaskService, waitFromBody } from "@/lib/tasks";
import type { Actor, User } from "@/lib/types";
import { afterComment, deriveWaiting, isWaitingOn, parseWaitAction, waitingLabel, waitingOf } from "@/lib/waiting";

const alice: Actor = { id: "u-alice", name: "Alice", kind: "user" };
const bob: Actor = { id: "u-bob", name: "Bob", kind: "user" };
const owner: Actor = { id: "u-owner", name: "Owner", kind: "user" };
const claude: Actor = { id: "u-owner", name: "Claude", kind: "claude" };
const user = (a: Actor, role: User["role"], at: string): User => ({ id: a.id, email: `${a.name.toLowerCase()}@example.test`, name: a.name, role, passwordHash: "x", createdAt: at });

async function svc() {
  const store = new MemoryStore();
  await store.saveUser(user(owner, "admin", "2026-10-28T00:00:00Z"));
  await store.saveUser(user(alice, "member", "2026-10-29T00:00:00Z"));
  await store.saveUser(user(bob, "member", "2026-10-30T00:00:00Z"));
  let t = Date.parse("2026-11-23T03:00:00Z");
  return { s: new TaskService(store, () => new Date((t += 60_000)).toISOString()), store };
}

describe("ถึงตาใคร: the rules", () => {
  const base = { createdBy: alice };
  it("follows the status: needs_info → filer answers, review → filer tests, new/in_progress → Claude, done/cancelled → nobody", () => {
    expect(waitingLabel(deriveWaiting({ ...base, status: "needs_info" }))).toBe("รอ Alice ตอบ");
    expect(waitingLabel(deriveWaiting({ ...base, status: "review" }))).toBe("รอ Alice ทดสอบ");
    expect(waitingLabel(deriveWaiting({ ...base, status: "in_progress" }))).toBe("รอ Claude ทำ");
    expect(waitingLabel(deriveWaiting({ ...base, status: "in_progress" }), "Owner (Claude)")).toBe("รอ Owner (Claude) ทำ");
    expect(deriveWaiting({ ...base, status: "done" })).toBeNull();
  });

  it("an override counts only in the status it was set in", () => {
    const w = { who: [{ kind: "user" as const, id: "u-bob", name: "Bob" }], action: "approve" as const, status: "needs_info" as const, manual: true };
    expect(waitingLabel(waitingOf({ ...base, status: "needs_info", waitingOn: w }))).toBe("รอ Bob อนุมัติ");
    expect(waitingLabel(waitingOf({ ...base, status: "review", waitingOn: w }))).toBe("รอ Alice ทดสอบ");
  });

  it("my turn = I am named; actions in Thai or English; the awaited person's comment hands it back to Claude", () => {
    expect(isWaitingOn(deriveWaiting({ ...base, status: "review" }), "u-alice")).toBe(true);
    expect(isWaitingOn(deriveWaiting({ ...base, status: "new" }), "u-owner")).toBe(false);
    expect(parseWaitAction("อนุมัติ")).toBe("approve");
    expect(parseWaitAction("x")).toBeNull();
    expect(waitingLabel(afterComment({ createdBy: alice, status: "needs_info" }, alice, "u-owner", "x")!)).toBe("รอ Claude ทำ");
    expect(afterComment({ createdBy: owner, status: "needs_info" }, claude, "u-owner", "x")).toBeUndefined();
  });
});

describe("ถึงตาใคร: on tasks", () => {
  it("labels every read, moves with the status, flips on the awaited person's comment, can be set / reset / cleared", async () => {
    const { s, store } = await svc();
    const t = await s.create({ title: "ปุ่มจ่ายเงิน", body: "", systems: ["web"], priority: "high" }, alice);
    expect(t.waitingLabel).toBe("รอ Owner (Claude) ทำ");
    await s.comment(t.id, "ขอภาพหน้าจอ", claude, "needs_info");
    expect((await s.get(t.id)).waitingLabel).toBe("รอ Alice ตอบ");
    await s.comment(t.id, "ส่งแล้ว", alice);
    expect((await s.get(t.id)).waitingLabel).toBe("รอ Owner (Claude) ทำ");
    await s.report(t.id, "เสร็จแล้ว", claude, { wait: { who: "bob", action: "ทดสอบ" } });
    expect((await s.get(t.id)).waitingLabel).toBe("รอ Bob ทดสอบ");
    await s.update(t.id, { wait: { who: "auto" } }, owner);
    expect((await s.get(t.id)).waitingLabel).toBe("รอ Alice ทดสอบ");
    await s.update(t.id, { wait: { who: "none" } }, owner);
    expect((await s.get(t.id)).waitingLabel).toBeNull();
    await expect(s.update(t.id, { wait: { who: "ghost" } }, owner)).rejects.toMatchObject({ status: 400 });
    expect((await s.events(t.id)).filter((e) => e.type === "waiting").map((e) => e.to)).toEqual(["รอ Bob ทดสอบ", "รอ Alice ทดสอบ", "ไม่มีใคร"]);
    const raw = await store.getTask(t.id);
    expect(raw && "waitingLabel" in raw).toBe(false);
  });

  it("request bodies: nested wait or flat waitOn / waitAction", () => {
    expect(waitFromBody({ wait: { who: "Alice", action: "ตอบ" } })).toEqual({ who: "Alice", action: "ตอบ" });
    expect(waitFromBody({ waitOn: "Bob" })).toEqual({ who: "Bob", action: undefined });
    expect(waitFromBody({})).toBeUndefined();
  });
});
