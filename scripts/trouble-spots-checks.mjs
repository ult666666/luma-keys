import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { demos } from "../src/music.mjs";
import { performPlan } from "./sight-reading-checks.mjs";

// Trouble spots (2.40): Wait for me and Play in time judge every bar; the
// piece remembers the bars that slipped, shows them on its maps, offers a
// drill, and forgets a bar after three clean passes. This is a serial
// browser/native story on an isolated library: the runner removes its import
// and restores preferences afterwards. Computer keys stand in for a piano;
// the piano's output is muted. No physical hardware is involved.

// Computer keys the app maps to C4–C5 (KEYS in App.jsx).
const KEY = {
  60: ["a", "KeyA"],
  62: ["s", "KeyS"],
  64: ["d", "KeyD"],
  65: ["f", "KeyF"],
  67: ["g", "KeyG"],
  69: ["h", "KeyH"],
  71: ["j", "KeyJ"],
  72: ["k", "KeyK"],
};
// Four bars of quarter notes in C: up the scale and back down.
const MELODY = [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60];
const fixture = {
  ...demos()[0],
  id: "trouble-spots-fixture",
  title: "Trouble spots check",
  composer: "Luma Keys regression fixture",
  bpm: 120,
  tonic: 0,
  meter: 4,
  pickup: 0,
  duration: 16,
  measures: 4,
  measureStarts: [0, 4, 8, 12],
  measureLengths: [4, 4, 4, 4],
  xml: undefined,
  warnings: [],
  notes: MELODY.map((midi, i) => ({
    id: `trouble-note-${i}`,
    midi,
    beat: i,
    duration: 1,
    hand: "right",
    velocity: 0.7,
    measure: Math.floor(i / 4) + 1,
  })),
};
const bar = (n) => MELODY.slice((n - 1) * 4, n * 4);

export async function verifyTroubleSpots(page, prefix = "trouble-spots") {
  const checks = [],
    errors = [],
    measurements = {};
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(20000);
  const origin = new URL(page.url()).origin;
  const button = (name) => page.getByRole("button", { name, exact: true });
  const play = () => button("Play");
  const pause = () => button("Pause");
  const position = async () =>
    +(await page.getByRole("slider", { name: "Song position" }).inputValue());
  const speed = () => page.getByRole("combobox", { name: "Practice speed" });
  const tools = () =>
    page.getByRole("button", { name: "Practice tools", exact: true });
  const drawer = () => page.getByRole("region", { name: "Practice tools" });
  const chips = () => drawer().locator(".passage-chip.trouble");
  const marks = () => page.locator(".piece-map .piece-map-spots i");
  const preferences = async () =>
    (await fetch(origin + "/api/preferences")).json();
  let scoreId = null;
  const spots = async () =>
    (await preferences()).journal?.pieces?.[scoreId]?.spots || null;
  // The saved spots once the debounced write has landed.
  const savedSpots = async (predicate, label) => {
    try {
      await expect
        .poll(async () => predicate(await spots()), {
          message: label,
          // The journal write is debounced behind other settings changes.
          timeout: 25000,
        })
        .toBe(true);
    } catch (error) {
      error.message += ` · saved spots: ${JSON.stringify(await spots())}`;
      throw error;
    }
    return spots();
  };
  // Captures are evidence, not checks: a slow packaged-app capture (the GPU
  // stage behind the dialog) must not fail the story. Misses are recorded.
  measurements.capturesSkipped = [];
  const capture = async (name) => {
    try {
      await page.screenshot({
        path: `evidence/${prefix}-${name}.png`,
        timeout: 45000,
      });
    } catch (error) {
      measurements.capturesSkipped.push({ name, error: error.message });
    }
  };
  const openTools = async () => {
    if ((await tools().getAttribute("aria-expanded")) !== "true")
      await tools().click();
    await expect(drawer()).toBeVisible();
  };
  const closeTools = async () => {
    if ((await tools().getAttribute("aria-expanded")) === "true") {
      await page.getByRole("button", { name: "Close practice tools" }).click();
      await expect(drawer()).toBeHidden();
    }
  };
  // Press a key in Wait for me and expect the music to move on (or not).
  const press = async (midi, { expectAdvance = true } = {}) => {
    const before = await position();
    await page.keyboard.down(KEY[midi][0]);
    if (expectAdvance)
      await expect.poll(position, { timeout: 5000 }).not.toBe(before);
    else await page.waitForTimeout(80);
    await page.keyboard.up(KEY[midi][0]);
  };
  // Play a bar in Wait for me, with an optional wrong key before its first
  // note: Wait mode flashes the slip and keeps waiting.
  const playBar = async (n, { slip = false } = {}) => {
    const notes = bar(n);
    if (slip) {
      const wrong = notes[0] === 60 ? 72 : 60;
      await press(wrong, { expectAdvance: false });
    }
    for (const midi of notes) await press(midi);
  };
  const waitRun = async (slipBars = []) => {
    await play().click();
    await pause().waitFor();
    for (let n = 1; n <= 4; n++)
      await playBar(n, { slip: slipBars.includes(n) });
    // The last note ends the piece: the transport stops on its own.
    await expect(play()).toBeVisible();
    await expect.poll(position).toBe(16);
  };
  const plan = (wrongAt = []) =>
    fixture.notes.map((n, i) => {
      const midi = wrongAt.includes(i) ? (n.midi === 60 ? 72 : 60) : n.midi;
      return {
        beat: n.beat,
        duration: n.duration,
        key: KEY[midi][0],
        code: KEY[midi][1],
      };
    });
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(play()).toBeEnabled();
    // The volume lives in the Tools drawer; this test instance stays silent.
    await openTools();
    await page.getByRole("slider", { name: "Piano volume" }).fill("0");
    await closeTools();

    // 1. A fresh piece has no spots: no marks, no chips, no drill.
    await button("Import a score").click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${prefix}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await button("Close dialog").click();
    await expect(page.locator(".reader-score-heading h1")).toHaveText(
      fixture.title,
    );
    await page.getByRole("tab", { name: "Number score", exact: true }).click();
    // The imported piece's id, by its title: the last-piece setting may
    // still name the piece that was open before the import.
    await expect
      .poll(async () => {
        const scores = await (await fetch(origin + "/api/scores")).json();
        scoreId = scores.find((x) => x.title === fixture.title)?.id || null;
        return scoreId;
      })
      .toMatch(/^[a-f0-9-]{36}$/);
    await speed().selectOption("1");
    await button("Wait for me").click();
    await expect(marks()).toHaveCount(0);
    await openTools();
    await expect(drawer().locator(".trouble-spots")).toHaveCount(0);
    await closeTools();
    checks.push("A newly imported piece shows no trouble spots");

    // 2. Wait for me: one slipped pass is remembered but is not yet a spot.
    await waitRun([2]);
    let saved = await savedSpots(
      (s) => s?.[2]?.r === "x" && s?.[1]?.r === "." && s?.[4]?.r === ".",
      "the first run's four judged bars are saved",
    );
    assert.deepEqual(
      Object.fromEntries(Object.entries(saved).map(([b, s]) => [b, s.r])),
      { 1: ".", 2: "x", 3: ".", 4: "." },
      "every bar of the run is judged once, the slip in bar 2 and the last bar included",
    );
    await expect(marks()).toHaveCount(0);
    await openTools();
    await expect(drawer().locator(".trouble-spots")).toHaveCount(0);
    await closeTools();
    checks.push(
      "Wait for me judges every bar of a run (the final bar included); a single slip is remembered but is not yet a spot",
    );

    // 3. A second slip in the same bar makes a spot: map mark, drawer chip,
    //    Tools summary, and it survives a reload.
    await button("Start over").click();
    await waitRun([2]);
    saved = await savedSpots((s) => s?.[2]?.r === "xx", "bar 2 slipped twice");
    assert.equal(saved[2].p, 2);
    assert.equal(saved[2].s, 2);
    assert.equal(saved[1].r, "..");
    await expect(marks()).toHaveCount(1);
    await expect(tools()).toContainText("1 trouble spot");
    await openTools();
    await expect(chips()).toHaveCount(1);
    await expect(chips().first()).toContainText("Bar 2");
    await expect(chips().first()).toContainText("slipped the last 2 times");
    await capture("drawer");
    await closeTools();
    await page.reload();
    await expect(play()).toBeEnabled();
    await expect(page.locator(".reader-score-heading h1")).toHaveText(
      fixture.title,
      { timeout: 20000 },
    );
    await expect(marks()).toHaveCount(1);
    const mark = await marks()
      .first()
      .evaluate((el) => ({
        left: parseFloat(el.style.left),
        width: parseFloat(el.style.width),
        trouble: el.style.getPropertyValue("--trouble"),
      }));
    assert.ok(
      Math.abs(mark.left - 25) < 0.5 && Math.abs(mark.width - 25) < 0.5,
      `the mark covers bar 2 of 4: ${JSON.stringify(mark)}`,
    );
    assert.equal(mark.trouble, "1.00");
    measurements.firstSpotMark = mark;
    checks.push(
      "Two slips in a bar make a trouble spot: a warm mark over that bar on the piece map, a chip in Practice tools and a summary on its button, all kept across a reload",
    );

    // 4. Drill: the chip repeats the bar at 70% and says so.
    await openTools();
    await page
      .getByRole("button", { name: /^Drill bar 2, slipped the last 2 times$/ })
      .click();
    await expect(speed()).toHaveValue("0.7");
    await expect(page.locator(".dock-flash")).toContainText(
      "Drill bar 2 at 70%",
    );
    await expect(button("Toggle phrase loop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".piece-map-loop")).toHaveCount(1);
    assert.equal(await position(), 4, "the drill starts at bar 2");
    await expect(chips().first()).toHaveClass(/current/);
    await capture("drill");
    await closeTools();
    checks.push(
      "Drill repeats the spot from its first bar, slows practice to 70% and says so in the dock; the chip shows it is the current repeat",
    );

    // 5. Three clean passes round the one-bar drill clear the spot.
    await play().click();
    await pause().waitFor();
    for (let pass = 0; pass < 3; pass++) {
      for (const midi of bar(2)) await press(midi);
      await expect.poll(position).toBe(4);
    }
    await pause().click();
    await expect(play()).toBeVisible();
    saved = await savedSpots(
      (s) => s?.[2]?.r === "xx...",
      "three clean passes round bar 2 are judged",
    );
    assert.equal(saved[2].p, 5);
    assert.equal(saved[2].s, 2);
    await expect(marks()).toHaveCount(0);
    await expect(tools()).not.toContainText("trouble spot");
    await openTools();
    await expect(drawer().locator(".trouble-spots")).toHaveCount(0);
    await closeTools();
    checks.push(
      "Three clean passes round a one-bar drill clear the spot: the mark, chip and summary go, while the bar's history stays",
    );

    // 6. Play in time: a bar with a wrong note is a slipped pass; the second
    //    time the report card names the spot. Library and Progress offer it.
    await button("Toggle phrase loop").click();
    await expect(button("Toggle phrase loop")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await speed().selectOption("1");
    await button("Start over").click();
    await button("Play in time").click();
    for (let run = 0; run < 2; run++) {
      await play().click();
      await performPlan(page, plan([9]));
      const card = page.getByRole("dialog", { name: /^\d+% · / });
      await card.waitFor();
      await expect(card.locator(".results-bars-head")).toContainText(
        "Most misses in bar 3",
      );
      if (run === 0) await expect(card.locator(".results-spot")).toHaveCount(0);
      else {
        await expect(card.locator(".results-spot")).toContainText(
          "Bar 3 is a trouble spot",
        );
        await expect(card.locator(".results-spot")).toContainText(
          "slipped 2 of the last 4 passes",
        );
        await capture("report");
      }
      await card.getByRole("button", { name: "Play it again" }).click();
      await expect(card).toBeHidden();
    }
    saved = await savedSpots(
      (s) => s?.[3]?.r === "..xx",
      "two graded runs judge bar 3 twice more",
    );
    assert.deepEqual(
      Object.fromEntries(Object.entries(saved).map(([b, s]) => [b, s.r])),
      { 1: "....", 2: "xx.....", 3: "..xx", 4: "...." },
      "graded bars join the Wait for me history: clean bars clean, bar 3 slipped twice",
    );
    await expect(marks()).toHaveCount(1);
    await button("Library").click();
    const drill = page
      .getByRole("group", { name: "Trouble spots" })
      .getByRole("button", {
        name: /^Drill bar 3, slipped 2 of the last 4 passes$/,
      });
    await expect(drill).toBeVisible();
    await capture("library");
    await button("Progress").click();
    const progressSpots = page.getByRole("group", {
      name: `Trouble spots in ${fixture.title}`,
    });
    await expect(progressSpots).toContainText("Trouble spots");
    await expect(progressSpots).toContainText("1 bar cleared");
    await capture("progress");
    await progressSpots
      .getByRole("button", { name: /^Drill bar 3 of Trouble spots check/ })
      .click();
    await expect(page.locator(".reader-score-heading h1")).toHaveText(
      fixture.title,
    );
    await expect(speed()).toHaveValue("0.7");
    await expect(page.locator(".dock-flash")).toContainText(
      "Drill bar 3 at 70%",
    );
    await expect(button("Toggle phrase loop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    assert.equal(await position(), 8, "the drill opens at bar 3");
    checks.push(
      "Play in time judges graded bars too; the second slip names the spot on the report card, Library offers Drill, and Progress lists the spot beside the cleared bar and opens a 70% drill at bar 3",
    );

    // 7. Forget removes the spot everywhere and from the saved journal.
    await openTools();
    await page.getByRole("button", { name: "Forget bar 3" }).click();
    await expect(chips()).toHaveCount(0);
    await closeTools();
    await expect(marks()).toHaveCount(0);
    saved = await savedSpots((s) => s && !s[3], "bar 3 is forgotten");
    assert.deepEqual(Object.keys(saved), ["1", "2", "4"]);
    checks.push(
      "Forget removes a spot from the drawer, the map and the saved journal, keeping the other bars' history",
    );
    assert.deepEqual(errors, []);
    return {
      checks,
      errors,
      measurements,
      audioOutput: "Piano volume set to zero",
      physicalHardwareTested: false,
    };
  } catch (error) {
    error.troubleEvidence = { checks, errors, measurements };
    throw error;
  } finally {
    page.off("pageerror", onError);
    for (const [key] of Object.values(KEY))
      await page.keyboard.up(key).catch(() => {});
  }
}
