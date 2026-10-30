import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { TaskView } from "@/components/TaskView";
import { requireUserPage } from "@/lib/page";
import { tasks } from "@/lib/tasks";
import type { Task, TaskEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

async function load(id: string): Promise<{ task: Task; events: TaskEvent[] } | null> {
  try {
    const task = await tasks().get(id);
    return { task, events: await tasks().events(task.id) };
  } catch {
    return null;
  }
}

export default async function TaskPage({ params }: PageProps<"/t/[id]">) {
  const user = await requireUserPage();
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  return (
    <Shell user={user} wide>
      <TaskView initialTask={data.task} initialEvents={data.events} user={user} />
    </Shell>
  );
}
