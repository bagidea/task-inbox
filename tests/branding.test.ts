import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, brandingPatch, defaultBranding, logoProblem, onAccent, resolveBranding } from "@/lib/branding";
import { MemoryStore } from "@/lib/store/memory";

const png = `data:image/png;base64,${Buffer.from("not really a png").toString("base64")}`;

describe("หน้าตาแอป (branding)", () => {
  it("defaults to Task Inbox with the built-in logo; INBOX_NAME only changes the default name", () => {
    expect(defaultBranding({})).toEqual({ name: "Task Inbox", shortName: "Task Inbox", title: "Task Inbox", accent: DEFAULT_ACCENT, logo: "" });
    const w = defaultBranding({ INBOX_NAME: "Acme Task Inbox" });
    expect(w.name).toBe("Acme Task Inbox");
    expect(w.title).toBe("Acme Task Inbox");
    expect(w.shortName).toBe("Task Inbox");
    expect(resolveBranding(null, {})).toMatchObject({ name: "Task Inbox", logo: "" });
  });

  it("stored values win over the defaults; a renamed inbox gets a matching title and short name; broken values fall back", () => {
    expect(resolveBranding({ name: "Acme" }, {})).toMatchObject({ name: "Acme", shortName: "Acme", title: "Acme" });
    expect(resolveBranding({ name: "Acme", title: "Acme · งาน", shortName: "ACME", accent: "#FF5A5F", logo: png }, {})).toMatchObject({ title: "Acme · งาน", shortName: "ACME", accent: "#ff5a5f", logo: png });
    expect(resolveBranding({ name: "", accent: "lime", logo: "javascript:alert(1)" }, { INBOX_NAME: "Team" })).toMatchObject({ name: "Team", accent: DEFAULT_ACCENT, logo: "" });
  });

  it("checks what an admin sends: colours as #rrggbb, logos as small PNG/JPG/WebP/SVG data URLs; empty = back to default", () => {
    expect(brandingPatch({ name: "  Acme  ", accent: "#C8F135" })).toEqual({ name: "Acme", accent: "#c8f135" });
    expect(brandingPatch({ name: "", logo: "" })).toEqual({ name: "", logo: "" });
    expect(() => brandingPatch({ accent: "red" })).toThrow();
    expect(() => brandingPatch({ logo: "data:text/html;base64,PGgxPg==" })).toThrow();
    expect(logoProblem(png)).toBeNull();
    expect(logoProblem(`data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`)).toBeNull();
    expect(logoProblem(`data:image/png;base64,${"A".repeat(300 * 1024)}`)).toMatch(/200 KB/);
  });

  it("text on the accent stays readable", () => {
    expect(onAccent("#c8f135")).toBe("#0b0f14");
    expect(onAccent("#1d3557")).toBe("#ffffff");
  });

  it("is kept by the store as one document, merged field by field", async () => {
    const store = new MemoryStore();
    expect(await store.getBranding()).toBeNull();
    await store.saveBranding({ name: "Acme" });
    await store.saveBranding({ accent: "#ff5a5f" });
    expect(await store.getBranding()).toEqual({ name: "Acme", accent: "#ff5a5f" });
  });
});
