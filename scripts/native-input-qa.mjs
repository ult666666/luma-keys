import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { installInputHarness, verifyInputs } from "./input-checks.mjs";
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-input-"));
await fs.mkdir(path.join(root, "Library"));
await fs.writeFile(
  path.join(root, "Library", "preferences.json"),
  JSON.stringify({
    theme: "mint",
    pet: "cat",
    volume: 0,
    stats: {
      correct: 0,
      minutes: 0,
      sessions: 0,
      dailyMinutes: 0,
      practiceDate: "",
    },
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
  // Finish initial navigation before instrumentation reload, so it cannot abort
  // Electron's first loadURL and open its startup-error dialog.
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await installInputHarness(page);
  await page.reload();
  const result = await verifyInputs(page, "native-input");
  const version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    "evidence/native-input-qa.json",
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log(
    "PASS native input flows:",
    result.checks.length,
    "checks; version",
    version,
  );
} catch (e) {
  await page
    ?.screenshot({ path: "evidence/native-input-qa-failure.png" })
    .catch(() => {});
  throw e;
} finally {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}
