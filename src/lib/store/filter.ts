import type { Task, TaskFilter } from "@/lib/types";

/** The in-memory half of a task query, shared by both stores: text search, system, order, limit. */
export function applyFilter(tasks: Task[], filter: TaskFilter): Task[] {
  const q = (filter.q ?? "").trim().toLowerCase();
  let list = tasks;
  if (filter.status?.length) list = list.filter((t) => filter.status!.includes(t.status));
  if (filter.system) list = list.filter((t) => t.systems.includes(filter.system!));
  if (q) list = list.filter((t) => t.id.toLowerCase() === q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q) || t.createdBy.name.toLowerCase().includes(q));
  list = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return filter.limit ? list.slice(0, filter.limit) : list;
}
