import { redirect } from "next/navigation";
import { SetupForm } from "@/components/SetupForm";
import { setupCode } from "@/lib/config";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!setupCode() || (await getStore().countUsers()) > 0) redirect("/login");
  return <SetupForm />;
}
