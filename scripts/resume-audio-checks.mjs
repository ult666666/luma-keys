import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { demos } from "../src/music.mjs";

export async function installResumeAudioHarness(page) {
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createBufferSource;
    window.__resumeAudio = [];
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this),
        start = source.start,
        stop = source.stop;
      const record = { start: null, stops: [] };
      window.__resumeAudio.push(record);
      source.start = function (at, ...rest) {
        record.start = at;
        return start.call(this, at, ...rest);
      };
      source.stop = function (at, ...rest) {
        record.stops.push(at);
        return stop.call(this, at, ...rest);
      };
      return source;
    };
  });
}
export async function verifyResumeAudio(
  page,
  prefix = "resume-audio",
  baseline = false,
) {
  const checks = [],
    errors = [],
    measurements = {};
  const onError = (e) => errors.push(e.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const play = () => page.getByRole("button", { name: "Play", exact: true });
  const pause = () => page.getByRole("button", { name: "Pause", exact: true });
  const position = async () =>
    +(await page.getByRole("slider", { name: "Song position" }).inputValue());
  const records = () => page.evaluate(() => window.__resumeAudio);
  const close = () =>
    page.getByRole("button", { name: "Close dialog", exact: true }).click();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(play()).toBeEnabled();
    await page.getByRole("slider", { name: "Piano volume" }).fill("0");
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${prefix}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...demos()[0],
          id: prefix,
          title: "Sustained-note resume check",
          composer: "QA fixture",
          bpm: 120,
          meter: 4,
          duration: 12,
          measures: 3,
          measureStarts: [0, 4, 8],
          measureLengths: [4, 4, 4],
          xml: undefined,
          notes: [
            {
              id: "long-c4",
              midi: 60,
              beat: 0,
              duration: 12,
              hand: "right",
              velocity: 0.7,
              measure: 1,
            },
          ],
        }),
      ),
    });
    await page.getByRole("dialog", { name: "Make the music yours" }).waitFor();
    await close();
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();
    const count = page.getByRole("switch", { name: "Count me in" });
    if ((await count.getAttribute("aria-checked")) === "true")
      await count.click();
    await close();
    await page
      .getByRole("combobox", { name: "Practice speed" })
      .selectOption("1");
    await page.getByRole("slider", { name: "Song position" }).fill("4");
    await play().click();
    await pause().waitFor();
    await expect.poll(position).toBeGreaterThan(4.35);
    const first = await records();
    measurements.midNoteStart = { beat: await position(), sources: first };
    if (baseline)
      return { reproduced: first.length === 0, measurements, errors };
    assert.equal(
      first.length,
      1,
      "Starting inside a sustained C4 must start its remaining sound exactly once",
    );
    assert.ok(
      Math.abs(first[0].stops[0] - first[0].start - (8 * 0.5 * 0.94 + 0.7)) <
        0.03,
      "Remaining eight beats plus existing release tail",
    );
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /sounding/,
    );
    checks.push(
      "Starting inside a written sustain schedules one sampled voice for its remaining duration and lights the same key",
    );
    await pause().click();
    const resumeAt = await position(),
      before = (await records()).length;
    await play().click();
    await pause().waitFor();
    await expect.poll(async () => (await records()).length).toBe(before + 1);
    const resumed = (await records()).at(-1);
    measurements.resume = { resumeAt, voice: resumed };
    assert.ok(
      Math.abs(
        resumed.stops[0] - resumed.start - ((12 - resumeAt) * 0.5 * 0.94 + 0.7),
      ) < 0.08,
      "Pause/resume should use remaining duration",
    );
    await pause().click();
    checks.push(
      "Pause/resume restores a mid-note sustain without replaying its full written duration",
    );
    await page
      .getByRole("button", { name: "Toggle phrase loop", exact: true })
      .click();
    await page.getByRole("spinbutton", { name: "Loop end bar" }).fill("2");
    await page.getByRole("spinbutton", { name: "Loop start bar" }).fill("2");
    await page.getByRole("slider", { name: "Song position" }).fill("4");
    const loopBefore = (await records()).length;
    await page.evaluate(() => {
      window.__resumeAttacks = 0;
      document
        .querySelector('.piano-key[data-midi="60"]')
        .addEventListener("animationstart", (e) => {
          if (e.animationName === "piano-resonance") window.__resumeAttacks++;
        });
    });
    await play().click();
    await pause().waitFor();
    await expect
      .poll(async () => (await records()).length)
      .toBeGreaterThanOrEqual(loopBefore + 2);
    const loops = (await records()).slice(loopBefore);
    measurements.loop = loops;
    assert.equal(
      loops.length,
      2,
      "Carry-only loop starts exactly one voice per cycle",
    );
    for (const voice of loops)
      assert.ok(
        Math.abs(voice.stops[0] - voice.start - (4 * 0.5 * 0.94 + 0.7)) < 0.04,
        "Carry-in is clipped to loop end",
      );
    assert.ok(
      Math.abs(loops[1].start - loops[0].start - 2) < 0.15,
      "Loop cadence follows four quarter notes",
    );
    await expect
      .poll(() => page.evaluate(() => window.__resumeAttacks))
      .toBe(2);
    await expect(page.locator(".reader-cue-label")).toContainText("HOLD");
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /sounding/,
    );
    await page.screenshot({
      path: `evidence/${prefix}-carry-loop.png`,
      fullPage: true,
    });
    await pause().click();
    checks.push(
      "A loop containing only a carry-in sustain plays each cycle, clips its duration, shows HOLD and restarts the attack animation",
    );
    await page
      .getByRole("button", { name: "Wait for me", exact: true })
      .click();
    const waitBefore = (await records()).length;
    await play().click();
    await expect(play()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toHaveCount(0);
    assert.equal((await records()).length, waitBefore);
    checks.push(
      "Wait mode still avoids inventing new onsets in a carry-only phrase",
    );
    assert.deepEqual(errors, []);
    return {
      checks,
      measurements,
      errors,
      audio:
        "Actual sampled AudioBufferSourceNode start/stop scheduling measured; QA output muted",
    };
  } finally {
    if (
      await pause()
        .count()
        .catch(() => 0)
    )
      await pause()
        .click()
        .catch(() => {});
    page.off("pageerror", onError);
  }
}
