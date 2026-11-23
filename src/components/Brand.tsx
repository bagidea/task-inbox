"use client";
/** The workspace branding in the browser (name, accent, logo), handed down from the root layout. */
import { createContext, useContext, type ReactNode } from "react";
import type { PublicBranding } from "@/lib/brand-server";

const FALLBACK: PublicBranding = { name: "Task Inbox", shortName: "Task Inbox", title: "Task Inbox", accent: "#c8f135", hasLogo: false, logoUrl: "/icon.svg" };
const Ctx = createContext<PublicBranding>(FALLBACK);

export function BrandProvider({ value, children }: { value: PublicBranding; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBrand = () => useContext(Ctx);

/** The built-in Task Inbox mark: an inbox tray with a check, drawn in the accent colour. */
export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--color-lime)" />
      <path d="M12 35h11.5l3.5 5h10l3.5-5H52v9a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z" fill="var(--color-on-accent, #0b0f14)" />
      <path d="M22 22.5l6.5 6.5L42 15.5" fill="none" stroke="var(--color-on-accent, #0b0f14)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Header / login logo: the uploaded one, or the built-in mark, and the app name. */
export function Logo({ className = "", compactName = false }: { className?: string; compactName?: boolean }) {
  const b = useBrand();
  return (
    <span className={`display inline-flex min-w-0 items-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {b.hasLogo ? <img src={b.logoUrl} alt="" className="size-8 shrink-0 rounded-xl object-contain" /> : <Mark className="size-8 shrink-0" />}
      <span className={`truncate text-paper ${compactName ? "max-[400px]:hidden" : ""}`}>{b.name}</span>
    </span>
  );
}
