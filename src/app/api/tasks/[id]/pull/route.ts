import { jobFolderName, taskMarkdown } from "@/lib/export";
import { systemLabel } from "@/lib/systems";
import { baseUrlOf, handle, isResponse, json, requireCaller } from "@/lib/server";
import { tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/**
 * The CLI takes the task into a job folder: marks it in progress and returns
 * the markdown plus a download URL per attachment.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const svc = tasks();
    const task = await svc.pull(id, c.actor);
    const events = await svc.events(task.id);
    const base = baseUrlOf(request);
    return json({
      task,
      folder: jobFolderName(task),
      markdown: taskMarkdown(task, events, base, systemLabel),
      files: task.attachments.map((a) => ({ id: a.id, name: a.name, size: a.size, type: a.type, url: `${base}/api/tasks/${task.id}/files/${a.id}` })),
    });
  });
}
