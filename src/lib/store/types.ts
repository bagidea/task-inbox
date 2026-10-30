import type { InboxSettings } from "@/lib/ready";
import type { ApiToken, Task, TaskEvent, TaskFilter, User } from "@/lib/types";

export interface Store {
  // users
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  saveUser(u: User): Promise<void>;
  countUsers(): Promise<number>;
  // tokens
  saveToken(t: ApiToken): Promise<void>;
  getTokenByHash(hash: string): Promise<ApiToken | null>;
  listTokens(userId: string): Promise<ApiToken[]>;
  deleteToken(id: string): Promise<void>;
  // tasks
  nextTaskNumber(): Promise<number>;
  getTask(id: string): Promise<Task | null>;
  saveTask(t: Task): Promise<void>;
  listTasks(filter: TaskFilter): Promise<Task[]>;
  // events
  addEvent(e: TaskEvent): Promise<void>;
  listEvents(taskId: string): Promise<TaskEvent[]>;
  // settings (one document)
  getSettings(): Promise<Partial<InboxSettings> | null>;
  saveSettings(s: InboxSettings): Promise<void>;
}
