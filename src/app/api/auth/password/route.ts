import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth";
import { fail, handle, isResponse, json, openSession, readJson, requireCaller } from "@/lib/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Change my own password (the temporary one from an admin, or any time). */
export async function POST(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    if (c.via !== "cookie") return fail(403, "เปลี่ยนรหัสผ่านได้จากหน้าเว็บเท่านั้น");
    const body = await readJson(request);
    const current = String(body.current ?? "");
    const next = String(body.next ?? "");
    if (!verifyPassword(current, c.user.passwordHash)) return fail(400, "รหัสผ่านเดิมไม่ถูกต้อง");
    const problem = passwordProblem(next);
    if (problem) return fail(400, problem);
    const user = { ...c.user, passwordHash: hashPassword(next), mustChangePassword: false };
    await getStore().saveUser(user);
    await openSession(user);
    return json({ ok: true });
  });
}
