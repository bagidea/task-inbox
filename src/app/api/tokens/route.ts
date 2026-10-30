import { newApiToken, newId } from "@/lib/auth";
import { fail, handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { getStore } from "@/lib/store";
import type { ApiToken } from "@/lib/types";

export const dynamic = "force-dynamic";

const shown = (t: ApiToken) => ({ id: t.id, name: t.name, prefix: t.prefix, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt });

/** My API tokens (for the CLI / Claude). */
export async function GET(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    return json({ tokens: (await getStore().listTokens(c.user.id)).map(shown) });
  });
}

/** A new token, returned once. */
export async function POST(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    if (c.via !== "cookie") return fail(403, "สร้าง token ได้จากหน้าเว็บเท่านั้น");
    const body = await readJson(request);
    const name = String(body.name ?? "").trim().slice(0, 60) || "CLI";
    const store = getStore();
    if ((await store.listTokens(c.user.id)).length >= 10) return fail(400, "มี token ได้ไม่เกิน 10 ตัว");
    const fresh = newApiToken();
    const t: ApiToken = { id: newId(6), userId: c.user.id, name, hash: fresh.hash, prefix: fresh.prefix, createdAt: new Date().toISOString() };
    await store.saveToken(t);
    return json({ token: fresh.token, info: shown(t) }, 201);
  });
}
