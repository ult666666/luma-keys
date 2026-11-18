import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium, expect } from "@playwright/test";
import { performPlan } from "../scripts/sight-reading-checks.mjs";
import { fileURLToPath } from "node:url";
import { createOutputDirectory } from "../scripts/qa-browser.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
test(
  "actual CLI failure paths preserve a user-library canary and unrelated listener",
  { timeout: 120000 },
  async (t) => {
    const evidence = await createOutputDirectory(
      process.env.LUMA_QA_TEST_OUTPUT,
    );
    console.log(`CLI failure evidence: ${evidence}`);
    const canary = await fs.mkdtemp(path.join(os.tmpdir(), "luma-qa-canary-"));
    await fs.mkdir(path.join(canary, "Library"));
    await fs.writeFile(
      path.join(canary, "Library", "preferences.json"),
      '{"user":"keep"}\n',
    );
    const before = await fs.readFile(
      path.join(canary, "Library", "preferences.json"),
      "utf8",
    );
    t.after(() => fs.rm(canary, { recursive: true, force: true }));
    const unrelated = http.createServer((_, res) => res.end("unrelated"));
    unrelated.listen(0, "127.0.0.1");
    await once(unrelated, "listening");
    t.after(() => new Promise((resolve) => unrelated.close(resolve)));
    for (const scenario of [
      "build-deadline",
      "missing-browser",
      "story-deadline",
      "interrupt",
      "terminate",
    ]) {
      await t.test(scenario, async () => {
        const destination = path.join(evidence, scenario);
        const seconds =
          scenario === "build-deadline"
            ? "1"
            : scenario === "story-deadline"
              ? "15"
              : "60";
        const child = spawn(
          process.execPath,
          [
            "scripts/qa-browser.mjs",
            "--output-dir",
            destination,
            "--timeout-seconds",
            seconds,
          ],
          {
            cwd: ROOT,
            env: {
              ...process.env,
              LUMA_DATA_DIR: path.join(canary, "Library"),
              ...(scenario === "missing-browser"
                ? { PLAYWRIGHT_BROWSERS_PATH: path.join(canary, "no-browsers") }
                : {}),
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        t.after(() => {
          if (child.exitCode === null && child.signalCode === null)
            child.kill("SIGTERM");
        });
        let log = "";
        let interrupted = false;
        for (const stream of [child.stdout, child.stderr])
          stream.on("data", (chunk) => {
            log = (log + chunk).slice(-131072);
            if (
              ["interrupt", "terminate"].includes(scenario) &&
              !interrupted &&
              log.includes("Browser QA: sight-reading")
            ) {
              interrupted = true;
              child.kill(scenario === "interrupt" ? "SIGINT" : "SIGTERM");
            }
          });
        const [code] = await once(child, "close");
        await fs.writeFile(path.join(evidence, `${scenario}.log`), log);
        assert.equal(
          code,
          scenario === "interrupt" ? 130 : scenario === "terminate" ? 143 : 1,
          log,
        );
        const report = JSON.parse(
          await fs.readFile(path.join(destination, "qa-report.json"), "utf8"),
        );
        assert.equal(report.status, "failed");
        assert.ok(Object.values(report.cleanup).every(Boolean));
        assert.equal(report.externalRequests, 0);
        if (["story-deadline", "interrupt", "terminate"].includes(scenario)) {
          assert.ok(
            report.phases.includes("sight-reading"),
            JSON.stringify(report),
          );
          assert.equal(report.workerForced, true);
        }
        if (scenario === "missing-browser")
          assert.match(report.error, /executable|install|browser/i);
        if (report.ownedPort)
          await assert.rejects(
            new Promise((resolve, reject) => {
              const socket = net.connect(report.ownedPort, "127.0.0.1");
              socket.on("error", reject);
              socket.on("connect", () => {
                socket.destroy();
                resolve();
              });
            }),
            { code: "ECONNREFUSED" },
          );
        assert.equal(
          await fs.readFile(
            path.join(canary, "Library", "preferences.json"),
            "utf8",
          ),
          before,
        );
        assert.deepEqual(await fs.readdir(path.join(canary, "Library")), [
          "preferences.json",
        ]);
        assert.equal(
          await (
            await fetch(`http://127.0.0.1:${unrelated.address().port}`)
          ).text(),
          "unrelated",
        );
      });
    }
  },
);

test("each repeated piano note releases the previous press if its timer was delayed", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.clock.install({ time: new Date("2025-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2025-01-01T00:01:00Z"));
    await page.evaluate(() => {
      const timer = window.setTimeout.bind(window);
      // Model a busy renderer that postpones the key-release timer.
      window.setTimeout = (callback, delay, ...args) =>
        timer(callback, delay >= 60 ? delay + 200 : delay, ...args);
      window.strokes = [];
      for (const type of ["keydown", "keyup"])
        window.addEventListener(type, (event) =>
          window.strokes.push([type, event.code]),
        );
      const start = performance.now() / 1000 + 0.06;
      window.lumaClock = () => {
        window.readClock = true;
        const now = performance.now() / 1000;
        return {
          playing: now < start + 0.7,
          now,
          start,
          origin: 0,
          secondsPerBeat: 0.1,
        };
      };
    });
    const key = { key: "a", code: "KeyA", duration: 1 };
    const performance = performPlan(page, [
      { ...key, beat: 0 },
      { ...key, beat: 1 },
    ]);
    await expect.poll(() => page.evaluate(() => window.readClock)).toBe(true);
    await page.clock.runFor(1000);
    await performance;
    assert.deepEqual(await page.evaluate(() => window.strokes), [
      ["keydown", "KeyA"],
      ["keyup", "KeyA"],
      ["keydown", "KeyA"],
      ["keyup", "KeyA"],
    ]);
  } finally {
    await browser.close();
  }
});
