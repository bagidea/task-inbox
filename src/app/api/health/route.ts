import { dataStoreKind, fileStoreConfig, setupCode } from "@/lib/config";
import { json } from "@/lib/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** What is configured, never the values. */
export async function GET() {
  let users: number | null = null;
  try { users = await getStore().countUsers(); } catch { users = null; }
  const files = fileStoreConfig();
  return json({
    ok: users !== null,
    store: dataStoreKind(),
    files: files.kind === "gcs" ? `gcs:${files.bucket}` : "disk",
    users,
    setupOpen: users === 0 && Boolean(setupCode()),
    sessionSecret: Boolean(process.env.SESSION_SECRET),
  });
}
