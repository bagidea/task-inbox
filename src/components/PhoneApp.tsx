"use client";
/**
 * The inbox as an app on phones and computers: "ติดตั้งแอป / เพิ่มไปหน้าจอหลัก"
 * (Chrome / Edge / Android: the browser's own install prompt; iPhone and the
 * rest: a short how-to). Hidden once it already runs as an installed app.
 * Everything here runs only in the browser.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Mark, useBrand } from "./Brand";

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

// Android Chrome fires this once, early; keep it until the person taps the button.
let deferred: InstallEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; installedNow = true; emit(); });
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export type Browser = "chrome" | "edge" | "safari" | "firefox" | "samsung" | "other";
export interface PhoneEnv { ios: boolean; android: boolean; desktop: boolean; browser: Browser; standalone: boolean; canPrompt: boolean; installed: boolean }
const SERVER_ENV: PhoneEnv = { ios: false, android: false, desktop: false, browser: "other", standalone: false, canPrompt: false, installed: false };

export function browserOf(ua: string): Browser {
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg(e|A|iOS)?\//.test(ua)) return "edge";
  if (/Firefox|FxiOS/.test(ua)) return "firefox";
  if (/Chrome|CriOS|Chromium/.test(ua)) return "chrome";
  if (/Safari/.test(ua)) return "safari";
  return "other";
}
let cached: PhoneEnv = SERVER_ENV;
function snapshot(): PhoneEnv {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const android = /Android/i.test(ua);
  const next: PhoneEnv = {
    ios,
    android,
    desktop: !ios && !android,
    browser: browserOf(ua),
    standalone,
    canPrompt: deferred !== null,
    installed: standalone || installedNow,
  };
  if (JSON.stringify(next) !== JSON.stringify(cached)) cached = next;
  return cached;
}
export const usePhone = (): PhoneEnv => useSyncExternalStore(subscribe, snapshot, () => SERVER_ENV);

/** Registers /sw.js once per page load (needed for the install prompt on some browsers). */
export function PwaBoot() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

/** Header button on phones and computers; hidden once the inbox runs as an installed app. */
export function InstallButton({ className = "btn btn-ghost btn-sm", label }: { className?: string; label?: string }) {
  const env = usePhone();
  const [sheet, setSheet] = useState(false);
  if (env.installed) return null;
  async function install() {
    if (deferred) {
      const e = deferred;
      deferred = null; emit();
      await e.prompt();
      await e.userChoice.catch(() => null);
      return;
    }
    setSheet(true);
  }
  const text = label ?? (env.desktop ? "ติดตั้งแอป" : "ติดตั้ง");
  return (
    <>
      <button type="button" onClick={install} className={className} aria-label="ติดตั้งแอป / เพิ่มไปหน้าจอหลัก" title="ติดตั้งแอป / เพิ่มไปหน้าจอหลัก">
        <InstallIcon /><span className={label ? "" : "max-[359px]:hidden"}>{text}</span>
      </button>
      {sheet && <InstallSheet env={env} onClose={() => setSheet(false)} />}
    </>
  );
}

const InstallIcon = () => (
  <svg viewBox="0 0 24 24" className="inline size-4 shrink-0 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>
);

/** The how-to for browsers without an install prompt (iPhone, Safari, Firefox) or when the prompt was already used. */
export function installSteps(env: Pick<PhoneEnv, "ios" | "android" | "desktop" | "browser">, name: string): ReactNode[] {
  if (env.ios) return [
    <>กดปุ่ม <b>แชร์</b> <ShareIcon /> ของ Safari (แถบล่าง หรือมุมขวาบนบน iPad)</>,
    <>เลื่อนลงแล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม</b> (Add to Home Screen) แล้วกด <b>เพิ่ม</b></>,
    <>เปิด <b>{name}</b> จากไอคอนบนหน้าจอ</>,
  ];
  if (env.android) return [
    <>กดเมนู <b>⋮</b> มุมขวาบนของเบราว์เซอร์</>,
    <>เลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b></>,
    <>เปิดจากไอคอนบนหน้าจอได้เลย</>,
  ];
  if (env.browser === "safari") return [
    <>บน Mac: เมนู <b>ไฟล์ (File) → เพิ่มลงใน Dock (Add to Dock)</b> (Safari 17 ขึ้นไป)</>,
    <>เปิด <b>{name}</b> จาก Dock หรือ Launchpad</>,
  ];
  if (env.browser === "firefox") return [
    <>Firefox ยังติดตั้งเว็บเป็นแอปไม่ได้ เปิดลิงก์นี้ใน <b>Chrome</b> หรือ <b>Edge</b> แล้วกด ติดตั้งแอป อีกครั้ง</>,
    <>หรือใช้ต่อใน Firefox ได้เลย</>,
  ];
  return [
    <>กดไอคอน <b>ติดตั้ง</b> <InstallIcon /> ที่ท้ายช่องที่อยู่ (address bar) หรือเมนู <b>⋮</b> / <b>⋯</b> ของเบราว์เซอร์</>,
    <>Chrome: <b>บันทึกและแชร์ → ติดตั้งหน้าเว็บเป็นแอป</b> · Edge: <b>แอป → ติดตั้งไซต์นี้เป็นแอป</b></>,
    <>เปิดจากไอคอนบนเดสก์ท็อป/ทาสก์บาร์ได้เลย</>,
  ];
}

// Portalled to <body>: the sticky header's backdrop blur would otherwise trap the fixed sheet inside it.
export function InstallSheet({ env, onClose }: { env: Pick<PhoneEnv, "ios" | "android" | "desktop" | "browser">; onClose: () => void }) {
  const b = useBrand();
  const steps = installSteps(env, b.name);
  return createPortal(
    <div className={`fixed inset-0 z-50 flex bg-ink/70 backdrop-blur-sm ${env.desktop ? "items-center justify-center p-4" : "items-end"}`} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={`card w-full p-5 ${env.desktop ? "max-w-md" : "rounded-b-none pb-8"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {b.hasLogo ? <img src={b.logoUrl} alt="" className="size-12 shrink-0 rounded-xl object-contain" /> : <Mark className="size-12 shrink-0" />}
          <div className="min-w-0">
            <div className="display text-lg">{env.desktop ? `ติดตั้ง ${b.name} เป็นแอป` : `เพิ่ม ${b.name} ไปหน้าจอหลัก`}</div>
            <div className="text-sm text-mist">เปิดได้เหมือนแอป มีหน้าต่างและไอคอนของตัวเอง</div>
          </div>
        </div>
        <ol className="mt-4 space-y-3 text-sm">
          {steps.map((step, i) => <li key={i} className="flex gap-3"><Step n={i + 1} /><span>{step}</span></li>)}
        </ol>
        <button type="button" className="btn btn-lime mt-5 w-full" onClick={onClose}>เข้าใจแล้ว</button>
      </div>
    </div>,
    document.body,
  );
}

const Step = ({ n }: { n: number }) => <span className="grid size-6 shrink-0 place-items-center rounded-full bg-lime text-xs font-bold text-[var(--color-on-accent,#0b0f14)]">{n}</span>;
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="inline size-4 align-[-2px] text-sky" fill="none" stroke="currentColor" strokeWidth="2" aria-label="แชร์"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
);

/** Settings card: install this inbox as an app on this device (or say it already is). */
export function InstallCard() {
  const env = usePhone();
  const b = useBrand();
  return (
    <div className="card space-y-3 p-5">
      <div>
        <h2 className="font-semibold">📲 ติดตั้งแอป / เพิ่มไปหน้าจอหลัก</h2>
        <p className="mt-1 text-sm text-mist">ติดตั้ง {b.name} ลงมือถือหรือคอม เปิดได้จากไอคอนเหมือนแอปทั่วไป</p>
      </div>
      {env.installed ? (
        <span className="pill bg-mint/15 text-mint">เปิดจากแอปที่ติดตั้งแล้ว ✓</span>
      ) : (
        <InstallButton className="btn btn-lime" label={env.desktop ? "ติดตั้งแอปบนเครื่องนี้" : "เพิ่มไปหน้าจอหลัก"} />
      )}
    </div>
  );
}
