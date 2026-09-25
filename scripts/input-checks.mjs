import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function installInputHarness(page) {
  await page.addInitScript(() => {
    const resume = AudioContext.prototype.resume,
      create = AudioContext.prototype.createBufferSource;
    window.__inputQA = {
      hold: false,
      waiters: [],
      starts: 0,
      requests: 0,
      sources: [],
    };
    AudioContext.prototype.resume = function () {
      const ready = resume.call(this);
      if (!window.__inputQA.hold) return ready;
      return new Promise((resolve) =>
        window.__inputQA.waiters.push(() => ready.then(resolve)),
      );
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
    window.__inputQA.release = () => {
      window.__inputQA.hold = false;
      window.__inputQA.waiters.splice(0).forEach((resolve) => resolve());
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
  const gate = () => page.evaluate(() => (window.__inputQA.hold = true));
  const waitGate = () =>
    expect
      .poll(() => page.evaluate(() => window.__inputQA.waiters.length))
      .toBe(1);
  const release = () => page.evaluate(() => window.__inputQA.release());
  try {
    await expect(play()).toBeEnabled();
    if (
      +(await page
        .getByRole("slider", { name: "Piano volume" })
        .inputValue()) !== 0
    )
      await page.getByRole("button", { name: "Mute", exact: true }).click();
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
    await page.getByRole("slider", { name: "Piano volume" }).focus();
    await page.keyboard.press("a");
    await expect.poll(position).toBe("2");
    await pause().click();
    checks.push(
      "Computer notes work after clicking Play or focusing a slider; key repeat cannot skip repeated notes",
    );
    await page
      .getByRole("button", { name: "Connect piano", exact: true })
      .click();
    await page
      .getByRole("button", { name: "QA piano A", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Connect piano", exact: true })
      .click();
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
    await expect(
      page.getByRole("button", { name: /QA piano A, QA piano B · sustain/ }),
    ).toBeVisible();
    await send([176, 64, 0], "b");
    await expect(
      page.getByRole("button", { name: "QA piano A, QA piano B", exact: true }),
    ).toBeVisible();
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
    await page.getByRole("switch", { name: "Count me in" }).click();
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
    await play().click();
    await waitGate();
    await page.getByRole("button", { name: "Start over" }).click();
    await play().click();
    await expect
      .poll(() => page.evaluate(() => window.__inputQA.waiters.length))
      .toBe(2);
    await page.evaluate(() => window.__inputQA.waiters.shift()());
    await page.waitForTimeout(100);
    await expect(play()).toBeDisabled();
    await release();
    await pause().waitFor();
    await pause().click();
    checks.push(
      "Stop cancels a delayed Play; an old startup cannot resume playback or cancel a newer startup",
    );
    await page.getByRole("button", { name: "Start over" }).click();
    await gate();
    await play().click();
    await waitGate();
    await page.getByRole("switch", { name: "Count me in" }).click();
    await release();
    await pause().waitFor();
    await expect(page.locator(".roll-caption")).toContainText("Count in");
    await pause().click();
    await page.getByRole("switch", { name: "Count me in" }).click();
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
      "Audio startup reads the latest count-in setting; changing practice mode cancels the old request",
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
    await expect(
      page.getByRole("button", { name: "QA piano A", exact: true }),
    ).toBeVisible();
    checks.push(
      "Pause clears both the audio pedal and its visible sustain indicator",
    );
    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("button", { name: "Toggle phrase loop" }).click();
    await page.getByRole("spinbutton", { name: "Loop end bar" }).fill("1");
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
    await page
      .getByRole("button", { name: "A little guidance", exact: true })
      .click();
    const beforeModal = await starts();
    await send([144, 60, 100]);
    await page.keyboard.press("a");
    await page.waitForTimeout(80);
    assert.equal(await starts(), beforeModal);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: /My sheet music/ }).click();
    const search = page.getByPlaceholder("Find a piece…");
    await search.fill("asdf");
    await page.keyboard.press("a");
    assert.equal(await starts(), beforeModal);
    await page
      .getByRole("button", { name: "Practice studio", exact: true })
      .click();
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
    await page.getByRole("dialog", { name: "Make the music yours" }).waitFor();
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
      /Lovely finish/,
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
