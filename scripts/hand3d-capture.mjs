// Capture the 3-D hand lab (scripts/hand3d-lab.html) headless as a PNG, and
// optionally dump each frame's fingertip data and solver diagnostics.
//
//   node scripts/hand3d-capture.mjs --scenario path/to/S01.json --out S01.png \
//        [--beats 0,0.5] [--from 0 --to 4 --dt 0.5] [--kw 45 --kh 166 --bed 218 --top 60]
//        [--demo moon] [--speed 0.5] [--frozen] [--waiting] [--since 0.4] [--reduced]
//        [--elev 52] [--low 48 --high 84] [--cols 2] [--labels 0] [--debug] [--json frames.json]
//        [--width 1700] [--dpr 2] [--swiftshader]  (+ look/posture overrides, see the lab)
//
// Needs the dev server (npm run dev) on http://127.0.0.1:5188 and the
// Playwright Chromium in ~/Library/Caches/ms-playwright. WebGL runs on the GPU
// when Chromium has one and on SwiftShader otherwise (--swiftshader forces it).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((list, a, i, all) => {
    if (!a.startsWith("--")) return list;
    const eq = a.indexOf("=");
    if (eq > 0) list.push([a.slice(2, eq), a.slice(eq + 1)]);
    else list.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
    return list;
  }, []),
);
if (!(args.scenario || args.demo) || !args.out) {
  console.error("usage: --scenario file.json | --demo moon  --out file.png [--beats a,b] [--kw 45 --kh 166] [--json frames.json]");
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
const params = new URLSearchParams();
if (args.scenario) params.set("json", fs.readFileSync(args.scenario, "utf8"));
if (args.demo) params.set("demo", args.demo);
const PASS = ["beats", "from", "to", "dt", "kw", "kh", "bed", "top", "speed", "since", "ahead", "cols", "elev", "low", "high", "labels", "mask",
  "key", "fill", "rim", "env", "exposure", "shadow", "roughness", "sheen", "specular", "clearcoat", "subdivide", "tone", "skin", "keyDir", "rimDir",
  "height", "reach", "pitch", "rings", "ao", "mottle", "wrap", "top", "sculpt", "glonly", "palm", "knuckle", "tip", "keyColor", "nail", "clearcoatRoughness", "sheenRoughness", "thumbWhite", "tipWhite", "fade", "posture", "rail", "graze", "contact", "shadowSoft", "crease", "xray", "clearcoatBack", "toneMap", "skinTone", "shadowDir", "grazeDir", "wristFade", "shadowColor", "cam", "underCue", "valley", "wristGrey", "roughnessBack", "shadowSoftMax", "palmShadow", "maps", "normalScale", "red", "cavity", "nailCoat", "fadePx", "rest", "envSky", "envGround", "envKey", "sky", "ground", "restOpacity", "marknum", "joints", "debugDetail"];
for (const name of PASS) if (args[name] != null) params.set(name, args[name]);
for (const name of ["nailDebug", "nailRoughness", "nailGlint", "nails"]) if (args[name] != null) params.set(name, args[name]);
for (const name of ["frozen", "waiting", "reduced", "debug"]) if (args[name]) params.set(name, "1");
const url = `http://127.0.0.1:5188/scripts/hand3d-lab.html?${params}`;
const launchArgs = args.swiftshader ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--enable-gpu", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ executablePath: findChrome(), args: launchArgs });
const page = await browser.newPage({ viewport: { width: +(args.width || 1700), height: 900 }, deviceScaleFactor: +(args.dpr || 2) });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errors.push(m.text()));
await page.goto(url);
try {
  await page.waitForSelector("body[data-ready]", { timeout: 90000 });
} catch (e) {
  console.error("lab did not get ready:", errors.join("\n"));
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(80);
await page.locator("#rows").screenshot({ path: args.out });
if (args.json) {
  const dump = await page.evaluate(() => JSON.parse(JSON.stringify({ frames: window.lab3d.frames, view: window.lab3d.view, KW: window.lab3d.KW, KH: window.lab3d.KH })));
  fs.writeFileSync(args.json, JSON.stringify(dump, null, 1));
}
const renderer = await page.evaluate(() => {
  const c = document.createElement("canvas").getContext("webgl2");
  const ext = c && c.getExtension("WEBGL_debug_renderer_info");
  return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
if (errors.length) console.error("page errors:\n" + errors.join("\n"));
console.log("wrote", args.out, "· renderer", renderer);
await browser.close();
