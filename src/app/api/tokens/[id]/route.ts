import { fail, handle, isResponse, json, requireCaller } from "@/lib/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const { id } = await params;
    const store = getStore();
    const mine = (await store.listTokens(c.user.id)).find((t) => t.id === id);
    if (!mine) return fail(404, "ไม่พบ token");
    await store.deleteToken(id);
    return json({ ok: true });
  });
}
