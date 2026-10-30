import { hashPassword, newId, passwordProblem } from "@/lib/auth";
import { setupCode } from "@/lib/config";
import { allow, clientKey, fail, handle, json, openSession, readJson, sameOrigin } from "@/lib/server";
import { getStore } from "@/lib/store";
import { publicUser, type User } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Open only while nobody exists: the first admin with the SETUP_CODE from the deploy. */
export async function GET() {
  const store = getStore();
  return json({ open: (await store.countUsers()) === 0 && Boolean(setupCode()) });
}

export async function POST(request: Request) {
  return handle(async () => {
    if (!sameOrigin(request)) return fail(403, "cross-origin");
    if (!allow(`setup:${clientKey(request)}`, 5, 600_000)) return fail(429, "ลองใหม่ภายหลัง");
    const store = getStore();
    const code = setupCode();
    if (!code || (await store.countUsers()) > 0) return fail(403, "ตั้งค่าไปแล้ว");
    const body = await readJson(request);
    if (String(body.code ?? "") !== code) return fail(403, "รหัสตั้งค่าไม่ถูกต้อง");
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "อีเมลไม่ถูกต้อง");
    if (!name) return fail(400, "ต้องมีชื่อ");
    const problem = passwordProblem(password);
    if (problem) return fail(400, problem);
    const user: User = { id: newId(), email, name, role: "admin", passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    await store.saveUser(user);
    await openSession(user);
    return json({ user: publicUser(user) });
  });
}
