import { handle, isResponse, json, requireCaller } from "@/lib/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Everyone signed in: the active team (id + name only), for the "ถึงตาใคร" picker. */
export async function GET(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const users = (await getStore().listUsers()).filter((u) => !u.disabled).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return json({ users: users.map((u) => ({ id: u.id, name: u.name })) });
  });
}
