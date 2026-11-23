import { brandingPatch, logoProblem } from "@/lib/branding";
import { forgetBranding, getBranding, publicBranding } from "@/lib/brand-server";
import { fail, handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Anyone (the login page and the manifest show it too): name, short name, title, accent, logo URL. */
export async function GET() {
  return handle(async () => json({ branding: publicBranding(await getBranding()) }));
}

/** Owner/admin: `{name?, shortName?, title?, accent?, logo?}`; "" puts a field back to its default (logo: "" = the built-in logo). */
export async function PATCH(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    if (c.user.role !== "admin") return fail(403, "เฉพาะผู้ดูแล");
    const body = await readJson(request);
    if (typeof body.logo === "string" && logoProblem(body.logo)) return fail(400, logoProblem(body.logo)!);
    let patch;
    try { patch = brandingPatch(body); } catch (e) { return fail(400, (e as Error).message); }
    await getStore().saveBranding({ ...patch, updatedAt: new Date().toISOString(), updatedBy: c.user.name });
    forgetBranding();
    return json({ branding: publicBranding(await getBranding()) });
  });
}
