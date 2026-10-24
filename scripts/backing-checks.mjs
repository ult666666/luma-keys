import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { installInputHarness } from "./input-checks.mjs";
import { setPianoVolume } from "./piano-volume.mjs";
import { connectMidi } from "./piano-input.mjs";
import { setLoopRange, openTools } from "./practice-tools.mjs";

const TITLE = "QA pop accompaniment";
const FIXTURE = {
  id: "backing-qa-a",
  title: TITLE,
  composer: "QA arrangement A",
  bpm: 120,
  tonic: 0,
  meter: 4,
  duration: 12,
  measures: 3,
  reviewed: true,
  warnings: [],
  tempos: [
    { beat: 0, bpm: 120 },
    { beat: 8, bpm: 60 },
  ],
  notes: [
    ...[72, 74, 76].map((midi, i) => ({
      id: `rh-${i}`,
      midi,
      beat: i * 4,
      duration: 4,
      hand: "right",
      velocity: 0.65,
    })),
    {
      id: "lh-held",
      midi: 48,
      beat: 0,
      duration: 10,
      hand: "left",
      velocity: 0.6,
    },
    {
      id: "lh-end",
      midi: 50,
      beat: 10,
      duration: 2,
      hand: "left",
      velocity: 0.6,
    },
  ],
};

// An original, quiet PCM tone: no copyrighted recording or external service.
export function backingWav() {
  const rate = 8000,
    samples = rate * 24,
    out = Buffer.alloc(44 + samples * 2);
  out.write("RIFF");
  out.writeUInt32LE(out.length - 8, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    out.writeInt16LE(
      Math.round(
        900 *
          Math.sin((2 * Math.PI * 220 * i) / rate) *
          Math.min(1, i / 400, (samples - i) / 400),
      ),
      44 + i * 2,
    );
  return out;
}

export async function installBackingHarness(page) {
  await installInputHarness(page);
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createBufferSource;
    const play = HTMLMediaElement.prototype.play;
    window.__backingQA = { bufferStarts: [], holdMedia: false, waiters: [] };
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this),
        start = source.start,
        ctx = this;
      source.start = function (...args) {
        window.__backingQA.bufferStarts.push({
          at: args[0] ?? ctx.currentTime,
          now: ctx.currentTime,
        });
        return start.apply(this, args);
      };
      return source;
    };
    HTMLMediaElement.prototype.play = function (...args) {
      if (
        !window.__backingQA.holdMedia ||
        !this.src.includes("/api/backing-assets/")
      )
        return play.apply(this, args);
      return new Promise((resolve, reject) =>
        window.__backingQA.waiters.push(() =>
          Promise.resolve(play.apply(this, args)).then(resolve, reject),
        ),
      );
    };
    window.__backingQA.releaseMedia = () => {
      window.__backingQA.holdMedia = false;
      window.__backingQA.waiters.splice(0).forEach((fn) => fn());
    };
  });
}

export async function verifyBacking(page, prefix = "backing-2.8") {
  const checks = [],
    measurements = {},
    errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const modal = () =>
    page.getByRole("dialog", { name: "Accompaniment · 伴奏", exact: true });
  const state = () => page.evaluate(() => window.lumaBackingState());
  const clock = () => page.evaluate(() => window.lumaClock());
  const position = () => page.getByRole("slider", { name: "Song position" });
  const enabled = () =>
    // (A switch since the 2.39 panel; still a checkbox input underneath.)
    page.getByRole("switch", { name: "Enable accompaniment", exact: true });
  // Turn it on by clicking the visible switch, as a person does (its styled
  // knob covers the input itself).
  const enable = async () => {
    if (!(await enabled().isChecked()))
      await page.locator("label.backing-switch").click();
    await expect(enabled()).toBeChecked();
  };
  const source = (name) =>
    page
      .getByRole("group", { name: "Accompaniment source", exact: true })
      .getByRole("button", { name: new RegExp(`^${name}`) });
  const style = (name) =>
    page
      .getByRole("group", { name: "Backing arrangement", exact: true })
      .getByRole("button", { name: new RegExp(`^${name}`) });
  const pause = async () => {
    if (await button("Pause").count()) await button("Pause").click();
  };
  const close = async () => {
    if (await page.getByRole("dialog").count())
      await button("Close dialog").click();
  };
  const open = async () => {
    // (Accompaniment opens from Practice tools since 2.39.)
    if (!(await button("Accompaniment").isVisible())) await openTools(page);
    await button("Accompaniment").click();
    await expect(modal()).toBeVisible();
  };
  const prefs = () =>
    page.evaluate(async () => {
      await window.lumaFlushPreferences?.();
      return (await fetch("/api/preferences")).json();
    });
  const scores = () =>
    page.evaluate(async () => (await fetch("/api/scores")).json());
  const snapshot = () =>
    page.evaluate(() => ({
      title: document.querySelector(".piece-info h1")?.textContent,
      beat: document.querySelector('[aria-label="Song position"]')?.value,
      speed: document.querySelector("select#speed")?.value,
      hand: document
        .querySelector('[aria-label="Practice hand"] [aria-checked="true"]')
        ?.className.match(/hand-(\w+)/)?.[1],
      loop: document
        .querySelector('[aria-label="Toggle phrase loop"]')
        ?.getAttribute("aria-pressed"),
      from: document.querySelector('[aria-label="Loop start bar"]')?.value,
      to: document.querySelector('[aria-label="Loop end bar"]')?.value,
      playing: window.lumaClock().playing,
    }));
  const countIn = async (value) => {
    await button("Reading settings").click();
    // (Since 2.1x playback defaults to an expressive reading whose timing
    // breathes; this story measures exact written lengths, so it reads as
    // written, like the resume-audio story.)
    await page
      .getByRole("dialog")
      .getByText("As written", { exact: true })
      .click();
    for (const [name, desired] of [
      ["Count me in", value],
      ["Metronome", false],
    ]) {
      const toggle = page.getByRole("switch", { name, exact: true });
      if ((await toggle.getAttribute("aria-checked")) !== String(desired))
        await toggle.click();
    }
    await close();
  };
  const repeat = async (from, to) => {
    if (
      (await button("Toggle phrase loop").getAttribute("aria-pressed")) !==
      "true"
    )
      await button("Toggle phrase loop").click();
    // (The repeat range lives in Practice tools since 2.39.)
    await setLoopRange(page, from, to);
  };
  const clearRepeat = async () => {
    if (
      (await button("Toggle phrase loop").getAttribute("aria-pressed")) ===
      "true"
    )
      await button("Toggle phrase loop").click();
  };
  const importScore = async (fixture) => {
    await button("Import a score").click();
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/import" &&
        r.request().method() === "POST",
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: `${fixture.id}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    const payload = await (await response).json();
    await expect(
      page.getByRole("dialog", { name: "Review score", exact: true }),
    ).toBeVisible();
    await close();
    return payload.score.id;
  };
  const choosePiece = async (composer) => {
    await pause();
    await button("Library").click();
    await page
      .locator(".piece-card")
      .filter({ hasText: composer })
      .getByRole("button", { name: /^Open / })
      .click();
    await expect(button("Play")).toBeEnabled();
  };
  const shot = async (name) => {
    if (await button("Dismiss notification").count())
      await button("Dismiss notification").click();
    await page.waitForTimeout(550);
    await page.screenshot({
      path: `evidence/${prefix}-${name}.png`,
      fullPage: false,
    });
  };
  const assertQuiet = async () => {
    const s = await state();
    assert.equal(s.audio.active, 0);
    assert.equal(s.recording.paused, true);
    assert.equal((await clock()).playing, false);
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(button("Play")).toBeEnabled();
    assert.equal((await state()).settings.enabled, false);
    await setPianoVolume(page);
    await countIn(false);
    const a = await importScore(FIXTURE);
    assert.equal((await state()).settings.enabled, false);
    assert.equal(
      (await state()).style,
      "acoustic",
      "Pop metadata chooses acoustic automatically",
    );
    await button("Listen & follow").click();
    await page
      .getByRole("radiogroup", { name: "Practice hand", exact: true })
      .locator(".hand-right")
      .click();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("0.75");
    await repeat(2, 3);
    await position().fill("5");
    const before = await snapshot();
    await open();
    for (const name of [
      "Match the piece",
      "Acoustic pop",
      "Soft strings",
      "Piano duet",
    ]) {
      await style(name).click();
      assert.deepEqual(await snapshot(), before);
    }
    await enable();
    await page
      .getByRole("slider", { name: "Accompaniment volume" })
      .fill("0.31");
    assert.deepEqual(await snapshot(), before);
    await assertQuiet();
    await shot("score-settings");
    await close();
    checks.push(
      "Backing starts off; all presets and independent mix edits preserve the paused beat, hand, speed and phrase.",
    );

    const b = await importScore({
      ...FIXTURE,
      id: "backing-qa-b",
      composer: "QA arrangement B",
      notes: FIXTURE.notes.filter((n) => n.hand === "right"),
    });
    assert.notEqual(a, b);
    assert.equal((await state()).settings.enabled, false);
    await open();
    await expect(enabled()).toBeDisabled();
    await style("Acoustic pop").click();
    await enable();
    await page
      .getByRole("slider", { name: "Accompaniment volume" })
      .fill("0.22");
    await expect(modal()).toContainText("percussion only");
    await close();
    await choosePiece("QA arrangement A");
    assert.equal((await state()).settings.style, "piano");
    assert.equal((await state()).settings.volume, 0.31);
    const saved = await prefs();
    assert.equal(saved.reading.backing[a].volume, 0.31);
    assert.equal(saved.reading.backing[b].volume, 0.22);
    const savedScores = await scores();
    await page.reload();
    await expect(button("Play")).toBeEnabled();
    await choosePiece("QA arrangement A");
    assert.equal((await state()).settings.enabled, true);
    await assertQuiet();
    checks.push(
      "Two same-title arrangements keep independent saved settings; melody-only auto adds nothing and explicit acoustic honestly offers percussion only; reload never autoplays.",
    );

    await clearRepeat();
    await button("Listen & follow").click();
    await page
      .getByRole("radiogroup", { name: "Practice hand", exact: true })
      .locator(".hand-both")
      .click();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("1");
    await countIn(false);
    await button("Start over").click();
    await expect(button("Play the other hand softly")).toHaveCount(0);
    const n = await page.evaluate(() => window.__inputQA.starts),
      start = (await state()).audio.started;
    await button("Play").click();
    await expect
      .poll(async () => (await state()).audio.started)
      .toBe(start + 1);
    await expect
      .poll(() => page.evaluate(() => window.__inputQA.starts))
      .toBe(n + 2);
    const voices = (await state()).audio.voices;
    assert.equal(voices.length, 1);
    assert.equal(voices[0].midi, 48);
    assert.equal(voices[0].instrument, "piano");
    await setPianoVolume(page, "0.83");
    assert.equal((await state()).audio.volume, 0.31);
    assert.equal((await clock()).playing, true);
    measurements.noDoubling = { sourceStarts: 2, voices };
    await pause();
    await assertQuiet();
    checks.push(
      "Both-hand Listen schedules exactly one melody voice and one written backing voice; no duplicate other-hand layer, and changing piano volume leaves backing mix and playback intact.",
    );

    await button("Start over").click();
    await countIn(true);
    const countStart = (await state()).audio.started;
    await button("Play").click();
    await expect.poll(async () => (await clock()).beat < 0).toBe(true);
    await page.waitForTimeout(300);
    const counted = await state();
    const countedClock = await clock();
    assert.ok(
      counted.audio.voices.every(
        (v) => v.start >= countedClock.start + 2 - 0.01,
      ),
    );
    await expect
      .poll(async () => (await clock()).beat < 0, { timeout: 5000 })
      .toBe(false);
    assert.equal((await state()).audio.started, countStart + 1);
    await pause();
    await countIn(false);
    await repeat(2, 2);
    await button("Start over").click();
    const loopStart = (await state()).audio.started;
    await button("Play").click();
    await expect
      .poll(async () => (await state()).audio.started)
      .toBe(loopStart + 1);
    const held = (await state()).audio.voices.find((v) => v.midi === 48);
    assert.ok(held);
    assert.ok(Math.abs(held.end - held.start - 2) < 0.03, JSON.stringify(held));
    await expect
      .poll(async () => (await state()).audio.started, { timeout: 5500 })
      .toBeGreaterThanOrEqual(loopStart + 2);
    await pause();
    await clearRepeat();
    await position().fill("8");
    await button("Play").click();
    await expect
      .poll(async () => (await state()).audio.active)
      .toBeGreaterThan(0);
    const tempoHeld = (await state()).audio.voices.find((v) => v.midi === 48);
    assert.ok(tempoHeld);
    assert.ok(Math.abs(tempoHeld.end - tempoHeld.start - 2) < 0.03);
    await pause();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("0.5");
    await position().fill("8");
    await button("Play").click();
    await expect
      .poll(async () => (await state()).audio.active)
      .toBeGreaterThan(0);
    const slowerHeld = (await state()).audio.voices.find((v) => v.midi === 48);
    assert.ok(Math.abs(slowerHeld.end - slowerHeld.start - 4) < 0.03);
    measurements.carry = {
      phrase: held,
      slowerTempo: tempoHeld,
      halfSpeed: slowerHeld,
    };
    await pause();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("1");
    await button("Play in time").click();
    await repeat(2, 2);
    await countIn(true);
    await button("Play").click();
    await expect.poll(async () => (await clock()).countingIn).toBe(true);
    const performanceCount = await clock();
    const performanceVoices = (await state()).audio.voices;
    assert.ok(performanceVoices.length > 0);
    assert.ok(
      performanceVoices.every((v) => v.start >= performanceCount.start - 0.01),
    );
    await expect
      .poll(async () => (await clock()).countingIn, { timeout: 5000 })
      .toBe(false);
    await pause();
    // (Since SCR-4 a short early stop is a pause, not a verdict: a notice
    // and no report card.)
    await expect(
      page.getByText(/Paused at bar \d+|Stopped before the first note/).first(),
    ).toBeVisible();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await clearRepeat();
    await button("Listen & follow").click();
    await countIn(false);
    await open();
    await style("Acoustic pop").click();
    await close();
    await button("Start over").click();
    await button("Play").click();
    await expect
      .poll(
        async () =>
          (await state()).audio.voices.filter(
            (v) => v.sourceType === "local-sample",
          ).length,
      )
      .toBeGreaterThanOrEqual(2);
    const acoustic = (await state()).audio;
    assert.equal(acoustic.bankStatus, "ready");
    assert.equal(
      acoustic.fallbacks,
      0,
      "Local guitar/bass must not silently fall back to synthesized samples",
    );
    assert.ok(
      acoustic.voices.some(
        (v) => v.instrument === "guitar" && v.sourceType === "local-sample",
      ),
    );
    assert.ok(
      acoustic.voices.some(
        (v) => v.instrument === "bass" && v.sourceType === "local-sample",
      ),
    );
    measurements.acoustic = acoustic;
    measurements.performCountIn = {
      clock: performanceCount,
      voices: performanceVoices,
    };
    await pause();
    await open();
    await style("Piano duet").click();
    await close();
    checks.push(
      "Backing starts after Listen and Perform count-ins, carries sustained notes through phrase repeats and tempo/speed changes; acoustic guitar and bass use the local sample bank.",
    );

    await button("Wait for me").click();
    await page
      .getByRole("radiogroup", { name: "Practice hand", exact: true })
      .locator(".hand-right")
      .click();
    await connectMidi(page);
    await button("Start over").click();
    const waiting = (await state()).audio.started;
    await button("Play").click();
    await page.waitForTimeout(350);
    assert.equal((await state()).audio.started, waiting);
    assert.equal((await state()).audio.active, 0);
    await page.evaluate(() =>
      window.__inputQA.a.onmidimessage({ data: [144, 72, 90] }),
    );
    await expect(position()).toHaveValue("4");
    await page.evaluate(() =>
      window.__inputQA.a.onmidimessage({ data: [128, 72, 0] }),
    );
    await open();
    await assertQuiet();
    const inputStarts = await page.evaluate(() => window.__inputQA.starts);
    await page.getByRole("slider", { name: "Accompaniment volume" }).focus();
    await page.keyboard.press("a");
    await page.keyboard.press("Space");
    await page.evaluate(() =>
      window.__inputQA.a.onmidimessage({ data: [144, 72, 90] }),
    );
    await page.waitForTimeout(80);
    assert.equal(
      await page.evaluate(() => window.__inputQA.starts),
      inputStarts,
    );
    await page.keyboard.press("Escape");
    await expect(modal()).toHaveCount(0);
    // (Accompaniment opens from Practice tools, which closes as the dialog
    // opens; focus comes back to the drawer's own button.)
    await expect(button("Practice tools")).toBeFocused();
    await button("Listen & follow").click();
    await button("Start over").click();
    await page.evaluate(() => (window.__inputQA.hold = true));
    await button("Play").click();
    await expect
      .poll(() => page.evaluate(() => window.__inputQA.waiters.length))
      .toBeGreaterThan(0);
    await open();
    await page.evaluate(() => window.__inputQA.release());
    await page.waitForTimeout(150);
    await assertQuiet();
    await close();
    checks.push(
      "Wait mode keeps backing silent while real simulated MIDI advances the score; accompaniment modal blocks notes and shortcuts, restores focus and cancels a pending audio startup.",
    );

    await open();
    await source("Audio recording").click();
    await expect(enabled()).toBeDisabled();
    let releaseUpload;
    const heldUpload = new Promise((resolve) => (releaseUpload = resolve));
    const intercept = async (route) => {
      await heldUpload;
      await route.continue();
    };
    await page.route("**/api/backing-assets", intercept);
    await page.getByLabel("Backing audio file", { exact: true }).setInputFiles({
      name: "QA 晴天 backing.wav",
      mimeType: "audio/wav",
      buffer: backingWav(),
    });
    await expect(source("From the score")).toBeDisabled();
    await expect(source("Audio recording")).toBeDisabled();
    releaseUpload();
    await expect(
      page.getByLabel("Preview backing recording", { exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/backing-assets", intercept);
    let track = (await state()).settings.track;
    assert.ok(track.id);
    assert.ok(Math.abs(track.duration - 24) < 0.02);
    assert.equal((await state()).settings.enabled, false);
    const range = await page.request.get(
      new URL(`/api/backing-assets/${track.id}`, page.url()).href,
      { headers: { Range: "bytes=0-15" } },
    );
    assert.equal(range.status(), 206);
    assert.deepEqual(await range.body(), backingWav().subarray(0, 16));
    const firstTrack = track;
    let releaseReplacement;
    const pendingReplacement = new Promise(
      (resolve) => (releaseReplacement = resolve),
    );
    const replacementRoute = async (route) => {
      await pendingReplacement;
      await route.continue();
    };
    await page.route("**/api/backing-assets", replacementRoute);
    await page.getByLabel("Backing audio file", { exact: true }).setInputFiles({
      name: "QA 晴天 replacement.wav",
      mimeType: "audio/wav",
      buffer: backingWav(),
    });
    await expect(button("Unlink this audio")).toBeDisabled();
    await expect(source("From the score")).toBeDisabled();
    releaseReplacement();
    await expect
      .poll(async () => (await state()).settings.track.id)
      .not.toBe(firstTrack.id);
    await page.unroute("**/api/backing-assets", replacementRoute);
    track = (await state()).settings.track;
    assert.equal(
      (
        await page.request.get(
          new URL(`/api/backing-assets/${firstTrack.id}`, page.url()).href,
        )
      ).status(),
      200,
    );
    const tempoInput = page.getByRole("spinbutton", {
      name: "Recording tempo",
      exact: true,
    });
    await tempoInput.focus();
    await tempoInput.press("ControlOrMeta+A");
    await tempoInput.pressSequentially("60");
    assert.equal(
      (await state()).settings.track.bpm,
      120,
      "Draft tempo must not commit a partial first digit",
    );
    await tempoInput.press("Tab");
    assert.equal((await state()).settings.track.bpm, 60);
    await tempoInput.focus();
    await tempoInput.press("ControlOrMeta+A");
    await tempoInput.pressSequentially("10");
    await tempoInput.press("Tab");
    await expect(tempoInput).toHaveValue("60");
    assert.equal((await state()).settings.track.bpm, 60);
    await tempoInput.focus();
    await tempoInput.press("ControlOrMeta+A");
    await tempoInput.pressSequentially("120");
    await tempoInput.press("Enter");
    assert.equal((await state()).settings.track.bpm, 120);
    const offsetInput = page.getByRole("spinbutton", {
      name: "Audio start offset",
      exact: true,
    });
    await offsetInput.focus();
    await offsetInput.press("ControlOrMeta+A");
    await offsetInput.pressSequentially("0.75");
    await offsetInput.press("Tab");
    assert.equal((await state()).settings.track.offset, 0.75);
    await enable();
    await page
      .getByLabel("Preview backing recording", { exact: true })
      .evaluate(async (media) => {
        window.__backingPreview = media;
        await media.play();
      });
    await expect
      .poll(() => page.evaluate(() => window.__backingPreview.paused))
      .toBe(false);
    await source("From the score").click();
    assert.equal(
      await page.evaluate(() => window.__backingPreview.paused),
      true,
    );
    await source("Audio recording").click();
    assert.equal(
      await page
        .getByLabel("Preview backing recording")
        .evaluate((el) => el.volume),
      0.31,
    );
    await page
      .getByLabel("Preview backing recording")
      .evaluate(async (media) => {
        window.__backingPreview = media;
        await media.play();
      });
    await shot("recording-settings");
    await close();
    assert.equal(
      await page.evaluate(() => window.__backingPreview.paused),
      true,
    );
    measurements.recordingAsset = track;
    checks.push(
      "A real locally generated WAV imports with decoded duration and byte-range delivery; upload locks source/unlink actions, typed alignment commits on blur/Enter and rejects invalid tempo, and detached previews pause on source change and close.",
    );

    await countIn(false);
    await clearRepeat();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("0.5");
    await position().fill("4");
    await button("Play").click();
    await expect.poll(async () => (await state()).recording.paused).toBe(false);
    await page.waitForTimeout(250);
    let sync = await page.evaluate(() => ({
      backing: window.lumaBackingState(),
      clock: window.lumaClock(),
    }));
    assert.equal(sync.backing.recording.rate, 0.5);
    assert.equal(sync.backing.recording.preservesPitch, true);
    assert.ok(
      Math.abs(
        sync.backing.recording.currentTime - (0.75 + sync.clock.beat * 0.5),
      ) < 0.4,
      JSON.stringify(sync),
    );
    assert.equal(sync.backing.recording.volume, 0.31);
    assert.equal(sync.backing.audio.active, 0);
    await pause();
    const pausedAt = (await state()).recording.currentTime;
    await page.waitForTimeout(200);
    assert.ok(
      Math.abs((await state()).recording.currentTime - pausedAt) < 0.05,
    );
    await position().fill("8");
    await button("Play").click();
    await expect.poll(async () => (await state()).recording.paused).toBe(false);
    assert.equal((await state()).recording.rate, 0.25);
    await pause();
    await page
      .getByRole("combobox", { name: "Practice speed", exact: true })
      .selectOption("1");
    await repeat(2, 2);
    const seekStart = (await state()).recording.seeks;
    await button("Play").click();
    await expect
      .poll(async () => (await state()).recording.seeks, { timeout: 6000 })
      .toBeGreaterThanOrEqual(seekStart + 2);
    await pause();
    measurements.recordingSync = sync;
    checks.push(
      "Recording playback aligns offset and written beat, preserves pitch, follows slower practice and a score tempo change, pauses without drift and seeks on phrase repeats.",
    );

    await clearRepeat();
    await button("Start over").click();
    await countIn(true);
    const recordingStarts = (await state()).recording.starts;
    await button("Play").click();
    await expect.poll(async () => (await clock()).beat < 0).toBe(true);
    await page.waitForTimeout(300);
    assert.equal((await state()).recording.starts, recordingStarts);
    assert.equal((await state()).recording.paused, true);
    await expect
      .poll(async () => (await state()).recording.paused, { timeout: 5000 })
      .toBe(false);
    await pause();
    await countIn(false);
    await button("Start over").click();
    await page.evaluate(() => (window.__backingQA.holdMedia = true));
    await button("Play").click();
    await expect
      .poll(() => page.evaluate(() => window.__backingQA.waiters.length))
      .toBe(1);
    await pause();
    await page.evaluate(() => window.__backingQA.releaseMedia());
    await page.waitForTimeout(200);
    await assertQuiet();
    await button("Wait for me").click();
    await button("Play").click();
    await page.waitForTimeout(200);
    assert.equal((await state()).recording.paused, true);
    await pause();
    checks.push(
      "Recordings remain paused throughout count-in and Wait mode; pausing while media.play is pending prevents a late audible restart.",
    );

    await prefs();
    await page.reload();
    await expect(button("Play")).toBeEnabled();
    await choosePiece("QA arrangement A");
    assert.equal((await state()).settings.track.id, track.id);
    assert.equal((await state()).settings.track.offset, 0.75);
    await assertQuiet();
    await button("Listen & follow").click();
    await button("Play").click();
    await expect.poll(async () => (await state()).recording.paused).toBe(false);
    // Navigate directly while active: changing screens/score must stop the old recording.
    await button("Library").click();
    await expect.poll(async () => (await state()).recording.paused).toBe(true);
    await page
      .locator(".piece-card")
      .filter({ hasText: "QA arrangement B" })
      .getByRole("button", { name: /^Open / })
      .click();
    assert.equal((await state()).settings.volume, 0.22);
    assert.equal((await state()).settings.track, null);
    await choosePiece("QA arrangement A");
    await open();
    await button("Unlink this audio").click();
    assert.equal((await state()).settings.track, null);
    assert.equal((await state()).settings.enabled, false);
    assert.equal(
      (
        await page.request.get(
          new URL(`/api/backing-assets/${track.id}`, page.url()).href,
        )
      ).status(),
      200,
    );
    await close();
    assert.deepEqual(await scores(), savedScores);
    checks.push(
      "Reload restores each track without autoplay; navigation and score changes stop old audio, unlinking leaves its local asset recoverable, and accompaniment never rewrites score notes.",
    );

    await open();
    await source("From the score").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const bounds = await modal().evaluate((el) => ({
      page: document.documentElement.scrollWidth,
      width: innerWidth,
      left: el.getBoundingClientRect().left,
      right: el.getBoundingClientRect().right,
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    assert.ok(
      bounds.page <= 391 &&
        bounds.left >= -1 &&
        bounds.right <= 391 &&
        bounds.scroll <= bounds.client + 1,
      JSON.stringify(bounds),
    );
    await modal().evaluate((el) =>
      el.scrollTo({ top: 0, behavior: "instant" }),
    );
    await shot("mobile-top");
    await page
      .getByRole("slider", { name: "Accompaniment volume" })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("slider", { name: "Accompaniment volume" }),
    ).toBeInViewport();
    await shot("mobile-settings");
    await close();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await clearRepeat();
    const playBounds = await button("Play").boundingBox();
    assert.ok(
      playBounds.y + playBounds.height <= 800,
      JSON.stringify(playBounds),
    );
    assert.equal(await page.locator(".piano-key").count(), 88);
    await shot("practice");
    measurements.layout = { mobile: bounds, play: playBounds };
    assert.deepEqual(errors, []);
    checks.push(
      "The accompaniment panel fits a 390px viewport with reachable controls under reduced motion; the 1280×800 practice page keeps Play visible and all 88 keys present.",
    );
    return { checks, measurements, errors };
  } catch (error) {
    error.backingEvidence = {
      checks,
      measurements,
      errors,
      state: await state().catch(() => null),
      clock: await clock().catch(() => null),
      snapshot: await snapshot().catch(() => null),
    };
    throw error;
  } finally {
    page.off("pageerror", onError);
  }
}
