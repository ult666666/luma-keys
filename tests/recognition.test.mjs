import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRecognition } from "../src/recognition.mjs";
import { fork } from "node:child_process";
import { parseMusicXML } from "../src/music.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await delay(30);
  }
  throw Error("Timed out");
}
async function setup() {
  await fs.mkdir(".qa-runs", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".qa-runs/recognition-unit-"));
  const dataDir = path.join(root, "Library");
  await fs.mkdir(path.join(dataDir, "imports"), { recursive: true });
  const engine = path.join(root, "test-engine.cjs");
  // Deterministic native-engine stand-in: hold until told to finish, and ignore
  // SIGTERM so the runner's bounded SIGKILL fallback is actually exercised.
  await fs.writeFile(
    engine,
    `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const out = process.argv[process.argv.indexOf('-output') + 1];
const root = path.dirname(process.argv[1]);
fs.writeFileSync(path.join(root, 'engine.pid'), String(process.pid));
process.on('SIGTERM', () => {});
console.log('LOAD');
const timer = setInterval(() => {
 if (fs.existsSync(path.join(root, 'fail'))) process.exit(1);
 if (!fs.existsSync(path.join(root, 'complete'))) return;
 fs.copyFileSync(path.join(root, 'score.xml'), path.join(out, 'result.mxl'));
 clearInterval(timer); process.exit(0);
}, 30);
`,
    { mode: 0o755 },
  );
  await fs.copyFile("tests/starter.musicxml", path.join(root, "score.xml"));
  const save = (score) =>
    fs.writeFile(path.join(dataDir, score.id + ".json"), JSON.stringify(score));
  const options = { dataDir, engine, tessdata: root, save };
  const recognition = await createRecognition(options);
  return {
    root,
    dataDir,
    recognition,
    options,
    async cleanup() {
      await recognition.shutdown();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
const pdf = Buffer.from("%PDF-1.4 test original");

test("Terminal failure is published only after its receipt commits and the engine slot is retryable", async (t) => {
  const f = await setup();
  const rename = fs.rename;
  let releaseWrite;
  const heldWrite = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  let finalWriteEntered = false;
  const intercepted = t.mock.method(fs, "rename", async (from, to) => {
    if (
      String(to).startsWith(f.dataDir) &&
      path.basename(String(to)) === "job.json"
    ) {
      const receipt = JSON.parse(await fs.readFile(from, "utf8"));
      if (receipt.status === "error" && !finalWriteEntered) {
        finalWriteEntered = true;
        await heldWrite;
      }
    }
    return rename(from, to);
  });
  try {
    await fs.chmod(f.options.engine, 0o644);
    const { jobId } = await f.recognition.start("Retry after commit.pdf", pdf);
    await until(() => finalWriteEntered);
    assert.equal(
      f.recognition.list().jobs[0].status,
      "processing",
      "A pending terminal receipt must not expose a Retry action while the slot is still reserved",
    );
    assert.equal((await f.recognition.detail(jobId)).status, "processing");
    assert.throws(
      () => f.recognition.start("No overlapping engine.pdf", pdf),
      (e) => e.status === 409,
    );
    await fs.chmod(f.options.engine, 0o755);
    await fs.writeFile(path.join(f.root, "complete"), "");
    releaseWrite();
    await until(() => f.recognition.list().jobs[0].status === "error");
    await f.recognition.retry(jobId);
    await until(() => f.recognition.list().jobs[0].status === "done");
    assert.equal(
      (await f.recognition.detail(jobId)).scores[0].notes.length,
      16,
    );
  } finally {
    releaseWrite();
    intercepted.mock.restore();
    await f.cleanup();
  }
});

test("PDF jobs reserve the engine, cancel cleanly, retry fresh, and persist completed scores", async () => {
  const f = await setup();
  try {
    const first = f.recognition.start("Tiny score.pdf", pdf);
    assert.throws(
      () => f.recognition.start("Overlap.pdf", pdf),
      (e) => e.status === 409,
    );
    const { jobId } = await first;
    await until(async () =>
      fs.readFile(path.join(f.root, "engine.pid"), "utf8").catch(() => false),
    );
    const pid = +(await fs.readFile(path.join(f.root, "engine.pid"), "utf8"));
    const receipt = path.join(f.dataDir, "imports", jobId, "job.json");
    assert.equal(JSON.parse(await fs.readFile(receipt)).status, "processing");
    await f.recognition.cancel(jobId);
    assert.throws(
      () => process.kill(pid, 0),
      (e) => e.code === "ESRCH",
    );
    assert.equal((await f.recognition.detail(jobId)).status, "cancelled");
    assert.deepEqual(
      await fs.readFile(path.join(f.dataDir, "imports", jobId + ".pdf")),
      pdf,
    );
    // Stale output from the cancelled attempt must never become a successful retry.
    await fs.copyFile(
      "tests/starter.musicxml",
      path.join(f.dataDir, "imports", jobId, "attempt-1", "stale.mxl"),
    );
    await fs.writeFile(path.join(f.root, "fail"), "");
    await f.recognition.retry(jobId);
    await until(() => f.recognition.list().jobs[0].status === "error");
    assert.equal((await f.recognition.detail(jobId)).scores.length, 0);
    await fs.rm(path.join(f.root, "fail"));
    await fs.writeFile(path.join(f.root, "complete"), "");
    const dismissing = f.recognition.dismiss(jobId);
    const retrying = f.recognition.retry(jobId);
    await Promise.all([dismissing, retrying]);
    await until(() => f.recognition.list().jobs[0].status === "done");
    assert.equal(
      f.recognition.list().jobs[0].dismissed,
      false,
      "A concurrent retry must stay visible after an earlier dismiss",
    );
    const completed = await f.recognition.detail(jobId);
    assert.equal(completed.scores[0].notes.length, 16);
    assert.equal(completed.scores[0].originalId, jobId);
    assert.equal(completed.attempt, 3);
    await f.recognition.dismiss(jobId);
    await f.recognition.shutdown();
    const restarted = await createRecognition(f.options);
    assert.equal(restarted.list().jobs[0].dismissed, true);
    assert.equal((await restarted.detail(jobId)).scores[0].notes.length, 16);
    await restarted.shutdown();
  } finally {
    await f.cleanup();
  }
});

test("Shutdown interrupts active recognition, preserves originals, and blocks new starts", async () => {
  const f = await setup();
  try {
    const { jobId } = await f.recognition.start("Resume me.pdf", pdf);
    await until(async () =>
      fs.readFile(path.join(f.root, "engine.pid"), "utf8").catch(() => false),
    );
    const pid = +(await fs.readFile(path.join(f.root, "engine.pid"), "utf8"));
    await f.recognition.shutdown();
    assert.throws(
      () => process.kill(pid, 0),
      (e) => e.code === "ESRCH",
    );
    assert.equal((await f.recognition.detail(jobId)).status, "interrupted");
    assert.throws(
      () => f.recognition.retry(jobId),
      (e) => e.status === 503,
    );
    const resumed = await createRecognition(f.options);
    assert.equal(resumed.list().jobs[0].hasOriginal, true);
    await fs.writeFile(path.join(f.root, "complete"), "");
    await resumed.retry(jobId);
    await until(() => resumed.list().jobs[0].status === "done");
    await resumed.shutdown();
  } finally {
    await f.cleanup();
  }
});

test("Incomplete and malformed receipts recover independently, with explicit missing-original failure", async () => {
  const f = await setup();
  try {
    const imports = path.join(f.dataDir, "imports");
    for (const id of ["incomplete", "damaged"])
      await fs.mkdir(path.join(imports, id));
    const saved = {
      id: "incomplete",
      name: "Interrupted.pdf",
      status: "processing",
      attempt: 1,
      startedAt: Date.now(),
      scoreIds: [],
    };
    await fs.writeFile(
      path.join(imports, "incomplete", "job.json"),
      JSON.stringify(saved),
    );
    await fs.writeFile(path.join(imports, "damaged", "job.json"), "{");
    const loaded = await createRecognition(f.options);
    assert.equal(loaded.list().jobs[0].status, "interrupted");
    assert.equal(loaded.list().issues.length, 1);
    await assert.rejects(loaded.retry("incomplete"), /original PDF is missing/);
    assert.equal(loaded.list().jobs[0].status, "error");
    assert.equal(
      await fs.readFile(path.join(imports, "damaged", "job.json"), "utf8"),
      "{",
    );
    await loaded.shutdown();
  } finally {
    await f.cleanup();
  }
});

test("Recognition time limit stops the engine and reports a useful retry error", async () => {
  const f = await setup();
  try {
    await f.recognition.shutdown();
    const timed = await createRecognition({ ...f.options, timeoutMs: 500 });
    const { jobId } = await timed.start("Slow.pdf", pdf);
    await until(() => timed.list().jobs[0].status === "error");
    assert.match((await timed.detail(jobId)).error, /took too long/);
    await timed.shutdown();
  } finally {
    await f.cleanup();
  }
});

test("Force-killing the parent disconnects its runner and stops a SIGTERM-ignoring engine", async () => {
  const f = await setup();
  let parent, enginePid;
  try {
    const harness = path.join(f.root, "parent.mjs");
    const moduleURL = new URL("../src/recognition.mjs", import.meta.url).href;
    await fs.writeFile(
      harness,
      `import {createRecognition} from ${JSON.stringify(moduleURL)};
const recognition=await createRecognition(${JSON.stringify({ ...f.options, save: undefined })});
await recognition.start('Crash me.pdf',Buffer.from('%PDF-1.4 test'));`,
    );
    parent = fork(harness, [], {
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    enginePid = +(await until(async () =>
      fs.readFile(path.join(f.root, "engine.pid"), "utf8").catch(() => false),
    ));
    parent.kill("SIGKILL");
    await until(() => {
      try {
        process.kill(enginePid, 0);
        return false;
      } catch (e) {
        return e.code === "ESRCH";
      }
    }, 8000);
    const recovered = await createRecognition(f.options);
    assert.equal(recovered.list().jobs[0].status, "interrupted");
    assert.equal(recovered.list().jobs[0].hasOriginal, true);
    await recovered.shutdown();
  } finally {
    if (parent?.exitCode === null && parent.signalCode === null)
      parent.kill("SIGKILL");
    // This PID came from this test's uniquely owned engine fixture.
    if (enginePid) {
      try {
        process.kill(enginePid, "SIGKILL");
      } catch {}
    }
    await f.cleanup();
  }
});

test("Interrupted score commits recover saved parts instead of duplicating them on retry", async () => {
  const f = await setup();
  try {
    const score = parseMusicXML(
      await fs.readFile("tests/starter.musicxml", "utf8"),
    );
    score.originalId = "committing";
    await f.options.save(score);
    const receipt = {
      id: "committing",
      name: "Saved.pdf",
      status: "processing",
      attempt: 1,
      startedAt: Date.now(),
      scoreIds: [],
      plannedScoreIds: [score.id],
    };
    const dir = path.join(f.dataDir, "imports", "committing");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "job.json"), JSON.stringify(receipt));
    let loaded = await createRecognition(f.options);
    assert.equal(loaded.list().jobs[0].status, "done");
    assert.equal((await loaded.detail("committing")).scores[0].id, score.id);
    assert.throws(
      () => loaded.retry("committing"),
      (e) => e.status === 409,
    );
    await loaded.shutdown();
    receipt.plannedScoreIds.push("not-yet-saved");
    await fs.writeFile(path.join(dir, "job.json"), JSON.stringify(receipt));
    loaded = await createRecognition(f.options);
    assert.equal(loaded.list().jobs[0].status, "done");
    assert.match(loaded.list().jobs[0].error, /1 of 2/);
    assert.equal((await loaded.detail("committing")).scores.length, 1);
    await loaded.shutdown();
  } finally {
    await f.cleanup();
  }
});

test("An engine launch failure releases the slot and reports installation trouble, not scan quality", async () => {
  const f = await setup();
  try {
    await fs.chmod(f.options.engine, 0o644);
    const { jobId } = await f.recognition.start("Cannot start.pdf", pdf);
    await until(() => f.recognition.list().jobs[0].status === "error");
    assert.match(
      (await f.recognition.detail(jobId)).error,
      /engine could not start/,
    );
    await fs.chmod(f.options.engine, 0o755);
    await fs.writeFile(path.join(f.root, "complete"), "");
    await f.recognition.retry(jobId);
    await until(() => f.recognition.list().jobs[0].status === "done");
  } finally {
    await f.cleanup();
  }
});
