import type { Metadata, Viewport } from "next";
import { Anuphan, Space_Grotesk } from "next/font/google";
import type { CSSProperties } from "react";
import { BrandProvider } from "@/components/Brand";
import { InboxConfigProvider } from "@/components/config";
import { accentShade, onAccent } from "@/lib/branding";
import { getBranding, publicBranding } from "@/lib/brand-server";
import { systemDefs } from "@/lib/systems";
import "./globals.css";

const anuphan = Anuphan({ variable: "--font-anuphan", subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], weight: ["500", "700"] });

/** Title, app name and icons follow the workspace branding (Settings › หน้าตาแอป; INBOX_NAME is only the default name). */
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  const icon = b.logo ? `/brand/icon?v=${encodeURIComponent(b.updatedAt ?? "1")}` : "/icon.svg";
  return {
    title: b.title,
    description: `${b.name}: ส่งงานให้ทีมพัฒนา งานใหม่ ไฟล์แนบ สถานะ ใครต้องทำอะไรต่อ และสรุปผล ในที่เดียว — Claude Code รับงานไปทำแล้วรายงานกลับ`,
    applicationName: b.name,
    appleWebApp: { capable: true, title: b.shortName, statusBarStyle: "black" },
    icons: { icon, apple: b.logo ? icon : "/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = { themeColor: "#0b0f14", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const b = await getBranding();
  const style = { "--color-lime": b.accent, "--color-lime-2": accentShade(b.accent), "--color-on-accent": onAccent(b.accent) } as CSSProperties;
  return (
    <html lang="th" className={`${anuphan.variable} ${grotesk.variable} h-full`} style={style}>
      <body className="min-h-full flex flex-col">
        <BrandProvider value={publicBranding(b)}>
          <InboxConfigProvider value={{ name: b.name, systems: systemDefs() }}>{children}</InboxConfigProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
