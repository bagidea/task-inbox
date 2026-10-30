import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { fail, handle, isResponse, json, readJson, requireCaller } from "@/lib/server";
import { isPriority, isStatus, parseSystems, tasks } from "@/lib/tasks";
import type { Status } from "@/lib/types";

export const dynamic = "force-dynamic";

/** `?status=new,needs_info&system=mira&q=…&limit=50` — or `?ready=1`: the new tasks Claude may take now, most urgent first. */
export async function GET(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const url = new URL(request.url);
    if (url.searchParams.get("ready") === "1") return json({ tasks: await tasks().listReady() });
    const status = (url.searchParams.get("status") ?? "").split(",").map((s) => s.trim()).filter(isStatus) as Status[];
    const systems = parseSystems(url.searchParams.get("system") ?? "");
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200) || 200));
    const list = await tasks().list({ status: status.length ? status : undefined, system: systems[0], q: url.searchParams.get("q") ?? undefined, limit });
    return json({ tasks: list });
  });
}

/**
 * JSON `{title, body, systems, priority}` or multipart (`title`, `body` or a
 * `brief` .md file, `systems`, `priority`, and any number of `files`).
 */
export async function POST(request: Request) {
  return handle(async () => {
    const c = await requireCaller(request);
    if (isResponse(c)) return c;
    const ct = request.headers.get("content-type") || "";
    let title = "", body = "", systemsRaw: unknown = [], priorityRaw: unknown = "normal", statusRaw: unknown = undefined;
    const files: File[] = [];
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      title = String(form.get("title") ?? "");
      body = String(form.get("body") ?? "");
      const brief = form.get("brief");
      if (brief instanceof File && brief.size > 0) body = (await brief.text()) + (body.trim() ? `\n\n${body}` : "");
      systemsRaw = form.getAll("systems").map(String).join(",");
      priorityRaw = form.get("priority") ?? "normal";
      statusRaw = form.get("status") ?? undefined;
      for (const f of form.getAll("files")) if (f instanceof File && f.size > 0) files.push(f);
    } else {
      const j = await readJson(request);
      title = String(j.title ?? ""); body = String(j.body ?? ""); systemsRaw = j.systems; priorityRaw = j.priority ?? "normal"; statusRaw = j.status;
    }
    if (!isPriority(priorityRaw)) return fail(400, "ความเร่งด่วนไม่ถูกต้อง");
    if (statusRaw !== undefined && !isStatus(statusRaw)) return fail(400, "สถานะไม่ถูกต้อง");
    for (const f of files) if (f.size > MAX_UPLOAD_BYTES) return fail(413, `ไฟล์ ${f.name} ใหญ่เกิน 30 MB`);
    const svc = tasks();
    let task = await svc.create({ title, body, systems: parseSystems(systemsRaw), priority: priorityRaw, status: statusRaw }, c.actor);
    for (const f of files) await svc.addFile(task.id, { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }, c.actor);
    if (files.length) task = await svc.get(task.id);
    return json({ task }, 201);
  });
}
