/** Runtime configuration, read when asked for (never at build time). */

export const isProd = () => process.env.NODE_ENV === "production";
export const isDevMode = () => process.env.INBOX_DEV_MODE === "true" && !isProd();

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET || (isProd() ? "" : "dev-only-task-inbox-secret");
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

/** One-time code that opens /setup while no user exists. Empty = setup closed. */
export const setupCode = () => process.env.SETUP_CODE || (isDevMode() ? "setup" : "");

/** Where attachments live: a GCS bucket, or a folder on disk in dev. */
export function fileStoreConfig(): { kind: "gcs"; bucket: string } | { kind: "disk"; dir: string } {
  const bucket = process.env.GCS_BUCKET;
  if (bucket) return { kind: "gcs", bucket };
  return { kind: "disk", dir: process.env.INBOX_FILES_DIR || ".data/files" };
}

export function dataStoreKind(): "firestore" | "memory" {
  if (process.env.DATA_STORE === "memory") return "memory";
  if (process.env.DATA_STORE === "firestore") return "firestore";
  return isDevMode() ? "memory" : "firestore";
}

/** Biggest single upload (Cloud Run takes 32 MB per request). */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** Where this inbox is reachable, for links in exports. Empty = taken from the request. */
export const publicBaseUrl = () => (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
