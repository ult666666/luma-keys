import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyPhrasePractice } from "./phrase-practice-checks.mjs";

await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-phrase-"));
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
let app, page;
try {
  app = await electron.launch({
    executablePath:
      process.env.LUMA_APP ||
      path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys"),
    env: { ...process.env, LUMA_QA_ROOT: root },
  });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) =>
      window.webContents.setAudioMuted(true),
    ),
  );
  const result = await verifyPhrasePractice(page, "native-phrase-practice");
  const version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    "evidence/native-phrase-practice-qa.json",
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log(
    "PASS native phrase practice",
    version,
    result.checks.length,
    "checks",
  );
} catch (error) {
  await page
    ?.screenshot({
      path: "evidence/native-phrase-practice-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  await fs.writeFile(
    "evidence/native-phrase-practice-failure.json",
    JSON.stringify(
      {
        error: error.message,
        evidence: error.phraseEvidence,
        body: await page
          ?.locator("body")
          .innerText()
          .catch(() => "unavailable"),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  // This reference belongs only to the uniquely isolated QA app launched above.
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
}
