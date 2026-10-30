import { headers } from "next/headers";
import { Settings } from "@/components/Settings";
import { Shell } from "@/components/Shell";
import { publicBaseUrl } from "@/lib/config";
import { requireUserPage } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUserPage();
  const sp = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3300";
  const base = publicBaseUrl() || `${h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  return (
    <Shell user={user}>
      <Settings user={user} baseUrl={base} changePasswordFirst={sp.changePassword === "1" || Boolean(user.mustChangePassword)} />
    </Shell>
  );
}
