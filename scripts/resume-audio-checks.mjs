import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { demos } from "../src/music.mjs";
import { setPianoVolume } from "./piano-volume.mjs";
import { planPianoStart, pianoNoteSeconds } from "../src/piano-phrasing.mjs";
import { damperRelease } from "../src/audio.js";
import { setLoopRange } from "./practice-tools.mjs";

// The sampled voice's length as the app plans it for a written (unshaped)
// reading of a held note picked up at `from`: the remaining sound to the
// key's release (gated from the note's own start, clipped at `end`), then
// the damper's tail (the voice stops seven release times after it lets go).
// Since 2.12 the grand's release is per pitch, so it is derived here from the
// same functions the app uses rather than written as a constant.
function expectedVoiceSeconds(score, note, from, end) {
  const plan = planPianoStart([note], from, end, score);
  const carry = plan.continuations[0];
  if (!carry) return null;
  const sounding = pianoNoteSeconds(
    score,
    1,
    from,
    from + carry.duration,
    end,
    note,
  );
  return Math.max(0.02, sounding) + 7 * damperRelease(note.midi);
}

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
    await setPianoVolume(page);
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
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await close();
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();
    const count = page.getByRole("switch", { name: "Count me in" });
    if ((await count.getAttribute("aria-checked")) === "true")
      await count.click();
    // (A written reading: the expressive one shapes a held note's gate and
    // timing, which this story does not test.)
    await page
      .getByRole("dialog")
      .getByText("As written", { exact: true })
      .click();
    await close();
    const heldScore = {
      bpm: 120,
      pedals: [],
      duration: 12,
      measures: 3,
      measureStarts: [0, 4, 8],
      measureLengths: [4, 4, 4],
      notes: [],
    };
    const heldNote = {
      id: "long-c4",
      midi: 60,
      beat: 0,
      duration: 12,
      hand: "right",
      velocity: 0.7,
    };
    measurements.expected = {
      from4: expectedVoiceSeconds(heldScore, heldNote, 4, 12),
      loop: expectedVoiceSeconds(heldScore, heldNote, 4, 8),
    };
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
      Math.abs(
        first[0].stops[0] - first[0].start - measurements.expected.from4,
      ) < 0.03,
      `Remaining eight beats plus the damper's tail: ${(first[0].stops[0] - first[0].start).toFixed(3)} s vs ${measurements.expected.from4.toFixed(3)} s`,
    );
    await expect(page.locator('.piano-key[data-midi="60"]')).toHaveClass(
      /sounding/,
    );
    checks.push(
      "Starting inside a written sustain schedules one sampled voice for its remaining duration and lights the same key",
    );
    await pause().click();
    // Playback resumes where the transport stopped. On speakers that is the
    // position shown; with Bluetooth's latency the display trails it by what
    // was still on its way to the ears, so read the transport itself.
    const resumeAt = await page.evaluate(() => window.lumaClock().beat),
      before = (await records()).length;
    await play().click();
    await pause().waitFor();
    await expect.poll(async () => (await records()).length).toBe(before + 1);
    const resumed = (await records()).at(-1);
    measurements.resume = { resumeAt, voice: resumed };
    const resumedExpected = expectedVoiceSeconds(
      heldScore,
      heldNote,
      resumeAt,
      12,
    );
    measurements.expected.resume = resumedExpected;
    assert.ok(
      Math.abs(resumed.stops[0] - resumed.start - resumedExpected) < 0.08,
      `Pause/resume should use remaining duration: ${(resumed.stops[0] - resumed.start).toFixed(3)} s vs ${resumedExpected.toFixed(3)} s`,
    );
    await pause().click();
    checks.push(
      "Pause/resume restores a mid-note sustain without replaying its full written duration",
    );
    await page
      .getByRole("button", { name: "Toggle phrase loop", exact: true })
      .click();
    await setLoopRange(page, 2, 2);
    await page.getByRole("slider", { name: "Song position" }).fill("4");
    const loopBefore = (await records()).length;
    await page.evaluate(() => {
      // (Each attack on a key gets a fresh landing element, keyed by the
      // key's attack generation — also while the hands hide it. One per
      // loop cycle means a fresh attack per cycle, not a held voice.)
      window.__resumeAttacks = 0;
      window.__resumeObserver?.disconnect();
      window.__resumeObserver = new MutationObserver((list) => {
        for (const m of list)
          for (const node of m.addedNodes)
            if (node.classList?.contains("land-splash"))
              window.__resumeAttacks++;
      });
      window.__resumeObserver.observe(document.body, {
        childList: true,
        subtree: true,
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
        Math.abs(voice.stops[0] - voice.start - measurements.expected.loop) <
          0.04,
        `Carry-in is clipped to loop end: ${(voice.stops[0] - voice.start).toFixed(3)} s vs ${measurements.expected.loop.toFixed(3)} s`,
      );
    assert.ok(
      Math.abs(loops[1].start - loops[0].start - 2) < 0.15,
      "Loop cadence follows four quarter notes",
    );
    // (Every looped voice gets a fresh landing on its key — the loop's wrap
    // also renews it, so there can be more renewals than voices — and the
    // landings never stack: one at most on the key at any moment.)
    await expect
      .poll(() => page.evaluate(() => window.__resumeAttacks))
      .toBeGreaterThanOrEqual(loops.length);
    assert.ok(
      (await page.locator(".land-splash").count()) <= 1,
      "one landing at most on the held key",
    );
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
