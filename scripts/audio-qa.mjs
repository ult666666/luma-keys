import { trackTestData } from "./qa-cleanup.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage();
const cleanup = await trackTestData(p);
try {
  await p.goto("http://127.0.0.1:5188");
  const results = await p.evaluate(async () => {
    const { piano } = await import("/src/audio.js");
    await piano.prepare();
    return [...piano.buffers].map(([m, b]) => {
      const data = b.getChannelData(0);
      let sum = 0,
        peak = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
        peak = Math.max(peak, Math.abs(data[i]));
      }
      return {
        midi: m,
        seconds: b.duration,
        channels: b.numberOfChannels,
        peak,
        rms: Math.sqrt(sum / data.length),
      };
    });
  });
  assert.equal(results.length, 30);
  assert.ok(results.every((r) => r.peak > 0.005 && r.seconds > 0.2));
  const key = p.getByRole("button", { name: "C4 1 Do", exact: true });
  await key.focus();
  await p.keyboard.down("Enter");
  await p.waitForTimeout(80);
  assert.equal(await p.locator(".middle-c.pressed").count(), 1);
  await p.keyboard.up("Enter");
  assert.equal(await p.locator(".middle-c.pressed").count(), 0);
  await fs.writeFile(
    "evidence/audio-qa.json",
    JSON.stringify(
      {
        passed: true,
        allSamplesAudibleSignal: true,
        keyboardAccessibleKeys: true,
        samples: results,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS all 30 samples contain non-silent piano signal; focused key Enter plays and releases.",
  );
} finally {
  await b.close();
  await cleanup();
}
