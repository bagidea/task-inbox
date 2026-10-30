import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { fail, handle, isResponse, json, requireCaller } from "@/lib/server";
import { tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** Multipart `files` (one or many), each up to 30 MB. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return fail(400, "ไม่มีไฟล์");
    for (const f of files) if (f.size > MAX_UPLOAD_BYTES) return fail(413, `ไฟล์ ${f.name} ใหญ่เกิน 30 MB`);
    const svc = tasks();
    const added = [];
    for (const f of files) added.push(await svc.addFile(id, { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }, c.actor));
    return json({ attachments: added, task: await svc.get(id) }, 201);
  });
}
