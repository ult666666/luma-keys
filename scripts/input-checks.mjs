import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { pianoVolume, setPianoVolume } from "./piano-volume.mjs";
import { setLoopEnd } from "./practice-tools.mjs";
import { connectMidi } from "./piano-input.mjs";

export async function installInputHarness(page) {
  await page.addInitScript(() => {
    const NativeAudioContext = AudioContext,
      resume = NativeAudioContext.prototype.resume,
      create = NativeAudioContext.prototype.createBufferSource;
    window.__inputQA = {
      hold: false,
      waiters: [],
      contexts: [],
      resumes: 0,
      starts: 0,
      requests: 0,
      sources: [],
    };
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        window.__inputQA.contexts.push(this);
      }
    };
    NativeAudioContext.prototype.resume = function () {
      window.__inputQA.resumes++;
      if (!window.__inputQA.hold) return resume.call(this);
      // Hold the actual context suspended, not only its return promise. The
      // engine correctly avoids resume() when an output is already running.
      return new Promise((resolve, reject) => {
        window.__inputQA.waiters.push(() =>
          Promise.resolve()
            .then(() => resume.call(this))
            .then(resolve, reject),
        );
      });
    };
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this),
        start = source.start,
        stop = source.stop;
      const record = { stops: 0 };
      window.__inputQA.sources.push(record);
      source.stop = function (...args) {
        record.stops++;
        return stop.apply(this, args);
      };
      source.start = function (...args) {
        window.__inputQA.starts++;
        return start.apply(this, args);
      };
      return source;
    };
    window.__inputQA.gate = async () => {
      const q = window.__inputQA;
      if (q.waiters.length)
        throw Error("Previous input QA audio gate is still pending");
      const contexts = q.contexts.filter(
        (context) => context.state !== "closed",
      );
      if (!contexts.length)
        throw Error("Input QA did not capture a live audio context");
      q.hold = true;
      await Promise.race([
        Promise.all(contexts.map((context) => context.suspend())),
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("Input QA suspend timed out")), 2000),
        ),
      ]);
      if (contexts.some((context) => context.state !== "suspended"))
        throw Error("Input QA audio gate must keep every context suspended");
    };
    window.__inputQA.release = async () => {
      window.__inputQA.hold = false;
      await Promise.all(
        window.__inputQA.waiters.splice(0).map((resume) => resume()),
      );
    };
    const a = {
      id: "qa-a",
      name: "QA piano A",
      state: "connected",
      onmidimessage: null,
    };
    const b = {
      id: "qa-b",
      name: "QA piano B",
      state: "connected",
      onmidimessage: null,
    };
    const access = { inputs: new Map([[a.id, a]]), onstatechange: null };
    Object.assign(window.__inputQA, { a, b, access });
    Object.defineProperty(navigator, "requestMIDIAccess", {
      value: async () => {
        window.__inputQA.requests++;
        return access;
      },
    });
  });
}
export async function verifyInputs(page, prefix = "input") {
  const checks = [],
    errors = [];
  const pageError = (e) => errors.push(e.message);
  page.on("pageerror", pageError);
  const play = () => page.getByRole("button", { name: "Play", exact: true });
  const pause = () => page.getByRole("button", { name: "Pause", exact: true });
  const midiButton = () =>
    page.getByRole("button", { name: "Connect piano", exact: true });
  const openSettings = () =>
    page.getByRole("button", { name: "Reading settings", exact: true }).click();
  const closeDialog = () =>
    page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const setCountIn = async (enabled) => {
    await openSettings();
    const toggle = page.getByRole("switch", { name: "Count me in" });
    if ((await toggle.getAttribute("aria-checked")) !== String(enabled))
      await toggle.click();
    await closeDialog();
  };
  const position = () =>
    page.getByRole("slider", { name: "Song position" }).inputValue();
  const pressed = (midi) =>
    page.getByRole("button", {
      name: midi === 60 ? "C4 1 Do" : "E5 3 Mi",
      exact: true,
    });
  const send = async (data, port = "a") =>
    page.evaluate(
      ({ data, port }) => window.__inputQA[port].onmidimessage({ data }),
      { data, port },
    );
  const starts = () => page.evaluate(() => window.__inputQA.starts);
  const gate = () => page.evaluate(() => window.__inputQA.gate());
  const waitGate = async () => {
    await expect
      .poll(() => page.evaluate(() => window.__inputQA.waiters.length))
      .toBe(1);
    assert.ok(
      await page.evaluate(() =>
        window.__inputQA.contexts
          .filter((context) => context.state !== "closed")
          .every((context) => context.state === "suspended"),
      ),
    );
  };
  const release = () => page.evaluate(() => window.__inputQA.release());
  try {
    await expect(play()).toBeEnabled();
    // (The volume lives in Practice tools since 2.39.)
    if (+(await pianoVolume(page)) !== 0) await setPianoVolume(page, "0");
    await page
      .getByRole("button", { name: "Wait for me", exact: true })
      .click();
    await play().click();
    await pause().waitFor();
    await page.keyboard.down("a");
    await expect.poll(position).toBe("1");
    await page.keyboard.down("a");
    await page.waitForTimeout(50);
    assert.equal(await position(), "1");
    await page.keyboard.up("a");
    // (A visible slider: the piano volume sits in a closed drawer.)
    await page.getByRole("slider", { name: "Song position" }).focus();
    await page.keyboard.press("a");
    await expect.poll(position).toBe("2");
    await pause().click();
    checks.push(
      "Computer notes work after clicking Play or focusing a slider; key repeat cannot skip repeated notes",
    );
    // (Since 2.34 Connect piano opens the piano-input dialog; choosing USB /
    // MIDI again refreshes the inputs without a second access request.)
    await connectMidi(page);
    await expect(midiButton()).toHaveText("QA piano A");
    await connectMidi(page);
    assert.equal(await page.evaluate(() => window.__inputQA.requests), 1);
    await page.keyboard.down("a");
    await expect(pressed(60)).toHaveClass(/pressed/);
    await send([144, 60, 100]);
    await page.keyboard.up("a");
    await expect(pressed(60)).toHaveClass(/pressed/);
    await page.keyboard.up("a");
    await expect(pressed(60)).toHaveClass(/pressed/);
    await send([145, 60, 90]);
    await send([128, 60, 0]);
    await expect(pressed(60)).toHaveClass(/pressed/);
    await page.evaluate(() =>
      window.__inputQA.access.onstatechange({ port: window.__inputQA.a }),
    );
    await expect(pressed(60)).toHaveClass(/pressed/);
    await send([129, 60, 0]);
    await expect(pressed(60)).not.toHaveClass(/pressed/);
    checks.push(
      "Computer/MIDI overlap, separate MIDI channels and harmless state changes preserve the correct held note; reconnect does not duplicate access",
    );
    await page.evaluate(() => {
      const q = window.__inputQA;
      q.access.inputs.set(q.b.id, q.b);
      q.access.onstatechange({ port: q.b });
    });
    await send([176, 64, 127]);
    await send([176, 64, 127], "b");
    await send([176, 64, 0]);
    await expect(midiButton()).toHaveText("QA piano A, QA piano B · sustain");
    await send([176, 64, 0], "b");
    await expect(midiButton()).toHaveText("QA piano A, QA piano B");
    await send([144, 60, 100]);
    await send([144, 60, 100], "b");
    await page.evaluate(() => {
      const q = window.__inputQA;
      q.a.state = "disconnected";
      q.access.inputs.delete(q.a.id);
      q.access.onstatechange({ port: q.a });
    });
    await expect(pressed(60)).toHaveClass(/pressed/);
    await send([128, 60, 0], "b");
    await expect(pressed(60)).not.toHaveClass(/pressed/);
    checks.push(
      "Two MIDI ports have independent note and pedal ownership; removing one preserves the other",
    );
    await page.locator("h1").click();
    await gate();
    const beforeBlur = await starts();
    await page.keyboard.down("a");
    await waitGate();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await release();
    await page.waitForTimeout(100);
    await expect(pressed(60)).not.toHaveClass(/pressed/);
    assert.equal(await starts(), beforeBlur);
    await page.keyboard.up("a");
    await gate();
    const beforeDisconnect = await starts();
    await send([144, 60, 100], "b");
    await waitGate();
    await page.evaluate(() => {
      const q = window.__inputQA;
      q.b.state = "disconnected";
      q.access.inputs.clear();
      q.access.onstatechange({ port: q.b });
    });
    await release();
    await page.waitForTimeout(100);
    await expect(pressed(60)).not.toHaveClass(/pressed/);
    assert.equal(await starts(), beforeDisconnect);
    checks.push(
      "Focus loss and MIDI disconnect cancel pending audio: no late voice or pressed key appears",
    );
    await page
      .getByRole("button", { name: "Listen & follow", exact: true })
      .click();
    await setCountIn(false);
    await gate();
    const beforeCancel = await starts();
    await play().click();
    await waitGate();
    await page.getByRole("button", { name: "Start over" }).click();
    await release();
    await page.waitForTimeout(100);
    await expect(play()).toBeEnabled();
    assert.equal(await position(), "0");
    assert.equal(await starts(), beforeCancel);
    await gate();
    const beforeShared = await page.evaluate(() => ({
      resumes: window.__inputQA.resumes,
      starts: window.__inputQA.starts,
    }));
    await play().click();
    await waitGate();
    await page.getByRole("button", { name: "Start over" }).click();
    await play().click();
    // Both Play requests share the one pending context resume. Cancelling the
    // first must neither release its notes nor cancel the newer request.
    await waitGate();
    await page.waitForTimeout(100);
    await expect(play()).toBeDisabled();
    assert.equal(await starts(), beforeShared.starts);
    assert.equal(
      await page.evaluate(() => window.__inputQA.resumes),
      beforeShared.resumes + 1,
    );
    assert.equal(await page.evaluate(() => window.lumaClock().playing), false);
    await release();
    await pause().waitFor();
    const sharedStart = await page.evaluate(() => ({
      resumes: window.__inputQA.resumes,
      starts: window.__inputQA.starts,
      clock: window.lumaClock(),
    }));
    assert.equal(sharedStart.resumes, beforeShared.resumes + 1);
    assert.equal(sharedStart.clock.origin, 0);
    assert.equal(sharedStart.clock.playing, true);
    assert.equal(
      sharedStart.starts,
      beforeShared.starts + 1,
      "Only the newer Play may schedule Twinkle's single opening note",
    );
    await pause().click();
    checks.push(
      "Stop cancels a delayed Play; a newer request shares its pending resume and alone starts playback when released",
    );
    await page.getByRole("button", { name: "Start over" }).click();
    await gate();
    const beforeSettings = await starts();
    await play().click();
    await waitGate();
    // Opening reading settings intentionally stops playback, including a
    // request still waiting for audio. A fresh request must use the new value.
    await openSettings();
    await page.getByRole("switch", { name: "Count me in" }).click();
    await closeDialog();
    await release();
    await page.waitForTimeout(100);
    await expect(play()).toBeEnabled();
    assert.equal(await position(), "0");
    assert.equal(await starts(), beforeSettings);
    await play().click();
    await pause().waitFor();
    await expect(
      page.locator(".reader-play-status, .maestro-live-status"),
    ).toContainText("Count in");
    await pause().click();
    await setCountIn(false);
    await gate();
    await play().click();
    await waitGate();
    await page
      .getByRole("button", { name: "Wait for me", exact: true })
      .click();
    await release();
    await page.waitForTimeout(100);
    await expect(play()).toBeEnabled();
    assert.equal(await position(), "0");
    await page
      .getByRole("button", { name: "Listen & follow", exact: true })
      .click();
    checks.push(
      "Reading settings cancel pending audio; fresh Play uses the new count-in setting, and changing practice mode cancels the old request",
    );
    await page.evaluate(() => {
      const q = window.__inputQA;
      q.a.state = "connected";
      q.access.inputs.set(q.a.id, q.a);
      q.access.onstatechange({ port: q.a });
    });
    await send([176, 64, 127]);
    await play().click();
    await pause().waitFor();
    await pause().click();
    await expect(midiButton()).toHaveText("QA piano A");
    checks.push(
      "Pause clears both the audio pedal and its visible sustain indicator",
    );
    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("button", { name: "Toggle phrase loop" }).click();
    await setLoopEnd(page, 1);
    await page
      .getByRole("combobox", { name: "Practice speed" })
      .selectOption("1.25");
    await send([176, 64, 127]);
    await send([144, 60, 100]);
    await expect(pressed(60)).toHaveClass(/pressed/);
    const heldSource = await page.evaluate(
      () => window.__inputQA.sources.length - 1,
    );
    await play().click();
    await pause().waitFor();
    await page.waitForTimeout(2800);
    assert.ok(+(await position()) < 2, "Loop has wrapped at least once");
    await expect(pressed(60)).toHaveClass(/pressed/);
    assert.equal(
      await page.evaluate(
        (index) => window.__inputQA.sources[index].stops,
        heldSource,
      ),
      0,
    );
    await send([128, 60, 0]);
    assert.equal(
      await page.evaluate(
        (index) => window.__inputQA.sources[index].stops,
        heldSource,
      ),
      0,
      "Loop must preserve sustain after key-up",
    );
    await send([176, 64, 0]);
    assert.equal(
      await page.evaluate(
        (index) => window.__inputQA.sources[index].stops,
        heldSource,
      ),
      1,
    );
    await pause().click();
    await page.getByRole("button", { name: "Toggle phrase loop" }).click();
    checks.push(
      "A listen-mode loop preserves held live notes and pedal audio across its boundary",
    );
    await page.locator("h1").click();
    await page.keyboard.down("a");
    await expect(pressed(60)).toHaveClass(/pressed/);
    await page.locator("h1").evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Meta",
          code: "MetaLeft",
          bubbles: true,
        }),
      ),
    );
    await expect(pressed(60)).not.toHaveClass(/pressed/);
    await page.keyboard.up("a");
    await send([144, 60, 100]);
    await page.keyboard.down("a");
    await page.locator("h1").evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Meta",
          code: "MetaLeft",
          metaKey: true,
          bubbles: true,
        }),
      ),
    );
    await expect(pressed(60)).toHaveClass(/pressed/);
    await page.keyboard.up("a");
    await send([128, 60, 0]);
    await expect(pressed(60)).not.toHaveClass(/pressed/);
    checks.push(
      "Command-key transitions recover missing computer key-up events without releasing a MIDI owner",
    );
    await page.getByRole("button", { name: "C4 1 Do", exact: true }).focus();
    await page.keyboard.down("Enter");
    await expect(pressed(60)).toHaveClass(/pressed/);
    await page.keyboard.down("Space");
    await page.keyboard.up("Enter");
    await expect(pressed(60)).toHaveClass(/pressed/);
    await page.keyboard.up("Space");
    await expect(pressed(60)).not.toHaveClass(/pressed/);
    await page.locator("h1").click();
    await page.locator("h1").evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: ";",
          code: "Semicolon",
          bubbles: true,
        }),
      ),
    );
    await expect(pressed(76)).toHaveClass(/pressed/);
    await page.locator("h1").evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: ":",
          code: "Semicolon",
          shiftKey: true,
          bubbles: true,
        }),
      ),
    );
    await expect(pressed(76)).not.toHaveClass(/pressed/);
    checks.push(
      "Focused piano Enter/Space owners release independently; changed Shift character still releases its original computer key",
    );
    await openSettings();
    await page
      .getByRole("button", { name: "Reading guide", exact: true })
      .click();
    const beforeModal = await starts();
    await send([144, 60, 100]);
    await page.keyboard.press("a");
    await page.waitForTimeout(80);
    assert.equal(await starts(), beforeModal);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Library", exact: true }).click();
    const search = page.getByPlaceholder("Find a piece…");
    await search.fill("asdf");
    await page.keyboard.press("a");
    assert.equal(await starts(), beforeModal);
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    // (The Library screen, with its own Import button, fades out first.)
    await expect(search).toBeHidden();
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: "Final note.musicxml",
      mimeType: "application/xml",
      buffer: Buffer.from(
        '<score-partwise version="4.0"><work><work-title>Final note check</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>',
      ),
    });
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Wait for me", exact: true })
      .click();
    await play().click();
    await pause().waitFor();
    await send([144, 60, 100]);
    await expect(play()).toBeEnabled();
    await expect(pressed(60)).toHaveClass(/pressed/);
    const finalSource = await page.evaluate(
      () => window.__inputQA.sources.length - 1,
    );
    assert.equal(
      await page.evaluate(
        (index) => window.__inputQA.sources[index].stops,
        finalSource,
      ),
      0,
    );
    assert.match(
      await page.locator(".next-notes").innerText(),
      /Piece complete/,
    );
    await send([128, 60, 0]);
    await expect(pressed(60)).not.toHaveClass(/pressed/);
    assert.equal(
      await page.evaluate(
        (index) => window.__inputQA.sources[index].stops,
        finalSource,
      ),
      1,
    );
    checks.push(
      "The final correct note completes wait mode and rings until the physical key is released",
    );
    await page.screenshot({
      path: `evidence/${prefix}-verified.png`,
      fullPage: true,
    });
    checks.push(
      "Dialogs and text inputs never turn typing or MIDI into hidden note attempts",
    );
    assert.deepEqual(errors, []);
    return {
      checks,
      errors,
      simulatedMIDI: true,
      physicalHardwareTested: false,
    };
  } finally {
    await release().catch(() => {});
    page.off("pageerror", pageError);
  }
}
