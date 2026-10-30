import type { Metadata, Viewport } from "next";
import { Anuphan, Space_Grotesk } from "next/font/google";
import { InboxConfigProvider } from "@/components/config";
import { inboxName, systemDefs } from "@/lib/systems";
import "./globals.css";

const anuphan = Anuphan({ variable: "--font-anuphan", subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], weight: ["500", "700"] });

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: inboxName(),
    description: "ส่งงานให้ทีมพัฒนา: งานใหม่, ไฟล์แนบ, สถานะ และสรุปผล ในที่เดียว — Claude Code รับงานไปทำแล้วรายงานกลับ",
  };
}

export const viewport: Viewport = { themeColor: "#0b0f14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${anuphan.variable} ${grotesk.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <InboxConfigProvider value={{ name: inboxName(), systems: systemDefs() }}>{children}</InboxConfigProvider>
      </body>
    </html>
  );
}
