// Capture the hand lab (scripts/hand-lab.html) headless as a PNG filmstrip,
// and optionally dump the poses as JSON for geometric checks.
//
//   node scripts/hand-lab-capture.mjs --scenario path/to/S01.json --out S01.png \
//        [--beats 0,0.25,0.5] [--from 0 --to 4 --dt 0.125] [--kw 40] [--json poses.json]
//        [--speed 0.5] [--frozen] [--waiting] [--since 0.4] [--sinces 0,0.1,0.2] [--ahead 4] [--reduced] [--cols 2]
//        [--kh 160 --bed 215]   (key/bed heights in px; default 4.8·kw / 6.3·kw) [--mask] (the app's fade into the rail)
//
// --json writes { scenario, speed, clockKey, frozen, waiting, kw, poses: [{ beat, t, left, right }] },
// which scripts/hand-lab-lint.mjs reads directly.
//
// Needs the dev server (npm run dev) on http://127.0.0.1:5188 and the
// Playwright Chromium already present in ~/Library/Caches/ms-playwright.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((list, a, i, all) => {
    if (a.startsWith("--")) list.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
    return list;
  }, []),
);
if (!args.scenario || !args.out) {
  console.error("usage: --scenario file.json --out file.png [--beats a,b,c | --from --to --dt] [--kw 34] [--json poses.json]");
  process.exit(2);
}
function findChrome() {
  if (process.env.EXE) return process.env.EXE;
  const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
  for (const dir of fs.readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
    const exe = path.join(base, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    if (fs.existsSync(exe)) return exe;
  }
  throw Error("No Playwright Chromium found; set EXE=/path/to/chrome");
}
const scenario = JSON.parse(fs.readFileSync(args.scenario, "utf8"));
const params = new URLSearchParams();
params.set("json", JSON.stringify(scenario));
if (args.beats) params.set("beats", args.beats);
if (args.from) params.set("from", args.from);
if (args.to) params.set("to", args.to);
if (args.dt) params.set("dt", args.dt);
if (args.kw) params.set("kw", args.kw);
for (const name of ["speed", "since", "sinces", "ahead", "cols", "kh", "bed"]) if (args[name]) params.set(name, args[name]);
for (const name of ["frozen", "waiting", "reduced", "mask"]) if (args[name]) params.set(name, "1");
const url = `http://127.0.0.1:5188/scripts/hand-lab.html?${params}`;
const browser = await chromium.launch({ executablePath: findChrome() });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(url);
await page.waitForSelector("body[data-ready]", { timeout: 20000 });
await page.waitForTimeout(150);
await page.screenshot({ path: args.out, fullPage: true });
if (args.json) {
  const dump = await page.evaluate(() => {
    const { poses, scenario, speed, clockKey, frozen, waiting, KW } = window.lab;
    return JSON.parse(JSON.stringify({ scenario, speed, clockKey, frozen, waiting, kw: KW, poses }));
  });
  fs.writeFileSync(args.json, JSON.stringify(dump));
}
console.log("wrote", args.out);
await browser.close();
