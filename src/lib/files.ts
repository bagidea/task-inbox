/** Attachment bytes: a GCS bucket in production, a folder on disk on a laptop. */
import { createReadStream, existsSync, mkdirSync, promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { Storage } from "@google-cloud/storage";
import { fileStoreConfig } from "./config";

export interface FileStore {
  put(path: string, data: Buffer | Uint8Array, contentType: string): Promise<void>;
  /** A web stream of the object, or null when it is gone. */
  get(path: string): Promise<ReadableStream | null>;
  remove(path: string): Promise<void>;
}

class DiskFiles implements FileStore {
  constructor(private readonly dir: string) {}
  private full(path: string) { return join(this.dir, ...path.split("/")); }
  async put(path: string, data: Buffer | Uint8Array) {
    const f = this.full(path);
    mkdirSync(dirname(f), { recursive: true });
    await fs.writeFile(f, data);
  }
  async get(path: string) {
    const f = this.full(path);
    if (!existsSync(f)) return null;
    return Readable.toWeb(createReadStream(f)) as ReadableStream;
  }
  async remove(path: string) { await fs.rm(this.full(path), { force: true }); }
}

class GcsFiles implements FileStore {
  private readonly bucket;
  constructor(bucket: string) { this.bucket = new Storage().bucket(bucket); }
  async put(path: string, data: Buffer | Uint8Array, contentType: string) {
    await this.bucket.file(path).save(Buffer.from(data), { contentType, resumable: false });
  }
  async get(path: string) {
    const file = this.bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    return Readable.toWeb(file.createReadStream()) as ReadableStream;
  }
  async remove(path: string) { await this.bucket.file(path).delete({ ignoreNotFound: true }); }
}

let files: FileStore | null = null;
export function getFiles(): FileStore {
  if (!files) {
    const c = fileStoreConfig();
    files = c.kind === "gcs" ? new GcsFiles(c.bucket) : new DiskFiles(c.dir);
  }
  return files;
}

/** A file name safe for a path segment and for a job folder on Windows. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file";
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim();
  return (cleaned || "file").slice(0, 150);
}

export function objectPath(taskId: string, attachmentId: string, name: string): string {
  return `tasks/${taskId}/${attachmentId}-${safeFileName(name)}`;
}
