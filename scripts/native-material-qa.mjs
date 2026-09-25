import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyMaterials } from "./material-checks.mjs";
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-material-"));
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
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.setAudioMuted(true),
    ),
  );
  const result = await verifyMaterials(page, "native-material");
  const version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    "evidence/native-material-qa.json",
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log("PASS native material", version, result.checks.length, "checks");
} catch (error) {
  await page
    ?.screenshot({
      path: "evidence/native-material-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  throw error;
} finally {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}
