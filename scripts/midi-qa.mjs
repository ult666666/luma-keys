import { trackTestData } from "./qa-cleanup.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const input = { name: "Test MIDI keyboard", onmidimessage: null };
  window.__midiInput = input;
  Object.defineProperty(navigator, "requestMIDIAccess", {
    value: async () => ({
      inputs: new Map([["test", input]]),
      onstatechange: null,
    }),
  });
});
const cleanup = await trackTestData(page);
try {
  await page.goto("http://127.0.0.1:5188");
  await page
    .getByRole("button", { name: "Connect keyboard", exact: true })
    .click();
  await page.getByRole("button", { name: /Test MIDI keyboard/ }).waitFor();
  await page.getByRole("button", { name: "Wait for me", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.evaluate(() =>
    window.__midiInput.onmidimessage({ data: [144, 62, 100] }),
  );
  await page.waitForTimeout(100);
  assert.equal(
    +(await page.getByRole("slider", { name: "Song position" }).inputValue()),
    0,
  );
  await page.evaluate(() =>
    window.__midiInput.onmidimessage({ data: [128, 62, 0] }),
  );
  await page.evaluate(() =>
    window.__midiInput.onmidimessage({ data: [144, 60, 100] }),
  );
  await page.waitForTimeout(100);
  assert.equal(
    +(await page.getByRole("slider", { name: "Song position" }).inputValue()),
    1,
  );
  await page.evaluate(() =>
    window.__midiInput.onmidimessage({ data: [176, 64, 127] }),
  );
  await page
    .getByRole("button", { name: /Test MIDI keyboard · sustain/ })
    .waitFor();
  await page.evaluate(() => {
    window.__midiInput.onmidimessage({ data: [128, 60, 0] });
    window.__midiInput.onmidimessage({ data: [176, 64, 0] });
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "evidence/midi-qa.json",
    JSON.stringify(
      {
        passed: true,
        simulated: true,
        physicalHardwareTested: false,
        checks: [
          "MIDI device binding",
          "Note-on and note-off",
          "Wrong note stays on current chord",
          "Correct MIDI note advances",
          "CC64 sustain pedal",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS simulated MIDI input and sustain; physical hardware not tested.",
  );
} finally {
  await browser.close();
  await cleanup();
}
