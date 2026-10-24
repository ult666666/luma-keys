import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { demos } from "../src/music.mjs";
import { setPianoVolume } from "./piano-volume.mjs";

// The caller owns an isolated QA library and its import/preference cleanup.
// Use real controls and actual CSS animation events, without replacing app code.
export async function verifyOverlapMotion(page, prefix = "overlap-motion") {
  const checks = [],
    errors = [],
    checkpoints = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const play = () => page.getByRole("button", { name: "Play", exact: true });
  const pause = () => page.getByRole("button", { name: "Pause", exact: true });
  const key = page.locator('.piano-key[data-midi="60"]');
  const position = async () =>
    +(await page.getByRole("slider", { name: "Song position" }).inputValue());
  const attacks = () =>
    page.evaluate(() => window.__overlapMotion.records.length);
  const phase = (name) =>
    page.evaluate((name) => {
      window.__overlapMotion.phase = name;
    }, name);
  // Since 2.4 the stage renews a key's landing per new voice and also when
  // playback starts a new epoch, so the claims are relative: an onset adds
  // at least one landing, a release, a pause or a held note adds none.
  let seen = 0;
  const checkpoint = async (name, expected) => {
    const snapshot = await page.evaluate(() => {
      const trace = window.__overlapMotion;
      return {
        attacks: trace.records.length,
        beat: +document.querySelector('[aria-label="Song position"]').value,
        keys: document.querySelectorAll(".piano-key").length,
        stable: [...trace.buttons].every(
          ([midi, button]) =>
            document.querySelector(`.piano-key[data-midi="${midi}"]`) ===
            button,
        ),
        sounding: document
          .querySelector('.piano-key[data-midi="60"]')
          .classList.contains("sounding"),
        records: trace.records.slice(),
      };
    });
    if (expected === "attack")
      assert.ok(
        snapshot.attacks > seen,
        `${name}: no new landing ${JSON.stringify(snapshot.records)}`,
      );
    else
      assert.equal(
        snapshot.attacks,
        seen,
        `${name}: an extra landing ${JSON.stringify(snapshot.records)}`,
      );
    seen = snapshot.attacks;
    assert.equal(snapshot.keys, 88);
    assert.equal(
      snapshot.stable,
      true,
      "All 88 piano hit targets must retain their DOM identity",
    );
    checkpoints.push({ name, ...snapshot });
    return snapshot;
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
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
          id: `${prefix}-fixture`,
          title: "Overlapping C4 motion check",
          composer: "Luma Keys regression fixture",
          bpm: 30,
          meter: 4,
          duration: 8,
          measures: 2,
          measureStarts: [0, 4],
          measureLengths: [4, 4],
          xml: undefined,
          notes: [
            {
              id: "held-c4",
              midi: 60,
              beat: 0,
              duration: 4,
              hand: "right",
              velocity: 0.7,
              measure: 1,
            },
            {
              id: "short-c4",
              midi: 60,
              beat: 1,
              duration: 1,
              hand: "right",
              velocity: 0.7,
              measure: 1,
            },
          ],
        }),
      ),
    });
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Listen & follow", exact: true })
      .click();
    await page
      .getByRole("radiogroup", { name: "Practice hand" })
      .locator(".hand-both")
      .click();
    await page
      .getByRole("combobox", { name: "Practice speed" })
      .selectOption("1");
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();
    for (const name of ["Count me in", "Metronome"]) {
      const toggle = page.getByRole("switch", { name, exact: true });
      if ((await toggle.getAttribute("aria-checked")) === "true")
        await toggle.click();
    }
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    await page.getByRole("button", { name: "Start over", exact: true }).click();
    await expect(page.locator(".piano-key")).toHaveCount(88);
    await page.evaluate(() => {
      const buttons = new Map(
        [...document.querySelectorAll(".piano-key")].map((button) => [
          button.dataset.midi,
          button,
        ]),
      );
      const button = buttons.get("60"),
        nodes = [],
        records = [];
      const trace = { buttons, records, phase: "ready" };
      // Since 2.4 the key's attack shows as a landing element the stage adds
      // once per new voice (keyed by the key's attack generation), and never
      // on a release; the 1.x per-key resonance animation is gone.
      const record = (node) => {
        let index = nodes.indexOf(node);
        if (index < 0) index = nodes.push(node) - 1;
        records.push({
          phase: trace.phase,
          beat: +document.querySelector('[aria-label="Song position"]').value,
          node: index,
          retainedButton:
            button === document.querySelector('.piano-key[data-midi="60"]'),
        });
      };
      const observer = new MutationObserver((list) => {
        for (const m of list)
          for (const added of m.addedNodes)
            if (added.classList?.contains("land-splash")) record(added);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      trace.cleanup = () => observer.disconnect();
      window.__overlapMotion = trace;
    });

    await phase("held-note-start");
    await play().click();
    await pause().waitFor();
    await expect.poll(attacks).toBeGreaterThan(seen);
    assert.equal((await checkpoint("Long C4 onset", "attack")).sounding, true);
    await phase("overlapping-note-start");
    await expect.poll(attacks).toBeGreaterThan(seen);
    assert.equal(
      (await checkpoint("Short C4 onset while long C4 holds", "attack"))
        .sounding,
      true,
    );
    await phase("short-note-release");
    await expect.poll(position).toBeGreaterThan(2.15);
    assert.equal(
      (await checkpoint("Short note ends without another attack", "none"))
        .sounding,
      true,
    );
    checks.push(
      "Overlapping C4 onsets each animate, but the short note ending does not replay the long note's attack",
    );

    await phase("live-key-start");
    await page.keyboard.down("a");
    await expect(key).toHaveClass(/pressed/);
    await expect.poll(attacks).toBeGreaterThan(seen);
    const held = await checkpoint(
      "Live C4 adds one attack over the held playback note",
      "attack",
    );
    assert.ok(held.beat < 4, "Live input must overlap the long playback note");
    await phase("live-key-release");
    await page.keyboard.up("a");
    await expect(key).not.toHaveClass(/pressed/);
    const releaseBeat = await position();
    // Observe transport progress after release so a delayed CSS animationstart
    // is included, without relying on a fixed machine-dependent sleep.
    await expect.poll(position).toBeGreaterThan(releaseBeat + 0.15);
    const released = await checkpoint(
      "Live release leaves held playback without a false attack",
      "none",
    );
    assert.ok(
      released.beat < 4,
      "The long note must still be held at the release check",
    );
    assert.equal(released.sounding, true);
    checks.push(
      "Live C4 input adds one attack; releasing it while playback still holds C4 adds none",
    );

    await phase("pause");
    await pause().click();
    await expect(key).not.toHaveClass(/sounding|pressed/);
    await checkpoint("Pause releases the key without another attack", "none");
    await page.getByRole("button", { name: "Start over", exact: true }).click();
    await phase("restart");
    await play().click();
    await pause().waitFor();
    await expect.poll(attacks).toBeGreaterThan(seen);
    const restarted = await checkpoint(
      "Starting again legitimately attacks the first C4",
      "attack",
    );
    assert.ok(
      restarted.beat < 1,
      "Restart attack belongs to the first long note",
    );
    // (Every landing is a new element: no attack reuses an old one.)
    assert.equal(
      new Set(restarted.records.map((record) => record.node)).size,
      restarted.records.length,
    );
    assert.ok(restarted.records.every((record) => record.retainedButton));
    await pause().click();
    await checkpoint("Final stop leaves no further attack", "none");
    await page.screenshot({
      path: `evidence/${prefix}-verified.png`,
      fullPage: true,
    });
    checks.push(
      "Pause/start-over/play permits a new attack while all 88 piano buttons retain their original DOM identity",
    );
    assert.deepEqual(errors, []);
    return {
      checks,
      errors,
      checkpoints,
      expectedAttacks: "relative: onsets add landings, releases add none",
      audioOutput: "Piano volume set to zero",
      physicalHardwareTested: false,
    };
  } catch (error) {
    error.overlapEvidence = {
      checkpoints,
      errors,
      records: await page
        .evaluate(() => window.__overlapMotion?.records || [])
        .catch(() => []),
      beat: await position().catch(() => null),
    };
    throw error;
  } finally {
    await page.keyboard.up("a").catch(() => {});
    if (
      await pause()
        .count()
        .catch(() => 0)
    )
      await pause()
        .click()
        .catch(() => {});
    await page
      .evaluate(() => {
        window.__overlapMotion?.cleanup();
        delete window.__overlapMotion;
      })
      .catch(() => {});
    page.off("pageerror", onError);
  }
}
