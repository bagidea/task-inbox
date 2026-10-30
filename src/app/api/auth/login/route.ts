import { verifyPassword } from "@/lib/auth";
import { allow, clientKey, fail, handle, json, openSession, readJson, sameOrigin } from "@/lib/server";
import { getStore } from "@/lib/store";
import { publicUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    if (!sameOrigin(request)) return fail(403, "cross-origin");
    if (!allow(`login:${clientKey(request)}`, 10, 300_000)) return fail(429, "ลองผิดหลายครั้ง รอสักครู่แล้วลองใหม่");
    const body = await readJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const user = email ? await getStore().getUserByEmail(email) : null;
    if (!user || user.disabled || !verifyPassword(password, user.passwordHash)) return fail(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    await openSession(user);
    return json({ user: publicUser(user) });
  });
}
