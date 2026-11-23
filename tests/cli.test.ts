import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// The CLI is plain Node ESM served to teammates (with a #! line the test bundler won't load):
// run its pure helpers in a real `node` and compare the JSON.
const CLI = pathToFileURL(resolve(__dirname, "../public/skill/task-inbox/task-inbox.mjs")).href;
function run(expr: string): unknown {
  const code = `import(${JSON.stringify(CLI)}).then((m) => { let out; try { out = { ok: (${expr}) }; } catch (e) { out = { error: e.message }; } process.stdout.write(JSON.stringify(out ?? null)); });`;
  return JSON.parse(execFileSync(process.execPath, ["-e", code], { encoding: "utf8" }));
}
const body = (argv: string[]) => run(`m.waitBody(m.parseArgs(${JSON.stringify(argv)}).opt)`);

describe("CLI flags for ถึงตาใคร", () => {
  it("--wait and --wait-action go into the body as {wait: {who, action}}; Thai or English actions", () => {
    expect(run(`m.parseArgs(["comment","T-12","--text","x","--wait","owner","--as-claude"])`)).toEqual({ ok: { pos: ["comment", "T-12"], opt: { text: "x", wait: "owner", "as-claude": true } } });
    expect(body(["comment", "T-12", "--text", "ขออนุมัติ", "--status", "needs_info", "--wait", "owner", "--wait-action", "อนุมัติ", "--as-claude"])).toEqual({ ok: { wait: { who: "owner", action: "approve" } } });
    expect(body(["report", "T-1", "--wait", "Bob,Alice", "--wait-action", "test"])).toEqual({ ok: { wait: { who: "Bob,Alice", action: "test" } } });
    expect(body(["status", "T-1", "review", "--wait", "auto"])).toEqual({ ok: { wait: { who: "auto" } } });
  });

  it("without the flags nothing is sent (old commands behave as before)", () => {
    expect(body(["comment", "T-12", "--text", "hi"])).toEqual({ ok: {} });
    expect(run(`m.parseArgs(["report","T-1","--link","a=https://x","--link","b=https://y"]).opt.link`)).toEqual({ ok: ["a=https://x", "b=https://y"] });
  });

  it("refuses a flag without a value and unknown actions", () => {
    expect(body(["comment", "T-1", "--wait"])).toMatchObject({ error: expect.stringMatching(/--wait/) });
    expect(body(["comment", "T-1", "--wait", "Alice", "--wait-action", "dance"])).toMatchObject({ error: expect.stringMatching(/--wait-action/) });
    expect(run(`[m.waitAction("ทำ"), m.waitAction("ตอบ"), m.waitAction("ทดสอบ"), m.waitAction("x")]`)).toEqual({ ok: ["do", "answer", "test", null] });
  });

  it("`wait T-12 Alice --action ทดสอบ` uses the positional name and --action", () => {
    expect(run(`(() => { const a = m.parseArgs(["wait","T-12","Alice","--action","ทดสอบ"]); return m.waitBody(a.opt, a.pos[2], a.opt.action); })()`)).toEqual({ ok: { wait: { who: "Alice", action: "test" } } });
  });

  it("importing the CLI does not run a command", () => {
    expect(run(`typeof m.parseArgs`)).toEqual({ ok: "function" });
  });
});
