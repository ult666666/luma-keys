import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { verifySightReading } from "./sight-reading-checks.mjs";
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-sight-reading-"));
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
  await page.waitForLoadState("domcontentloaded");
  const result = await verifySightReading(page, "native-sight-reading");
  const version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    "evidence/native-sight-reading-qa.json",
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log(
    "PASS native sight reading",
    version,
    result.checks.length,
    "checks",
  );
} catch (e) {
  await fs.writeFile(
    "evidence/native-sight-reading-failure.json",
    JSON.stringify({ error: e.message }, null, 2),
  );
  await page
    ?.screenshot({
      path: "evidence/native-sight-reading-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  throw e;
} finally {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}
