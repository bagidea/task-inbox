import { fail, handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** Inbox-wide settings: today only the grace period before Claude may take a new task. */
export async function GET(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    return json({ settings: await tasks().settings() });
  });
}

/** Admin: `{graceMinutes}`. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    if (c.user.role !== "admin") return fail(403, "เฉพาะผู้ดูแล");
    const b = await readJson(request);
    if (b.graceMinutes !== undefined && !Number.isFinite(Number(b.graceMinutes))) return fail(400, "ช่วงพักต้องเป็นตัวเลข (นาที)");
    return json({ settings: await tasks().saveSettings({ graceMinutes: b.graceMinutes === undefined ? undefined : Number(b.graceMinutes) }) });
  });
}
