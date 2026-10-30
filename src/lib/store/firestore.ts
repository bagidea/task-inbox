/**
 * Firestore (Admin SDK): project `FIREBASE_PROJECT_ID`, database
 * `FIRESTORE_DATABASE_ID` (or the default one). Collections: users, tokens, tasks, tasks/{id}/events, meta (counters, settings).
 * Queries filter on one field at most, so no composite index is needed.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { InboxSettings } from "@/lib/ready";
import type { ApiToken, Task, TaskEvent, TaskFilter, User } from "@/lib/types";
import { applyFilter } from "./filter";
import type { Store } from "./types";

function app() {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  return initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
}

export class FirestoreStore implements Store {
  private readonly db: Firestore;

  constructor() {
    const databaseId = process.env.FIRESTORE_DATABASE_ID;
    this.db = databaseId ? getFirestore(app(), databaseId) : getFirestore(app());
    try { this.db.settings({ ignoreUndefinedProperties: true }); } catch { /* already configured */ }
  }

  private users() { return this.db.collection("users") as FirebaseFirestore.CollectionReference<User>; }
  private tokens() { return this.db.collection("tokens") as FirebaseFirestore.CollectionReference<ApiToken>; }
  private tasks() { return this.db.collection("tasks") as FirebaseFirestore.CollectionReference<Task>; }
  private events(taskId: string) { return this.tasks().doc(taskId).collection("events") as FirebaseFirestore.CollectionReference<TaskEvent>; }

  async getUser(id: string) { const d = await this.users().doc(id).get(); return d.exists ? d.data()! : null; }
  async getUserByEmail(email: string) {
    const s = await this.users().where("email", "==", email.trim().toLowerCase()).limit(1).get();
    return s.empty ? null : s.docs[0].data();
  }
  async listUsers() { const s = await this.users().get(); return s.docs.map((d) => d.data()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  async saveUser(u: User) { await this.users().doc(u.id).set(u); }
  async countUsers() { const s = await this.users().count().get(); return s.data().count; }

  async saveToken(t: ApiToken) { await this.tokens().doc(t.id).set(t); }
  async getTokenByHash(hash: string) { const s = await this.tokens().where("hash", "==", hash).limit(1).get(); return s.empty ? null : s.docs[0].data(); }
  async listTokens(userId: string) { const s = await this.tokens().where("userId", "==", userId).get(); return s.docs.map((d) => d.data()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  async deleteToken(id: string) { await this.tokens().doc(id).delete(); }

  async nextTaskNumber() {
    const ref = this.db.collection("meta").doc("counters");
    return this.db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      const n = ((d.data()?.task as number | undefined) ?? 0) + 1;
      tx.set(ref, { task: n }, { merge: true });
      return n;
    });
  }
  async getTask(id: string) { const d = await this.tasks().doc(id).get(); return d.exists ? d.data()! : null; }
  async saveTask(t: Task) { await this.tasks().doc(t.id).set(t); }
  async listTasks(filter: TaskFilter) {
    // The inbox is small (hundreds of tasks): one status filter in the query, the rest here.
    let q: FirebaseFirestore.Query<Task> = this.tasks();
    if (filter.status?.length === 1) q = q.where("status", "==", filter.status[0]);
    else if (filter.status?.length) q = q.where("status", "in", filter.status.slice(0, 30));
    const s = await q.get();
    return applyFilter(s.docs.map((d) => d.data()), { ...filter, status: undefined });
  }

  async addEvent(e: TaskEvent) { await this.events(e.taskId).doc(e.id).set(e); }
  async listEvents(taskId: string) { const s = await this.events(taskId).orderBy("at").get(); return s.docs.map((d) => d.data()); }

  async getSettings() { const d = await this.db.collection("meta").doc("settings").get(); return d.exists ? (d.data() as Partial<InboxSettings>) : null; }
  async saveSettings(s: InboxSettings) { await this.db.collection("meta").doc("settings").set(s, { merge: true }); }
}
