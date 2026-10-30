import { Board } from "@/components/Board";
import { Shell } from "@/components/Shell";
import { requireUserPage } from "@/lib/page";
import { tasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUserPage();
  const list = await tasks().list({ limit: 500 });
  return (
    <Shell user={user}>
      <Board initialTasks={list} />
    </Shell>
  );
}
