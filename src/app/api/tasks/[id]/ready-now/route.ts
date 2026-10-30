import { handle, isResponse, json, requireCaller } from "@/lib/server";
import { tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** "ส่งให้ Claude เลย": skip the grace period on a new task. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    return json({ task: await tasks().readyNow(id, c.actor) });
  });
}
