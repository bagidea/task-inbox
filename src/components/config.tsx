"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { SystemDef } from "@/lib/types";

export interface InboxConfig { name: string; systems: SystemDef[] }

const Ctx = createContext<InboxConfig>({ name: "Task Inbox", systems: [] });

/** The server layout reads `INBOX_NAME` / `INBOX_SYSTEMS` once per request and hands them to every client component here. */
export const InboxConfigProvider = ({ value, children }: { value: InboxConfig; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export const useInboxConfig = () => useContext(Ctx);
export function useSystemLabel(): (key: string) => string {
  const { systems } = useInboxConfig();
  return (key) => systems.find((s) => s.key === key)?.label ?? key;
}
