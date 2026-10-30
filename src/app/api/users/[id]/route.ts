import { hashPassword, temporaryPassword } from "@/lib/auth";
import { fail, handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { getStore } from "@/lib/store";
import { publicUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Admin: rename, change role, disable / enable, or issue a new temporary password. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    if (c.user.role !== "admin") return fail(403, "เฉพาะผู้ดูแล");
    const { id } = await params;
    const store = getStore();
    const user = await store.getUser(id);
    if (!user) return fail(404, "ไม่พบบัญชี");
    const body = await readJson(request);
    let temp: string | undefined;
    if (typeof body.name === "string" && body.name.trim()) user.name = body.name.trim();
    if (body.role === "admin" || body.role === "member") {
      if (user.id === c.user.id && body.role !== "admin") return fail(400, "ถอดสิทธิ์ผู้ดูแลของตัวเองไม่ได้");
      user.role = body.role;
    }
    if (typeof body.disabled === "boolean") {
      if (user.id === c.user.id && body.disabled) return fail(400, "ปิดบัญชีตัวเองไม่ได้");
      user.disabled = body.disabled;
    }
    if (body.resetPassword === true) {
      temp = temporaryPassword();
      user.passwordHash = hashPassword(temp);
      user.mustChangePassword = true;
    }
    await store.saveUser(user);
    return json({ user: publicUser(user), ...(temp ? { temporaryPassword: temp } : {}) });
  });
}
