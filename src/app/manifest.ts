import type { MetadataRoute } from "next";
import { getBranding } from "@/lib/brand-server";

// Read on every request: the name, colours and icon come from Settings › หน้าตาแอป.
export const dynamic = "force-dynamic";

/** Lets phones and computers install the inbox (and, on iPhone, is what makes notifications possible). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getBranding();
  const custom = b.logo ? `/brand/icon?v=${encodeURIComponent(b.updatedAt ?? "1")}` : "";
  const type = b.logo ? /^data:([^;]+);/.exec(b.logo)?.[1] : undefined;
  return {
    id: "/",
    name: b.name,
    short_name: b.shortName,
    description: `${b.name}: ส่งงานให้ทีม ดูว่าใครต้องทำอะไรต่อ และรับแจ้งเตือนเมื่องานมีความเคลื่อนไหว`,
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    icons: custom
      ? [{ src: custom, sizes: type === "image/svg+xml" ? "any" : "512x512", type, purpose: "any" }]
      : [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
  };
}
