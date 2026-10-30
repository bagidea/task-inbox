import { fail, forced, handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { isPriority, isStatus, parseLinks, parseSystems, tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: P) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const task = await tasks().get(id);
    const events = await tasks().events(task.id);
    return json({ task, events });
  });
}

/** Any of title, body, systems, priority, status, links. */
export async function PATCH(request: Request, { params }: P) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const b = await readJson(request);
    if (b.priority !== undefined && !isPriority(b.priority)) return fail(400, "ความเร่งด่วนไม่ถูกต้อง");
    if (b.status !== undefined && !isStatus(b.status)) return fail(400, "สถานะไม่ถูกต้อง");
    const task = await tasks().update(id, {
      title: typeof b.title === "string" ? b.title : undefined,
      body: typeof b.body === "string" ? b.body : undefined,
      systems: b.systems !== undefined ? parseSystems(b.systems) : undefined,
      priority: isPriority(b.priority) ? b.priority : undefined,
      status: isStatus(b.status) ? b.status : undefined,
      links: b.links !== undefined ? parseLinks(b.links) : undefined,
    }, c.actor, { force: forced(request) });
    return json({ task });
  });
}
