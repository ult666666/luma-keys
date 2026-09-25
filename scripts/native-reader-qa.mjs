import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyReader } from "./reader-checks.mjs";
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-reader-"));
await fs.mkdir(path.join(root, "Library"));
await fs.writeFile(
  path.join(root, "Library/preferences.json"),
  JSON.stringify({
    theme: "mint",
    pet: "cat",
    volume: 0,
    stats: { correct: 0, minutes: 0, sessions: 0 },
  }),
);
const app = await electron.launch({
  executablePath: path.resolve(
    "release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys",
  ),
  env: { ...process.env, LUMA_QA_ROOT: root },
});
let page;
try {
  page = await app.firstWindow();
  const result = await verifyReader(page, "native-reader");
  const version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    "evidence/native-reader-qa.json",
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log("PASS native reader", version, result.checks.length, "checks");
} catch (e) {
  const diagnostic = await page
    ?.evaluate(() => {
      const key = document.querySelector('[data-midi="60"]'),
        viewport = document.querySelector(".keyboard-viewport");
      const box = key?.getBoundingClientRect();
      return {
        innerWidth,
        innerHeight,
        devicePixelRatio,
        scrollX,
        scrollY,
        key: box?.toJSON(),
        viewport: viewport?.getBoundingClientRect().toJSON(),
        scrollLeft: viewport?.scrollLeft,
        style: key && {
          height: getComputedStyle(key).height,
          bottom: getComputedStyle(key).bottom,
          top: getComputedStyle(key).top,
          pointerEvents: getComputedStyle(key).pointerEvents,
        },
        points:
          box &&
          [20, 40, 60, 78].map((y) => ({
            y,
            tag: document
              .elementFromPoint(box.x + 20, box.y + y)
              ?.outerHTML.slice(0, 350),
          })),
      };
    })
    .catch(() => null);
  await fs.writeFile(
    "evidence/native-reader-failure.json",
    JSON.stringify({ error: e.message, diagnostic }, null, 2),
  );

  await page
    ?.screenshot({ path: "evidence/native-reader-failure.png", fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}
