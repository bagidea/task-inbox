"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { PublicUser } from "@/lib/types";
import { api } from "@/lib/ui";
import { useInboxConfig } from "./config";

export function Logo({ className = "" }: { className?: string }) {
  const { name } = useInboxConfig();
  return (
    <span className={`display inline-flex items-center gap-2 ${className}`}>
      <span className="grid size-8 place-items-center rounded-xl bg-lime text-ink text-sm font-bold">{name.trim().charAt(0).toUpperCase() || "T"}</span>
      <span className="text-paper">{name}</span>
    </span>
  );
}

export function Shell({ user, children, wide = false }: { user: PublicUser; children: ReactNode; wide?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const nav = [
    { href: "/", label: "งาน", on: path === "/" || path.startsWith("/t/") },
    { href: "/new", label: "สร้างงาน", on: path === "/new" },
    { href: "/settings", label: "ตั้งค่า", on: path.startsWith("/settings") },
  ];
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/85 backdrop-blur">
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 ${wide ? "max-w-7xl" : "max-w-5xl"}`}>
          <Link href="/" className="shrink-0"><Logo /></Link>
          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            {nav.map((n) => <Link key={n.href} href={n.href} className={`tab ${n.on ? "tab-on" : ""}`}>{n.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/new" className="btn btn-lime btn-sm sm:hidden">+ งาน</Link>
            <span className="hidden text-sm text-mist md:inline">{user.name}</span>
            <button type="button" onClick={logout} className="btn btn-ghost btn-sm">ออก</button>
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 pb-24 pt-6 ${wide ? "max-w-7xl" : "max-w-5xl"}`}>{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-ink/95 backdrop-blur sm:hidden">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={`flex-1 py-3 text-center text-sm font-semibold ${n.on ? "text-lime" : "text-mist"}`}>{n.label}</Link>
        ))}
      </nav>
    </div>
  );
}
