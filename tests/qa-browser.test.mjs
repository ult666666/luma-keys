import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs, createOutputDirectory } from "../scripts/qa-browser.mjs";

test("browser QA defaults and explicit options", () => {
  assert.deepEqual(parseArgs([]), { timeoutMs: 180000, help: false });
  assert.deepEqual(
    parseArgs(["--output-dir", "a b", "--timeout-seconds", "60"]),
    {
      outputDir: "a b",
      timeoutMs: 60000,
      help: false,
    },
  );
  assert.equal(parseArgs(["--help"]).help, true);
});
test("browser QA rejects malformed, duplicate and unknown arguments", () => {
  for (const args of [
    ["--unknown"],
    ["--output-dir"],
    ["--output-dir", ""],
    ["--output-dir", "--help"],
    ["--timeout-seconds"],
    ...["0", "601", "1.5", "NaN", "-1", "1e2"].map((s) => [
      "--timeout-seconds",
      s,
    ]),
    ["--timeout-seconds", "60", "--timeout-seconds", "60"],
    ["--output-dir", "a", "--output-dir", "b"],
    ["--help", "--help"],
  ])
    assert.throws(
      () => parseArgs(args),
      /argument|option|timeout|destination/i,
    );
});
test("output destinations are new, unique and never overwrite files/directories/symlinks", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "luma-qa-options-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = await createOutputDirectory("new/nested", { cwd: root });
  assert.equal(target, path.join(root, "new/nested"));
  await assert.rejects(createOutputDirectory(target), /exist/i);
  const file = path.join(root, "keep.txt");
  await fs.writeFile(file, "keep");
  await assert.rejects(createOutputDirectory(file), /exist/i);
  const link = path.join(root, "link");
  await fs.symlink(target, link);
  await assert.rejects(createOutputDirectory(link), /exist/i);
  assert.equal(await fs.readFile(file, "utf8"), "keep");
  const a = await createOutputDirectory(undefined, { cwd: root });
  const b = await createOutputDirectory(undefined, { cwd: root });
  assert.notEqual(a, b);
  assert.equal(path.dirname(a), path.join(root, ".qa-runs"));
});
