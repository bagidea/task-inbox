/** JSON-file store for a laptop and for tests. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { InboxSettings } from "@/lib/ready";
import type { ApiToken, Task, TaskEvent, TaskFilter, User } from "@/lib/types";
import { applyFilter } from "./filter";
import type { Store } from "./types";

interface Data { users: User[]; tokens: ApiToken[]; tasks: Task[]; events: TaskEvent[]; counter: number; settings?: InboxSettings }

export class MemoryStore implements Store {
  private data: Data = { users: [], tokens: [], tasks: [], events: [], counter: 0 };

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      try { this.data = { ...this.data, ...(JSON.parse(readFileSync(file, "utf8")) as Partial<Data>) }; } catch { /* start empty */ }
    }
  }

  private persist() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  async getUser(id: string) { return this.data.users.find((u) => u.id === id) ?? null; }
  async getUserByEmail(email: string) { const e = email.trim().toLowerCase(); return this.data.users.find((u) => u.email === e) ?? null; }
  async listUsers() { return [...this.data.users].sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  async saveUser(u: User) { this.data.users = [...this.data.users.filter((x) => x.id !== u.id), u]; this.persist(); }
  async countUsers() { return this.data.users.length; }

  async saveToken(t: ApiToken) { this.data.tokens = [...this.data.tokens.filter((x) => x.id !== t.id), t]; this.persist(); }
  async getTokenByHash(hash: string) { return this.data.tokens.find((t) => t.hash === hash) ?? null; }
  async listTokens(userId: string) { return this.data.tokens.filter((t) => t.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  async deleteToken(id: string) { this.data.tokens = this.data.tokens.filter((t) => t.id !== id); this.persist(); }

  async nextTaskNumber() { this.data.counter += 1; this.persist(); return this.data.counter; }
  async getTask(id: string) { return this.data.tasks.find((t) => t.id === id) ?? null; }
  async saveTask(t: Task) { this.data.tasks = [...this.data.tasks.filter((x) => x.id !== t.id), t]; this.persist(); }
  async listTasks(filter: TaskFilter) { return applyFilter(this.data.tasks, filter); }

  async addEvent(e: TaskEvent) { this.data.events.push(e); this.persist(); }
  async listEvents(taskId: string) { return this.data.events.filter((e) => e.taskId === taskId).sort((a, b) => a.at.localeCompare(b.at)); }

  async getSettings() { return this.data.settings ?? null; }
  async saveSettings(s: InboxSettings) { this.data.settings = s; this.persist(); }
}
