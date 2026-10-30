import { handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** `{active: true|false, note?}` — "หยุดก่อน" / "ให้ทำต่อ". */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const b = await readJson(request);
    const task = await tasks().setHold(id, b.active !== false, c.actor, typeof b.note === "string" ? b.note : undefined);
    return json({ task, hold: task.hold ?? { active: false } });
  });
}

/** The hold alone, for scripts (`task-inbox hold T-12`). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const task = await tasks().get(id);
    return json({ hold: task.hold ?? { active: false }, status: task.status, readyAt: task.readyAt });
  });
}
