import { decodeLogo } from "@/lib/branding";
import { getBranding } from "@/lib/brand-server";

export const dynamic = "force-dynamic";

/** The workspace logo (favicon, header, install sheet, notifications); the built-in one when none is set. */
export async function GET(request: Request) {
  const b = await getBranding();
  const logo = b.logo ? decodeLogo(b.logo) : null;
  if (!logo) return Response.redirect(new URL("/icon-192.png", request.url), 302);
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "content-type": logo.type,
      "cache-control": "public, max-age=300",
      // An uploaded SVG is shown as a picture only: no scripts, no outside requests.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
