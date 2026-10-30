import { caller, json } from "@/lib/server";
import { publicUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const c = await caller(request);
  return json({ user: c ? publicUser(c.user) : null, via: c?.via ?? null });
}
