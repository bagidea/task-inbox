import { taskMarkdown } from "@/lib/export";
import { systemLabel } from "@/lib/systems";
import { baseUrlOf, handle, isResponse, requireCaller } from "@/lib/server";
import { tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** The task as `task.md` (no side effects). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const task = await tasks().get(id);
    const events = await tasks().events(task.id);
    const md = taskMarkdown(task, events, baseUrlOf(request), systemLabel);
    return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${task.id}.md"`, "cache-control": "no-store" } }) as never;
  });
}
