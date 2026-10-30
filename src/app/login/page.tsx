import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { setupCode } from "@/lib/config";
import { sessionUser } from "@/lib/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await sessionUser()) redirect("/");
  if (setupCode() && (await getStore().countUsers()) === 0) redirect("/setup");
  return <LoginForm />;
}
