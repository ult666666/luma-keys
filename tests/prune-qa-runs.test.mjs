import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pruneQaRuns } from "../scripts/prune-qa-runs.mjs";

async function fakeApp(dir, ...parts) {
  const bundle = path.join(dir, ...parts);
  await mkdir(path.join(bundle, "Contents"), { recursive: true });
  await writeFile(
    path.join(bundle, "Contents", "model.gguf"),
    "x".repeat(8192),
  );
  // Distinct ctimes, so "newest" is well defined.
  await new Promise((resolve) => setTimeout(resolve, 15));
  return bundle;
}

async function qaRuns(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "luma-qa-runs-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("qa:prune keeps the rollback and staged apps and deletes other copies", async (t) => {
  const dir = await qaRuns(t);
  const rollback = await fakeApp(dir, "rollback", "Luma Keys.app");
  const staged = await fakeApp(dir, "staged", "Luma Keys.app");
  const copies = [
    await fakeApp(dir, "hands-2.45", "previous-installed-Luma Keys-2.44.0.app"),
    await fakeApp(dir, "hands-2.45", "build", "mac-arm64", "Luma Keys.app"),
  ];
  const report = path.join(dir, "hands-2.45", "report.json");
  await writeFile(report, "{}");

  const preview = await pruneQaRuns({ dir, dryRun: true });
  assert.deepEqual(
    preview.removed.map(({ bundle }) => bundle).sort(),
    [...copies].sort(),
  );
  assert.ok(copies.every((bundle) => existsSync(bundle)));

  const { removed, left } = await pruneQaRuns({ dir });
  assert.ok(removed.every(({ bytes }) => bytes >= 8192));
  assert.deepEqual(left.sort(), [rollback, staged].sort());
  assert.ok(copies.every((bundle) => !existsSync(bundle)));
  assert.ok(existsSync(report));
});

test("qa:prune keeps only the newest app in the rollback folder", async (t) => {
  const dir = await qaRuns(t);
  const older = await fakeApp(dir, "rollback", "Luma Keys-2.44.0.app");
  const newer = await fakeApp(dir, "rollback", "Luma Keys.app");
  const { removed, left } = await pruneQaRuns({ dir });
  assert.deepEqual(
    removed.map(({ bundle }) => bundle),
    [older],
  );
  assert.deepEqual(left, [newer]);
});

test("qa:prune --older-than-hours spares copies from an unfinished run", async (t) => {
  const dir = await qaRuns(t);
  const copy = await fakeApp(dir, "studio-2.47", "install-ready.app");
  assert.equal(
    (await pruneQaRuns({ dir, olderThanHours: 24 })).removed.length,
    0,
  );
  const tomorrow = Date.now() + 25 * 3600e3;
  const { removed } = await pruneQaRuns({
    dir,
    olderThanHours: 24,
    now: tomorrow,
    dryRun: true,
  });
  assert.deepEqual(
    removed.map(({ bundle }) => bundle),
    [copy],
  );
  await assert.rejects(
    pruneQaRuns({ dir, olderThanHours: Number("a day") }),
    /older-than-hours/,
  );
});
