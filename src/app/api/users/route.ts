import { hashPassword, newId, temporaryPassword } from "@/lib/auth";
import { fail, handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { getStore } from "@/lib/store";
import { publicUser, type User } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Admin: the team. */
export async function GET(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    if (c.user.role !== "admin") return fail(403, "เฉพาะผู้ดูแล");
    return json({ users: (await getStore().listUsers()).map(publicUser) });
  });
}

/** Admin: a new account with a temporary password, shown once, to hand over in person. */
export async function POST(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    if (c.user.role !== "admin") return fail(403, "เฉพาะผู้ดูแล");
    const body = await readJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const role = body.role === "admin" ? "admin" : "member";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "อีเมลไม่ถูกต้อง");
    if (!name) return fail(400, "ต้องมีชื่อ");
    const store = getStore();
    if (await store.getUserByEmail(email)) return fail(409, "อีเมลนี้มีบัญชีแล้ว");
    const password = temporaryPassword();
    const user: User = { id: newId(), email, name, role, passwordHash: hashPassword(password), createdAt: new Date().toISOString(), mustChangePassword: true };
    await store.saveUser(user);
    return json({ user: publicUser(user), temporaryPassword: password }, 201);
  });
}
