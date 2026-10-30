import { fail, forced, handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { isStatus, tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** `{text, status?}`: a comment, optionally moving the status (e.g. answering a question → new). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const b = await readJson(request);
    if (b.status !== undefined && !isStatus(b.status)) return fail(400, "สถานะไม่ถูกต้อง");
    const event = await tasks().comment(id, String(b.text ?? ""), c.actor, isStatus(b.status) ? b.status : undefined, { force: forced(request) });
    return json({ event, task: await tasks().get(id) }, 201);
  });
}
