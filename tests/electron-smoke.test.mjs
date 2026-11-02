import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("../scripts/electron-smoke.mjs", import.meta.url),
);

// An Electron upgrade that cannot start is the failure this smoke test exists
// to catch, so that run must still leave its report and remove its library.
test("an app that cannot launch fails with a report and no leftover library", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "luma-smoke-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tmp = path.join(root, "tmp");
  const out = path.join(root, "out");
  await fs.mkdir(tmp);
  const result = spawnSync(process.execPath, [SCRIPT, "--output-dir", out], {
    env: {
      ...process.env,
      LUMA_APP: path.join(root, "missing", "Luma Keys"),
      TMPDIR: tmp,
    },
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /^FAIL: .*launch/im);
  const report = JSON.parse(
    await fs.readFile(path.join(out, "report.json"), "utf8"),
  );
  assert.equal(report.passed, false);
  assert.match(report.failure, /launch/i);
  assert.deepEqual(await fs.readdir(tmp), []);
});
