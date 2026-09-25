// Refresh this built-in lesson's shipped practice resources only. Never touches
// the user's Library or Exports directories.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { demos } from "../src/music.mjs";
import { numberedSheet } from "../src/export.mjs";

const score = demos().find((s) => s.id === "elise");
const dir = path.resolve("Practice Sheets");
await fs.writeFile(path.join(dir, "Für Elise - opening.musicxml"), score.xml);
// Retain the original shipped filename so existing Desktop links still work.
const html = path.join(dir, "Fr Elise  opening - numbers.html");
await fs.writeFile(html, numberedSheet(score));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(html).href);
  await page.pdf({
    path: path.join(dir, "Für Elise - opening numbers.pdf"),
    format: "A4",
    scale: 0.8,
    printBackground: true,
    margin: { top: "15mm", bottom: "15mm", left: "15mm", right: "15mm" },
  });
  await page.screenshot({
    path: "evidence/elise-numbered-sheet.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
console.log(
  "Updated Für Elise MusicXML, printable HTML and PDF in Practice Sheets.",
);
