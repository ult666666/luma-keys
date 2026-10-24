// The packaged-app regression net in one command: every runnable native
// story, one at a time, against release/mac-arm64/Luma Keys.app (the
// stories that accept LUMA_APP use it when set), with a one-line result
// each and a summary in evidence/native-sweep.json.
//
//   npm run qa:native            all stories
//   npm run qa:native -- reader  only stories whose name contains "reader"
//   npm run qa:native -- --stories native-reader-qa close-qa --output-dir .qa-runs/my-sweep
//
// Version-pinned acceptance suites (native-conversation-model-qa 2.9,
// native-coach-qa 2.10, native-library-illustrated-qa 2.13) are historical
// and not part of the net.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const STORIES = [
  "native-qa",
  "native-input-qa",
  "native-reader-qa",
  "native-material-qa",
  "native-keyboard-stage-qa",
  "native-backing-qa",
  "native-grand-qa",
  "native-companion-qa",
  "native-conversation-qa",
  "native-maestro-qa",
  "native-studio-design-qa",
  "native-hand-beauty-qa",
  "native-hand-guide-qa",
  "native-continuity-qa",
  "native-phrase-practice-qa",
  "native-sight-reading-qa",
  "native-stage-performance-qa",
  "native-storage-qa",
  "native-trouble-spots-qa",
  "native-transition-qa",
  "native-library-access-qa",
  "native-recovery-qa",
  "close-qa",
  "recognition-close-qa",
];
const args = process.argv.slice(2);
let filter, exactStories, outputDir;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--stories") {
    exactStories = [];
    while (args[i + 1] && !args[i + 1].startsWith("--"))
      exactStories.push(args[++i]);
    if (!exactStories.length)
      throw Error("--stories requires at least one story name.");
    const unknown = exactStories.filter((name) => !STORIES.includes(name));
    if (unknown.length)
      throw Error(`Unknown native stories: ${unknown.join(", ")}`);
  } else if (args[i] === "--output-dir") {
    if (!args[i + 1] || args[i + 1].startsWith("--"))
      throw Error("--output-dir requires a folder.");
    outputDir = path.resolve(args[++i]);
  } else if (args[i].startsWith("--") || filter) {
    throw Error(`Unexpected native sweep argument: ${args[i]}`);
  } else filter = args[i];
}
if (filter && exactStories)
  throw Error("Choose a substring filter or --stories, not both.");
const chosen = exactStories
  ? [...new Set(exactStories)]
  : STORIES.filter((s) => !filter || s.includes(filter));
if (!chosen.length) throw Error("No native stories match the filter.");
const logs = outputDir
  ? path.join(outputDir, "logs")
  : path.resolve(".qa-runs/native-sweep");
const summaryPath = outputDir
  ? path.join(outputDir, "native-sweep.json")
  : "evidence/native-sweep.json";
fs.mkdirSync(logs, { recursive: true });
const LONG_STORIES = new Set([
  "native-qa",
  "native-reader-qa",
  "recognition-close-qa",
]);
const MAX_OUTPUT = 8 << 20;
// Playwright detaches Electron into its own group. Capture the child tree
// before killing the story, while parent links still prove QA ownership.
const stopOwnedTree = (child, grouped) => {
  if (grouped && child.pid) {
    const listing = spawnSync("ps", ["-axo", "pid=,ppid=,pgid="], {
      encoding: "utf8",
      timeout: 2000,
      maxBuffer: 2 << 20,
    });
    if (listing.status === 0) {
      const rows = listing.stdout
        .trim()
        .split("\n")
        .map((line) => line.trim().split(/\s+/).map(Number));
      const owned = new Set([child.pid]);
      let added;
      do {
        added = false;
        for (const [pid, parent] of rows) {
          if (owned.has(parent) && !owned.has(pid)) {
            owned.add(pid);
            added = true;
          }
        }
      } while (added);
      const groups = new Set(
        rows
          .filter(([pid, , group]) => owned.has(pid) && owned.has(group))
          .map(([, , group]) => group),
      );
      for (const group of groups) {
        try {
          process.kill(-group, "SIGKILL");
        } catch {}
      }
      for (const pid of [...owned].reverse()) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      }
    }
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
  }
  child.kill("SIGKILL");
};
// Own a process group so a deadline also stops this story's Electron and
// recognition children, without touching any app outside the QA launch.
const runStory = (story, timeoutMs) =>
  new Promise((resolve) => {
    const grouped = process.platform !== "win32";
    const child = spawn(process.execPath, [`scripts/${story}.mjs`], {
      env: process.env,
      detached: grouped,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    let bytes = 0,
      failure = null,
      settled = false,
      stopTimer;
    const finish = (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(stopTimer);
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({
        status,
        signal,
        failure,
        output: Buffer.concat(chunks).toString("utf8"),
      });
    };
    const stop = (reason) => {
      if (settled || failure) return;
      failure = reason;
      stopOwnedTree(child, grouped);
      // A descendant that detached itself must not keep inherited output
      // pipes open forever after the owned process group has been stopped.
      stopTimer = setTimeout(() => finish(null, "SIGKILL"), 1000);
    };
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    const capture = (chunk) => {
      if (settled || failure) return;
      const remaining = MAX_OUTPUT - bytes;
      if (remaining > 0) {
        chunks.push(chunk.subarray(0, remaining));
        bytes += Math.min(chunk.length, remaining);
      }
      if (chunk.length > remaining) stop("output-limit");
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => {
      failure = `launch-error: ${error.message}`;
      finish(null, null);
    });
    child.once("close", finish);
  });
const results = [];
for (const story of chosen) {
  const started = Date.now();
  const timeoutMs = (LONG_STORIES.has(story) ? 240 : 180) * 1000;
  const run = await runStory(story, timeoutMs);
  const runnerError =
    run.failure === "timeout"
      ? `TIMEOUT: story exceeded ${timeoutMs / 1000}s; stopped its owned QA process tree.`
      : run.failure === "output-limit"
        ? "OUTPUT LIMIT: story exceeded 8 MiB of captured output; stopped its owned QA process tree."
        : run.failure || "";
  const output = run.output + (runnerError ? `\n${runnerError}\n` : "");
  fs.writeFileSync(path.join(logs, `${story}.log`), output);
  const passLine =
    output.split("\n").find((l) => /^PASS/.test(l)) ||
    (/"passed": true/.test(output) ? "passed: true" : "");
  const failLine =
    runnerError ||
    output
      .split("\n")
      .find((l) =>
        /Error|AssertionError|checks\.mjs:\d+|qa\.mjs:\d+/.test(l),
      ) ||
    (/"passed":\s*false/.test(output)
      ? "Report passed: false"
      : `Story exited ${run.status ?? run.signal ?? "without a status"}`);
  const passed = run.status === 0 && !run.failure;
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({
    story,
    passed,
    exit: run.status,
    signal: run.signal,
    failure: run.failure,
    timeoutSeconds: timeoutMs / 1000,
    seconds,
    summary: (passed ? passLine : failLine).trim().slice(0, 200),
  });
  console.log(
    `${passed ? "PASS" : run.failure === "timeout" ? "TIMEOUT" : "FAIL"}  ${story.padEnd(28)} ${String(seconds).padStart(4)}s  ${(passed ? passLine : failLine).trim().slice(0, 110)}`,
  );
}
const failed = results.filter((r) => !r.passed);
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
fs.writeFileSync(
  summaryPath,
  JSON.stringify(
    {
      version,
      app: process.env.LUMA_APP || "release/mac-arm64/Luma Keys.app",
      ranAt: new Date().toISOString(),
      passed: results.length - failed.length,
      stories: results.length,
      results,
    },
    null,
    2,
  ),
);
console.log(
  `\n${results.length - failed.length} of ${results.length} stories passed. Logs: ${logs}`,
);
process.exit(failed.length ? 1 : 0);
