import { dataStoreKind } from "@/lib/config";
import { FirestoreStore } from "./firestore";
import { MemoryStore } from "./memory";
import type { Store } from "./types";

let store: Store | null = null;

/** The one store for this process. */
export function getStore(): Store {
  if (!store) store = dataStoreKind() === "memory" ? new MemoryStore(process.env.INBOX_DATA_FILE || ".data/inbox-db.json") : new FirestoreStore();
  return store;
}

export type { Store };
