import { fail, forced, handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { isStatus, parseLinks, tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** `{text, status?: review|needs_info|done, links?: [{label,url}]}`: the summary from the work session. 409 on-hold for Claude while the team's hold is on (unless `?force=1`). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const b = await readJson(request);
    if (b.status !== undefined && !isStatus(b.status)) return fail(400, "สถานะไม่ถูกต้อง");
    const event = await tasks().report(id, String(b.text ?? ""), c.actor, { status: isStatus(b.status) ? b.status : undefined, links: parseLinks(b.links), force: forced(request) });
    return json({ event, task: await tasks().get(id) }, 201);
  });
}
