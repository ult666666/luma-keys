import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Render the editable vector masters directly at each required macOS size.
// Small representations use a simpler mark instead of shrinking tiny details.
const assetDir = path.resolve("Assets/App Icon 2.19.1");
const iconset = path.join(assetDir, "Luma Keys.iconset");
await fs.mkdir(iconset, { recursive: true });
const master = await fs.readFile("public/app-icon.svg", "utf8");
const favicon = await fs.readFile("public/favicon.svg", "utf8");
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="translate(64 64) scale(14)">${favicon.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g></svg>`;
const representations = [
  ["icon_16x16.png", 16], ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32], ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128], ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256], ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512], ["icon_512x512@2x.png", 1024],
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [name, size] of representations) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.route("**/*", route => route.abort());
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${size <= 32 ? small : master}`);
    await page.screenshot({ path: path.join(iconset, name), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.copyFile(path.join(iconset, "icon_512x512@2x.png"), "public/icon.png");
execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.resolve("public/icon.icns")]);
await Promise.all([
  fs.copyFile("public/app-icon.svg", path.join(assetDir, "Luma Keys.svg")),
  fs.copyFile("public/favicon.svg", path.join(assetDir, "Luma Keys Small.svg")),
  fs.copyFile("public/icon.png", path.join(assetDir, "Luma Keys.png")),
  fs.copyFile("public/icon.icns", path.join(assetDir, "Luma Keys.icns")),
]);
console.log("Rendered 10 macOS representations, PNG, ICNS and editable SVG masters.");
