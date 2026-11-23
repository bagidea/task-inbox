// Renders the PNG icons in public/ from the SVGs (public/icon.svg, public/icon-maskable.svg, brand/*.svg).
//   PLAYWRIGHT=<path to playwright-core> CHROME=<path to a chromium/headless_shell exe> node brand/make-icons.cjs [previewDir]
// Playwright is not a dependency of the app: point PLAYWRIGHT at any install (e.g. a sibling repo's node_modules/playwright-core).
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright-core");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const jobs = [
  ["public/icon.svg", "public/icon-192.png", 192],
  ["public/icon.svg", "public/icon-512.png", 512],
  ["public/icon-maskable.svg", "public/icon-maskable-512.png", 512],
  ["brand/apple-touch.svg", "public/apple-touch-icon.png", 180],
  ["brand/badge.svg", "public/badge-96.png", 96],
];

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  for (const [src, out, size] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${read(src).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(root, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(out, size);
  }
  const previewDir = process.argv[2];
  if (previewDir) {
    // The logo at the sizes people will see it, on light and dark, plus the maskable safe zone.
    const icon = read("public/icon.svg");
    const mask = read("public/icon-maskable.svg");
    const row = (bg, fg) => `<div style="display:flex;align-items:center;gap:24px;padding:24px;background:${bg};color:${fg};font:600 16px system-ui">${[16, 32, 48, 96, 192].map((s) => `<div style="text-align:center">${icon.replace("<svg ", `<svg width="${s}" height="${s}" `)}<div style="font-size:11px;opacity:.6">${s}px</div></div>`).join("")}<div style="text-align:center"><div style="width:192px;height:192px;border-radius:50%;overflow:hidden">${mask.replace("<svg ", '<svg width="192" height="192" ')}</div><div style="font-size:11px;opacity:.6">maskable (circle)</div></div></div>`;
    await page.setViewportSize({ width: 900, height: 560 });
    await page.setContent(`<html><body style="margin:0">${row("#ffffff", "#0b0f14")}${row("#0b0f14", "#f4f6f9")}</body></html>`);
    fs.mkdirSync(previewDir, { recursive: true });
    await page.screenshot({ path: path.join(previewDir, "logo-preview.png"), fullPage: true });
    console.log("preview", path.join(previewDir, "logo-preview.png"));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
