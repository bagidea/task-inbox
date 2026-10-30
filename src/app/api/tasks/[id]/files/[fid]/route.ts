import { handle, isResponse, json, requireCaller } from "@/lib/server";
import { tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string; fid: string }> };

const INLINE = /^(image\/|text\/|application\/pdf)/;

export async function GET(request: Request, { params }: P) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id, fid } = await params;
    const { attachment, stream } = await tasks().file(id, fid);
    const disposition = `${INLINE.test(attachment.type) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`;
    return new Response(stream, { headers: { "content-type": attachment.type, "content-length": String(attachment.size), "content-disposition": disposition, "cache-control": "private, max-age=60" } }) as never;
  });
}

export async function DELETE(request: Request, { params }: P) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id, fid } = await params;
    await tasks().removeFile(id, fid, c.actor);
    return json({ task: await tasks().get(id) });
  });
}
