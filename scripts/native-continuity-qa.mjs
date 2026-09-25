import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  installResumeAudioHarness,
  verifyResumeAudio,
} from "./resume-audio-checks.mjs";
import { verifyOverlapMotion } from "./overlap-motion-checks.mjs";
import { verifyChordReading } from "./chord-reading-checks.mjs";
const baseline = process.argv.includes("--baseline");
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-continuity-"));
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
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.setAudioMuted(true),
    ),
  );
  await installResumeAudioHarness(page);
  await page.reload();
  const audio = await verifyResumeAudio(page, "native-resume-audio", baseline);
  const overlap = baseline
    ? null
    : await verifyOverlapMotion(page, "native-overlap-motion");
  const chords = baseline
    ? null
    : await verifyChordReading(page, "native-chord-reading");
  const version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    `evidence/${baseline ? "resume-audio-baseline" : "native-continuity-qa"}.json`,
    JSON.stringify(
      {
        version,
        ...(baseline ? { baseline: true } : { passed: true }),
        audio,
        overlap,
        chords,
      },
      null,
      2,
    ),
  );
  console.log(
    baseline ? "BASELINE" : "PASS native continuity",
    version,
    audio,
    overlap?.checks,
  );
} catch (error) {
  await page
    ?.screenshot({
      path: "evidence/native-continuity-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  throw error;
} finally {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}
