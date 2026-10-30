import { NewTask } from "@/components/NewTask";
import { Shell } from "@/components/Shell";
import { requireUserPage } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const user = await requireUserPage();
  return (
    <Shell user={user}>
      <NewTask />
    </Shell>
  );
}
