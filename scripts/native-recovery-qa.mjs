import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyRecovery } from "./recovery-checks.mjs";

// Recovery (2.44) in the exact packaged app, on a fresh isolated root.
await fs.mkdir(".qa-runs", { recursive: true });
const root = await fs.mkdtemp(path.resolve(".qa-runs/native-recovery-"));
await fs.mkdir(path.join(root, "Library"));
await fs.writeFile(
  path.join(root, "Library/preferences.json"),
  JSON.stringify({
    volume: 0,
    stats: { correct: 0, minutes: 0, sessions: 0 },
    reading: { welcomeSeen: true, countIn: false },
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
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.setAudioMuted(true),
    ),
  );
  const result = await verifyRecovery(page, "native-recovery");
  const version = await app.evaluate(({ app }) => app.getVersion());
  await fs.writeFile(
    "evidence/native-recovery-qa.json",
    JSON.stringify({ passed: true, version, ...result }, null, 2),
  );
  console.log("PASS native recovery", version, result.checks.length, "checks");
} catch (e) {
  await page
    ?.screenshot({ path: "evidence/native-recovery-failure.png" })
    .catch(() => {});
  throw e;
} finally {
  const gone = app?.waitForEvent("close").catch(() => {});
  await app?.close().catch(() => {});
  await gone;
  await fs.rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
