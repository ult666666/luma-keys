import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { setPianoVolume } from "./piano-volume.mjs";
import { setLoopRange } from "./practice-tools.mjs";
import { connectMidi } from "./piano-input.mjs";

const note = (id, midi, beat, duration, hand = "right") => ({
  id,
  midi,
  beat,
  duration,
  hand,
  velocity: 0.7,
});
const piece = (id, notes, bars = 3) => ({
  id,
  title: `Hand guide: ${id}`,
  composer: "Hand guidance acceptance",
  bpm: 90,
  tonic: 0,
  meter: 4,
  notes,
  duration: bars * 4,
  measures: bars,
  measureStarts: Array.from({ length: bars }, (_, i) => i * 4),
  measureLengths: Array(bars).fill(4),
  reviewed: true,
  warnings: [],
});
const CUES = piece("held-and-next", [
  note("held-c", 60, 0, 3),
  note("short-e", 64, 0, 0.5),
  note("next-f", 65, 1, 0.5),
  note("bar-two-g", 67, 4, 1),
  note("bar-three-a", 69, 8, 1),
  note("bass-c", 48, 0, 3, "left"),
  note("bass-g", 55, 4, 1, "left"),
  note("bass-f", 53, 8, 1, "left"),
]);
const UNISONS = piece("unisons-and-reattacks", [
  note("c-short", 60, 0, 1),
  note("c-long", 60, 0, 4),
  note("c-again", 60, 2, 0.5),
  note("future-d", 62, 4, 1),
]);
const DENSE = piece(
  "six-note-chord",
  [60, 62, 64, 65, 67, 69].map((midi, i) => note(`six-${i}`, midi, 0, 1)),
);

// Import real scores and operate visible controls. The caller owns an isolated
// library and installs installInputHarness before navigating/reloading the page.
export async function verifyHandGuide(page, prefix = "instructive-2.4") {
  const checks = [],
    measurements = {},
    errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const key = (midi) => page.locator(`.piano-key[data-midi="${midi}"]`);
  const hand = (name) => page.locator(`.coach-hand[data-hand="${name}"]`);
  const cue = (name, midi) =>
    hand(name).locator(`.coach-note[data-midi="${midi}"]`);
  const seek = (beat) =>
    page.getByRole("slider", { name: "Song position" }).fill(String(beat));
  const position = () =>
    page.getByRole("slider", { name: "Song position" }).inputValue();
  const snapshot = () =>
    page.locator(".coach-hand").evaluateAll((hands) =>
      hands.map((h) => ({
        hand: h.dataset.hand,
        state: h.dataset.state,
        notes: [...h.querySelectorAll(".coach-note")].map((n) => ({
          midi: +n.dataset.midi,
          phase: n.dataset.phase,
          finger: n.dataset.finger,
          description: n.getAttribute("aria-label"),
        })),
      })),
    );
  const send = (data) =>
    page.evaluate((data) => window.__inputQA.a.onmidimessage({ data }), data);
  const pause = async () => {
    if (await button("Pause").count()) await button("Pause").click();
  };
  const importPiece = async (fixture) => {
    await button("Import a score").click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${prefix}-${fixture.id}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await button("Close dialog").click();
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(button("Play")).toBeEnabled();
    await setPianoVolume(page);
    await button("Reading settings").click();
    for (const name of ["Count me in", "Metronome"]) {
      const toggle = page.getByRole("switch", { name, exact: true });
      if ((await toggle.getAttribute("aria-checked")) === "true")
        await toggle.click();
    }
    await button("Close dialog").click();
    await importPiece(CUES);
    await page.getByRole("tab", { name: "Falling notes", exact: true }).click();
    await button("Listen & follow").click();
    await page
      .getByRole("radiogroup", { name: "Practice hand" })
      .locator(".hand-both")
      .click();
    if ((await button("Hands").getAttribute("aria-pressed")) !== "true")
      await button("Hands").click();
    await button("Start over").click();
    await expect(
      page.getByRole("region", { name: "Hand guidance" }),
    ).toBeVisible();
    await expect(cue("right", 60)).toHaveAttribute(
      "aria-label",
      /Place C4, suggested finger [1-5],/,
    );
    await expect(cue("left", 48)).toHaveAttribute(
      "aria-label",
      /Place C3, suggested finger [1-5],/,
    );
    await expect(cue("right", 64)).toHaveAttribute("data-phase", "attack");
    const fingerNames = ["thumb", "index", "middle", "ring", "little"];
    for (const h of await snapshot())
      for (const n of h.notes) {
        assert.match(
          n.description,
          new RegExp(
            `finger ${n.finger}, ${fingerNames[Number(n.finger) - 1]}$`,
          ),
        );
        // (Only the keys to play now carry the suggested finger; a note the
        // cue previews as next is not yet a required key.)
        if (n.phase === "next") continue;
        const description = await key(n.midi).getAttribute("aria-description");
        assert.ok(
          description?.includes(
            `finger ${n.finger}, ${fingerNames[Number(n.finger) - 1]}`,
          ),
        );
      }
    measurements.opening = await snapshot();
    await seek(0.75);
    await expect(cue("right", 60)).toHaveAttribute("data-phase", "hold");
    await expect(cue("right", 64)).toHaveCount(0);
    // (Since 2.37 the guide previews the next note during a hold.)
    await expect(cue("right", 65)).toHaveAttribute("data-phase", "next");
    await seek(1);
    await expect(cue("right", 60)).toHaveAttribute("aria-label", /^Hold C4,/);
    await expect(cue("right", 65)).toHaveAttribute("aria-label", /^Place F4,/);
    await expect(cue("left", 48)).toHaveAttribute("aria-label", /^Hold C3,/);
    await page.screenshot({
      path: `evidence/${prefix}-hold-and-place.png`,
      fullPage: false,
    });
    await seek(3.5);
    await expect(cue("right", 67)).toHaveAttribute("aria-label", /^Next G4,/);
    await expect(hand("right")).toHaveAttribute("data-state", "next");
    await seek(9.5);
    await expect(hand("right")).toHaveAttribute("data-state", "rest");
    await expect(hand("right").locator(".coach-rest")).toHaveText("Rest");
    await expect(page.locator(".coach-note")).toHaveCount(0);
    checks.push(
      "Paused cues distinguish Place, continuing Hold, the next note through a rest, and Rest after the final note; pitch octaves and named fingers agree with key guidance",
    );

    await connectMidi(page, "QA piano A");
    await button("Wait for me").click();
    await button("Start over").click();
    await expect(cue("right", 60)).toHaveAttribute("aria-label", /^Play C4,/);
    await button("Play").click();
    await button("Pause").waitFor();
    await send([144, 62, 90]);
    await send([128, 62, 0]);
    assert.equal(
      await position(),
      "0",
      "An unrelated note must not advance the opening chord",
    );
    for (const midi of [60, 64, 48]) {
      await send([144, midi, 90]);
      await send([128, midi, 0]);
    }
    await expect.poll(position).toBe("1");
    await expect(cue("right", 65)).toHaveAttribute("aria-label", /^Play F4,/);
    await expect(cue("right", 60)).toHaveAttribute("aria-label", /^Hold C4,/);
    await expect(cue("left", 48)).toHaveAttribute("aria-label", /^Hold C3,/);
    measurements.waitAtSecondOnset = await snapshot();
    await pause();
    checks.push(
      "Real Wait-mode chord input advances to Play F4 while both written C notes remain Hold; a wrong MIDI pitch cannot advance",
    );

    await button("Listen & follow").click();
    await page
      .getByRole("radiogroup", { name: "Practice hand" })
      .locator(".hand-right")
      .click();
    await expect(hand("left")).toHaveCount(0);
    await expect(hand("right")).toBeVisible();
    await page
      .getByRole("radiogroup", { name: "Practice hand" })
      .locator(".hand-both")
      .click();
    await button("Toggle phrase loop").click();
    await setLoopRange(page, 2, 2);
    await expect.poll(position).toBe("4");
    await expect(cue("right", 67)).toHaveAttribute("data-phase", "attack");
    await seek(7.5);
    await expect(hand("right")).toHaveAttribute("data-state", "rest");
    await expect(page.locator(".coach-note")).toHaveCount(0);
    await button("Toggle phrase loop").click();
    await expect(cue("right", 69)).toHaveAttribute("data-phase", "next");
    checks.push(
      "Guidance follows the selected hand and phrase; a next-bar note outside the active phrase is hidden until repeat is disabled",
    );

    await importPiece(UNISONS);
    await seek(0);
    await expect(hand("right").locator(".coach-note")).toHaveCount(1);
    await expect(cue("right", 60)).toHaveAttribute("data-phase", "attack");
    await seek(1.5);
    await expect(cue("right", 60)).toHaveAttribute("data-phase", "hold");
    await seek(2);
    await expect(cue("right", 60)).toHaveAttribute("data-phase", "attack");
    await seek(2.75);
    await expect(cue("right", 60)).toHaveCount(0);
    await expect(cue("right", 62)).toHaveAttribute("data-phase", "next");
    checks.push(
      "Unison voices produce one physical cue with the longest hold; a short same-pitch reattack replaces the old hold and does not resurrect it",
    );

    await importPiece(DENSE);
    await seek(0);
    await expect(hand("right").locator(".coach-note")).toHaveCount(6);
    await expect(hand("right").locator(".coach-unassigned")).toHaveCount(1);
    await expect(hand("right").locator(".coach-finger")).toHaveCount(5);
    const denseNotes = (await snapshot())[0].notes;
    const knownFingers = denseNotes
      .filter((n) => n.finger)
      .map((n) => +n.finger);
    assert.deepEqual([...knownFingers].sort(), [1, 2, 3, 4, 5]);
    for (const n of denseNotes.filter((n) => !n.finger))
      assert.match(n.description, /no finger suggestion$/);
    checks.push(
      "A six-note hand chord keeps every pitch visible, gives distinct supported fingers, and explicitly marks the unassigned pitch instead of inventing a sixth suggestion",
    );

    await importPiece(CUES);
    await button("Listen & follow").click();
    await seek(0);
    await page.getByRole("slider", { name: "Song position" }).focus();
    await page.keyboard.down("a");
    await expect(key(60)).toHaveClass(/pressed/);
    await button("Finger guide").click();
    const dialog = page.getByRole("dialog", {
      name: "Finger numbers",
    });
    await expect(dialog).toBeVisible();
    await page.keyboard.up("a");
    await expect(key(60)).not.toHaveClass(/pressed/);
    await expect(button("Play")).toBeAttached();
    const startsBefore = await page.evaluate(() => window.__inputQA.starts);
    await page.keyboard.press("a");
    await send([144, 60, 90]);
    await send([176, 64, 127]);
    await send([128, 60, 0]);
    await send([176, 64, 0]);
    await page.waitForTimeout(180);
    assert.equal(
      await page.evaluate(() => window.__inputQA.starts),
      startsBefore,
    );
    await expect(page.locator(".piano-key.pressed")).toHaveCount(0);
    const choices = dialog.getByRole("group", {
      name: "Explore finger numbers",
    });
    await expect(
      choices.getByRole("button", { name: "1 Thumb", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await choices.getByRole("button", { name: "2 Index", exact: true }).click();
    await expect(
      dialog.getByRole("img", {
        name: "left hand, finger 2: Index",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("img", {
        name: "right hand, finger 2: Index",
        exact: true,
      }),
    ).toBeVisible();
    const mirror = await dialog
      .locator('.finger-diagrams [data-finger="2"] circle')
      .evaluateAll((nodes) => nodes.map((n) => +n.getAttribute("cx")));
    assert.equal(mirror.length, 2);
    assert.equal(mirror[0] + mirror[1], 190);
    assert.notEqual(mirror[0], mirror[1]);
    await expect(dialog.locator(".finger-meaning")).toContainText("1–5");
    await expect(dialog.locator(".finger-meaning")).toContainText("1–7");
    await expect(dialog.locator(".finger-reading")).toContainText(
      "Filled: finger down",
    );
    await expect(dialog.locator(".finger-reading")).toContainText(
      "Outline: prepare",
    );
    await page.screenshot({
      path: `evidence/${prefix}-finger-guide.png`,
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(button("Finger guide")).toBeFocused();
    await page.getByRole("slider", { name: "Song position" }).focus();
    await page.keyboard.down("a");
    await expect(key(60)).toHaveClass(/pressed/);
    await page.keyboard.up("a");
    await expect(key(60)).not.toHaveClass(/pressed/);
    checks.push(
      "Finger guide releases an already-held key, suppresses computer/MIDI/pedal input, mirrors finger selection, separates pitch from finger numbers, and restores focus/input after Escape",
    );

    await seek(1);
    const beforeReduced = await snapshot();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() =>
        page.evaluate(() => window.lumaHands?.()?.right?.reducedMotion),
      )
      .toBe(true);
    assert.deepEqual(await snapshot(), beforeReduced);
    await button("Hands").click();
    await expect(
      page.getByRole("region", { name: "Hand guidance" }),
    ).toHaveCount(0);
    await button("Hands").click();
    await expect(cue("right", 60)).toHaveAttribute("data-phase", "hold");
    await expect(cue("right", 65)).toHaveAttribute("data-phase", "attack");
    const canvasPassThrough = await page
      .locator(".hand-layer, .hands3d-layer, .hands3d-canvas")
      .evaluateAll((nodes) =>
        nodes.every((n) => getComputedStyle(n).pointerEvents === "none"),
      );
    assert.ok(canvasPassThrough);
    checks.push(
      "Live reduced motion preserves the instructional cues; hiding and restoring hands keeps the same musical position and the hand canvases stay pointer-transparent",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await seek(1);
    await expect(cue("right", 65)).toBeVisible();
    measurements.mobile = await page.evaluate(() => {
      const coach = document.querySelector(".hand-coach"),
        r = coach.getBoundingClientRect();
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        coach: {
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
        },
        chips: [
          ...coach.querySelectorAll(".coach-note, .finger-help-button"),
        ].map((node) => {
          const b = node.getBoundingClientRect();
          return {
            left: b.left,
            right: b.right,
            width: b.width,
            text: node.textContent,
          };
        }),
      };
    });
    assert.ok(measurements.mobile.document <= 391);
    for (const chip of measurements.mobile.chips) {
      assert.ok(
        chip.left >= measurements.mobile.coach.left - 1 &&
          chip.right <= measurements.mobile.coach.right + 1,
        `${chip.text} escapes the coach`,
      );
    }
    await button("Finger guide").click();
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.x + bounds.width <= 391 &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= 845,
    );
    await choices
      .getByRole("button", { name: "5 Little", exact: true })
      .click();
    await expect(
      dialog.getByRole("img", {
        name: "left hand, finger 5: Little",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `evidence/${prefix}-mobile-guide.png`,
      fullPage: false,
    });
    await button("Close finger guide").click();
    await expect(dialog).not.toBeVisible();
    await page.screenshot({
      path: `evidence/${prefix}-mobile-coach.png`,
      fullPage: false,
    });
    checks.push(
      "At 390px the hand instructions and help control remain inside the stage, and the finger guide fits the viewport with usable finger choices and close control",
    );

    // A late settings response can remove the guide component while its native
    // dialog is open. The app must release its input guard on that unmount.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(async () => {
      await window.lumaFlushPreferences?.();
    });
    let deliverSettings;
    const delayed = new Promise((resolve) => {
      deliverSettings = resolve;
    });
    const settingsRoute = async (route) => {
      const response = await route.fetch();
      const saved = await response.json();
      saved.preferences.reading.keyHands = false;
      saved.preferences.reading.keyboardCollapsed = false;
      await delayed;
      await route.fulfill({ response, json: saved });
    };
    await page.route("**/api/settings", settingsRoute);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await button("Finger guide").click();
      await expect(dialog).toBeVisible();
      deliverSettings();
      await expect(dialog).toHaveCount(0);
      await expect(button("Hands")).toHaveAttribute("aria-pressed", "false");
      await page.getByRole("slider", { name: "Song position" }).focus();
      await page.keyboard.down("a");
      await expect(key(60)).toHaveClass(/pressed/);
      await page.keyboard.up("a");
      await expect(key(60)).not.toHaveClass(/pressed/);
      await connectMidi(page);
      await send([144, 60, 90]);
      await expect(key(60)).toHaveClass(/pressed/);
      await send([128, 60, 0]);
      await expect(key(60)).not.toHaveClass(/pressed/);
      measurements.delayedSettings =
        "Guide unmounted; computer and MIDI input restored";
      checks[5] +=
        "; delayed settings can unmount the open guide without leaving computer or MIDI input locked";
    } finally {
      deliverSettings();
      await page.unroute("**/api/settings", settingsRoute);
    }
    assert.deepEqual(errors, []);
    return { checks, measurements, errors, simulatedMIDI: true };
  } catch (error) {
    error.guideEvidence = {
      checks,
      measurements,
      errors,
      cues: await snapshot().catch(() => []),
    };
    throw error;
  } finally {
    await pause().catch(() => {});
    await page.keyboard.up("a").catch(() => {});
    page.off("pageerror", onError);
  }
}
