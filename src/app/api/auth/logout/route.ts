import { closeSession, json } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST() {
  await closeSession();
  return json({ ok: true });
}
