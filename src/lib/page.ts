/** Server-component helpers: who is signed in, or where to send them. */
import { redirect } from "next/navigation";
import { setupCode } from "./config";
import { sessionUser } from "./server";
import { getStore } from "./store";
import { publicUser, type PublicUser } from "./types";

export async function requireUserPage(): Promise<PublicUser> {
  const user = await sessionUser();
  if (user) return publicUser(user);
  if (setupCode() && (await getStore().countUsers()) === 0) redirect("/setup");
  redirect("/login");
}
