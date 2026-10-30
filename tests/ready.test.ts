import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { isReady, normaliseGrace, readiness, readyAt, sortReady, teamActivityAt } from "@/lib/ready";
import { OnHoldError, TaskService } from "@/lib/tasks";
import type { Actor, Task } from "@/lib/types";

const alice: Actor = { id: "u-alice", name: "Alice", kind: "user" };
const claude: Actor = { id: "u-dev", name: "Claude", kind: "claude" };
const T0 = Date.parse("2026-10-31T01:00:00Z");
const min = (n: number) => n * 60_000;

function base(over: Partial<Task> = {}): Task {
  return { id: "T-1", number: 1, title: "x", systems: [], priority: "normal", status: "new", body: "", attachments: [], createdBy: alice, createdAt: new Date(T0).toISOString(), updatedAt: new Date(T0).toISOString(), links: [], ...over };
}

describe("readiness (pure)", () => {
  it("counts the grace from the team's last change; old tasks without the field use updatedAt", () => {
    const t = base();
    expect(teamActivityAt(t)).toBe(t.updatedAt);
    expect(readyAt(t, 10)).toBe(new Date(T0 + min(10)).toISOString());
    expect(isReady(t, 10, T0 + min(9))).toBe(false);
    expect(isReady(t, 10, T0 + min(10))).toBe(true);
    expect(readiness(t, 10, T0 + min(3))).toEqual({ kind: "waiting", minutes: 7, at: readyAt(t, 10) });
    expect(readiness(t, 10, T0 + min(10))).toEqual({ kind: "ready", at: readyAt(t, 10) });
  });

  it("'ส่งให้ Claude เลย' skips the wait, but a later edit by the team starts the clock again", () => {
    const sent = base({ readyNowAt: new Date(T0 + min(1)).toISOString(), readyNowBy: "Alice" });
    expect(isReady(sent, 10, T0 + min(1))).toBe(true);
    expect(readiness(sent, 10, T0 + min(2))).toEqual({ kind: "sent", at: sent.readyNowAt });
    const edited = { ...sent, teamActivityAt: new Date(T0 + min(5)).toISOString() };
    expect(isReady(edited, 10, T0 + min(6))).toBe(false);
    expect(readyAt(edited, 10)).toBe(new Date(T0 + min(15)).toISOString());
  });

  it("is never ready when held, or when not new", () => {
    const held = base({ hold: { active: true, by: "Alice", at: new Date(T0).toISOString() } });
    expect(isReady(held, 0, T0 + min(60))).toBe(false);
    expect(readiness(held, 0, T0)).toEqual({ kind: "held" });
    expect(isReady(base({ status: "in_progress" }), 0, T0 + min(60))).toBe(false);
    expect(readiness(base({ status: "review" }), 0, T0)).toBeNull();
  });

  it("orders urgent first, then the task that has waited longest", () => {
    const a = base({ id: "T-1", number: 1, priority: "normal", updatedAt: new Date(T0).toISOString() });
    const b = base({ id: "T-2", number: 2, priority: "urgent", updatedAt: new Date(T0 + min(5)).toISOString() });
    const c = base({ id: "T-3", number: 3, priority: "urgent", updatedAt: new Date(T0 + min(1)).toISOString() });
    expect(sortReady([a, b, c], 10).map((t) => t.id)).toEqual(["T-3", "T-2", "T-1"]);
  });

  it("clamps the grace setting", () => {
    expect(normaliseGrace("15")).toBe(15);
    expect(normaliseGrace(-3)).toBe(0);
    expect(normaliseGrace("abc")).toBe(10);
    expect(normaliseGrace(99_999)).toBe(1440);
  });
});

describe("readiness through the service", () => {
  function svc() {
    let t = T0;
    const clock = { now: () => new Date(t).toISOString(), advance: (ms: number) => { t += ms; }, get ms() { return t; } };
    return { s: new TaskService(new MemoryStore(), clock.now), clock };
  }

  it("Claude's comments and reports do not restart the grace; the team's do; ready list honours the setting", async () => {
    const { s, clock } = svc();
    const t = await s.create({ title: "A", body: "", systems: ["web"], priority: "normal" }, alice);
    expect(t.teamActivityAt).toBe(t.createdAt);
    expect(t.readyAt).toBe(new Date(Date.parse(t.createdAt) + min(10)).toISOString());
    clock.advance(min(4));
    await s.comment(t.id, "รับทราบ", claude);
    expect((await s.get(t.id)).teamActivityAt).toBe(t.createdAt);
    expect(await s.listReady(clock.ms)).toEqual([]);
    clock.advance(min(7));
    expect((await s.listReady(clock.ms)).map((x) => x.id)).toEqual(["T-1"]);
    await s.comment(t.id, "เพิ่มเติม: ทำสีแดง", alice);
    expect(await s.listReady(clock.ms)).toEqual([]);
    await s.saveSettings({ graceMinutes: 0 });
    expect((await s.listReady(clock.ms)).map((x) => x.id)).toEqual(["T-1"]);
  });

  it("ready-now, pull, hold: Claude is refused with 409 while held, people are not, force passes, the team's status change clears it", async () => {
    const { s, clock } = svc();
    const t = await s.create({ title: "B", body: "", systems: [], priority: "high" }, alice);
    clock.advance(min(1));
    await s.readyNow(t.id, alice);
    expect((await s.listReady(clock.ms)).map((x) => x.id)).toEqual(["T-1"]);
    await s.pull(t.id, claude);
    expect(await s.listReady(clock.ms)).toEqual([]);

    await s.setHold(t.id, true, alice, "ขอแก้สีก่อน");
    const held = await s.get(t.id);
    expect(held.hold).toMatchObject({ active: true, by: "Alice", note: "ขอแก้สีก่อน" });
    await expect(s.report(t.id, "เสร็จแล้ว", claude)).rejects.toBeInstanceOf(OnHoldError);
    await expect(s.comment(t.id, "ถาม", claude)).rejects.toMatchObject({ status: 409, message: "on-hold" });
    await expect(s.update(t.id, { status: "review" }, claude)).rejects.toMatchObject({ status: 409 });
    await s.comment(t.id, "แก้แล้วนะ", alice);
    await s.update(t.id, { title: "B2" }, claude);
    await s.report(t.id, "เสร็จแล้ว", claude, { force: true, status: "in_progress" });

    await s.setHold(t.id, false, alice);
    expect((await s.get(t.id)).hold?.active).toBe(false);
    await s.setHold(t.id, true, alice);
    await s.update(t.id, { status: "new" }, alice);
    expect((await s.get(t.id)).hold?.active).toBe(false);
    const types = (await s.events(t.id)).map((e) => e.type);
    expect(types.filter((x) => x === "ready_now" || x === "hold" || x === "resume")).toEqual(["ready_now", "hold", "resume", "hold"]);
    await expect(s.readyNow(t.id, alice)).resolves.toBeTruthy();
    await s.update(t.id, { status: "review" }, alice);
    await expect(s.readyNow(t.id, alice)).rejects.toMatchObject({ status: 400 });
  });
});
