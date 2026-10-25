import assert from "node:assert/strict";
import path from "node:path";
import { expect } from "@playwright/test";
import { generateExercise } from "../src/exercise.mjs";
import { setPianoVolume } from "./piano-volume.mjs";
import { clickInPieceTools } from "./practice-tools.mjs";

// Computer keys the app maps to C4–F5 (see KEYS in App.jsx).
const KEYS = {
  60: ["a", "KeyA"],
  61: ["w", "KeyW"],
  62: ["s", "KeyS"],
  63: ["e", "KeyE"],
  64: ["d", "KeyD"],
  65: ["f", "KeyF"],
  66: ["t", "KeyT"],
  67: ["g", "KeyG"],
  68: ["y", "KeyY"],
  69: ["h", "KeyH"],
  70: ["u", "KeyU"],
  71: ["j", "KeyJ"],
  72: ["k", "KeyK"],
};

// Dispatches computer-key presses against the app's audio clock, so timing
// is judged on the same clock the grader uses rather than on test latency.
export async function performPlan(page, plan) {
  return page.evaluate(async (plan) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (key, code, hold) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true }),
      );
      setTimeout(
        () =>
          window.dispatchEvent(
            new KeyboardEvent("keyup", { key, code, bubbles: true }),
          ),
        hold,
      );
    };
    let clock = window.lumaClock();
    const t0 = performance.now();
    while (
      (!clock.playing || clock.now == null || !clock.secondsPerBeat) &&
      performance.now() - t0 < 15000
    ) {
      await wait(5);
      clock = window.lumaClock();
    }
    if (!clock.playing) throw Error("Performance did not start");
    const { start, origin, secondsPerBeat } = clock;
    const dispatched = [];
    let i = 0;
    while (i < plan.length) {
      const c = window.lumaClock();
      if (!c.playing) break;
      const due = start + (plan[i].beat - origin) * secondsPerBeat;
      if (c.now >= due - 0.002) {
        press(
          plan[i].key,
          plan[i].code,
          Math.max(60, plan[i].duration * secondsPerBeat * 600),
        );
        dispatched.push({
          beat: plan[i].beat,
          at: (c.now - start) / secondsPerBeat + origin,
        });
        i++;
      } else await wait(3);
    }
    const t1 = performance.now();
    while (window.lumaClock().playing && performance.now() - t1 < 60000)
      await wait(20);
    return dispatched;
  }, plan);
}

export async function verifySightReading(
  page,
  prefix = "sight-reading",
  { evidenceDir = "evidence" } = {},
) {
  const checks = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(20000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const origin = new URL(page.url()).origin;
  const button = (name) => page.getByRole("button", { name, exact: true });
  const close = () => button("Close dialog").click();
  const title = () => page.locator(".reader-score-heading h1");
  const byline = () => page.locator(".reader-score-heading > div > p").first();
  const seedOf = async () =>
    Number((await byline().textContent()).match(/#(\d+)/)?.[1]);
  const preferences = async () =>
    (await fetch(origin + "/api/preferences")).json();
  await expect(button("Play")).toBeEnabled();
  await setPianoVolume(page, "0");
  const prefsBefore = await preferences();
  const historyBefore = prefsBefore.history?.length || 0;
  // A pristine library greets the reader; a library with a remembered exercise
  // or a dismissed welcome does not.
  if (
    historyBefore === 0 &&
    !prefsBefore.reading?.welcomeSeen &&
    !prefsBefore.reading?.last?.exercise
  ) {
    await expect(page.locator(".welcome-card")).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceDir, `${prefix}-welcome.png`),
    });
    await button("Dismiss welcome").click();
    await expect(page.locator(".welcome-card")).toHaveCount(0);
  }

  // 1. The Exercises screen makes an engraved exercise; Practice makes another.
  // (Since 2.33: a shelf of level cards and one setup card; key, meter and
  // tempo sit under Customize, hands and length are segmented choices.)
  await button("Exercises").click();
  const panel = page.getByRole("complementary", { name: "Exercise options" });
  const chooseLevel = (n) =>
    page.getByRole("button", { name: new RegExp(`^Level ${n}:`) }).click();
  const openCustomize = async () => {
    const details = panel.locator("details.exercise-customize");
    if (!(await details.evaluate((d) => d.open)))
      await details.locator("summary").click();
  };
  await chooseLevel(3);
  await openCustomize();
  await panel.getByRole("combobox", { name: "Exercise key" }).selectOption("0");
  await panel
    .getByRole("group", { name: "Exercise length" })
    .getByRole("button", { name: "8", exact: true })
    .click();
  await panel
    .getByRole("combobox", { name: "Exercise meter" })
    .selectOption("4/4");
  await expect(
    page.locator('.exercise-level[aria-pressed="true"] .exercise-level-number'),
  ).toHaveText("03");
  await panel
    .getByRole("button", { name: "Start exercise", exact: true })
    .click();
  await expect(title()).toHaveText("Sight reading · Level 3 · C major");
  await expect(byline()).toContainText("8 bars");
  await expect(page.locator(".prep-chips .chip-key")).toContainText("C major");
  const firstSeed = await seedOf();
  assert.ok(firstSeed > 0);
  assert.equal(
    await page.locator(".review-banner").count(),
    0,
    "exercises need no review",
  );
  await expect(page.locator(".prep-chips")).toContainText("C major");
  await expect(page.locator(".prep-chips")).toContainText("4/4");
  await expect(page.locator(".prep-chips .chip-right")).toContainText("RH ");
  await expect(page.locator(".next-then")).toContainText("then");
  // (The saved view may be another: read the number score.)
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  // (Since 1.7 the number score beside the runway is a strip of as many
  // bars as fit the width, numbered against the whole exercise.)
  const shownNotes = await page.locator(".reading-right .reading-note").count();
  assert.ok(shownNotes >= 2, `right-hand notes shown: ${shownNotes}`);
  await expect(page.locator(".reading-heading")).toContainText(
    /Bars? 1(–\d+)? \/ 8/,
  );
  await page.getByRole("tab", { name: "Sheet music", exact: true }).click();
  await expect(page.locator(".sheet-paper")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".notation-navigation span")).toHaveText(
    "Bars 1–8 of 8",
  );
  assert.ok(
    (await page.locator(".engraved-sheet svg").count()) >= 1,
    "engraved",
  );
  await page.screenshot({
    path: path.join(evidenceDir, `${prefix}-sheet.png`),
  });
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  await button("Another like this").click();
  await expect(title()).toHaveText("Sight reading · Level 3 · C major");
  const secondSeed = await seedOf();
  assert.notEqual(firstSeed, secondSeed, "a new seed means new music");
  await clickInPieceTools(page, "New exercise");
  await expect(title()).toHaveText("Sight reading · Level 3 · C major");
  assert.notEqual(
    await seedOf(),
    secondSeed,
    "Practice makes a fresh piece at the saved level",
  );
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    dock: document.querySelector(".control-dock").getBoundingClientRect()
      .bottom,
    stage: document.querySelector(".score-stage").getBoundingClientRect()
      .height,
    // 1.7 studio layout: beside the runway the score is a strip sized for the
    // piece; its line is never clipped.
    clipped:
      document.querySelector(".score-stage").scrollHeight >
      document.querySelector(".score-stage").clientHeight + 1,
  }));
  assert.equal(layout.overflow, false, "no horizontal overflow at 1280px");
  assert.ok(
    layout.dock <= 800,
    "the control dock is visible without scrolling",
  );
  assert.ok(
    layout.stage >= 110 && !layout.clipped,
    "the whole score has room beside the keyboard stage",
  );
  await page.screenshot({
    path: path.join(evidenceDir, `${prefix}-exercise.png`),
  });
  checks.push(
    "The Exercises screen makes a level-3 C major exercise with eight engraved bars; Another like this and the Practice New exercise button change the seed; the dock fits a laptop screen",
  );

  // 2. Timed performance graded on the audio clock.
  const known = generateExercise({
    level: 1,
    seed: 5,
    meter: "4/4",
    tempo: 120,
  });
  await button("Import a score").click();
  await page.locator("input[type=file]").setInputFiles({
    name: "known-exercise.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(known)),
  });
  await page.getByRole("dialog", { name: "Review score" }).waitFor();
  await close();
  await expect(title()).toHaveText(known.title);
  await page
    .getByRole("combobox", { name: "Practice speed" })
    .selectOption("1");
  await button("Play in time").click();
  await expect(
    page.locator(".reader-play-status, .maestro-live-status"),
  ).toContainText(/count/i);
  const plan = known.notes.map((n) => ({
    beat: n.beat,
    duration: n.duration,
    key: KEYS[n.midi][0],
    code: KEYS[n.midi][1],
  }));
  assert.ok(
    plan.every((p) => p.key),
    "every note has a computer key",
  );
  await button("Play").click();
  await expect(
    page.locator(".reader-play-status, .maestro-live-status"),
  ).toContainText("Count in · 1");
  const dispatched = await performPlan(page, plan);
  assert.equal(dispatched.length, plan.length);
  const results = page.getByRole("dialog", { name: /^100% · / });
  await results.waitFor();
  // (The report card: a sentence "n of m · missed · extra" and two rings,
  // labelled "…% of notes right" and "…% on time".)
  await expect(results.locator(".report-sentence strong")).toHaveText(
    `${known.notes.length} of ${known.notes.length}`,
  );
  const onTime = Number(
    (
      await results
        .locator('[aria-label$="% on time"]')
        .getAttribute("aria-label")
    ).match(/(\d+)%/)[1],
  );
  assert.ok(onTime >= 80, `on-time share ${onTime}% (clock-scheduled presses)`);
  assert.equal(
    await results.locator(".results-bar.clean").count(),
    known.measures,
  );
  assert.ok(
    (await results.locator(".results-tips li").count()) >= 1,
    "coaching tips",
  );
  await expect(
    results.locator('[aria-label="100% of notes right"]'),
  ).toHaveCount(1);
  await expect(page.locator(".modal.results-dialog")).toHaveClass(/celebrate/);
  await page.screenshot({
    path: path.join(evidenceDir, `${prefix}-results-clean.png`),
  });
  await results.getByRole("button", { name: "Play it again" }).click();
  await expect(results).toBeHidden();
  await expect(
    page.locator(".reader-play-status, .maestro-live-status"),
  ).toContainText("100% right");
  checks.push(
    "Play in time counts in, keeps the transport on the audio clock, and grades a clock-accurate run at 100% with every bar clean",
  );

  // A flawed run: one wrong pitch, one skipped note, one late note.
  const flawed = plan.map((p) => ({ ...p }));
  flawed[1] = { ...flawed[1], key: "g", code: "KeyG" };
  const skipped = flawed.splice(3, 1)[0];
  flawed[4] = { ...flawed[4], beat: flawed[4].beat + 0.25 };
  await button("Play").click();
  await performPlan(page, flawed);
  const graded = page.getByRole("dialog", { name: /^\d+% · / });
  await graded.waitFor();
  const sentence = (await graded.locator(".report-sentence").textContent())
    .replace(/\s+/g, " ")
    .trim();
  const [, right, total, missed, extra] = sentence.match(
    /(\d+) of (\d+) · (\d+) missed · (\d+) extra/,
  );
  assert.equal(
    `${right}/${total}`,
    `${known.notes.length - 2}/${known.notes.length}`,
  );
  assert.equal(missed, "2", "the wrong pitch and the skipped note are missed");
  assert.equal(extra, "1", "the wrong pitch is a wrong note");
  await expect(graded.locator(".results-missed")).toContainText(
    `bar ${skipped.beat < 4 ? 1 : Math.floor(skipped.beat / 4) + 1}`,
  );
  const repeat = graded.getByRole("button", { name: /^Repeat bar/ });
  await expect(repeat).toBeVisible();
  await page.screenshot({
    path: path.join(evidenceDir, `${prefix}-results-flawed.png`),
  });
  await repeat.click();
  await expect(page.locator(".reading-repeat-status")).toContainText(
    "Repeating",
  );
  await expect(
    page.getByRole("button", { name: "Toggle phrase loop" }),
  ).toHaveAttribute("aria-pressed", "true");
  const saved = await preferences();
  assert.equal(saved.history.length, historyBefore + 2);
  const [clean, flawedRun] = saved.history.slice(-2);
  assert.equal(clean.accuracy, 100);
  assert.equal(flawedRun.level, 1);
  assert.equal(flawedRun.complete, true);
  assert.equal(flawedRun.notes, known.notes.length);
  assert.equal(saved.reading.mode, "perform");
  assert.equal(saved.reading.speed, 1);
  checks.push(
    "A flawed run reports missed and wrong notes per bar, offers the weakest bars as a repeat, and records both runs in the saved history",
  );

  // 3. Reading settings survive a reload.
  await page.reload();
  await expect(button("Play")).toBeEnabled();
  await expect(title()).toHaveText(known.title, { timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Play in time", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  assert.equal(
    await page.locator(".welcome-card").count(),
    0,
    "the welcome stays dismissed",
  );
  assert.equal(
    await page.getByRole("combobox", { name: "Practice speed" }).inputValue(),
    "1",
  );
  await page
    .getByRole("combobox", { name: "Practice speed" })
    .selectOption("0.75");
  await button("Listen & follow").click();
  checks.push("The last piece, mode and speed are restored after a reload");

  // 4. The level list starts a left-hand exercise and flat keys read as flats.
  await button("Exercises").click();
  assert.equal(await page.locator(".exercise-level").count(), 12);
  await expect(
    page.getByRole("button", { name: /^Level 1:.*, recommended/ }),
  ).toHaveCount(1);
  // (The setup card counts the selected level's graded runs: those kept
  // before this story plus its two.)
  const levelOneBefore = (prefsBefore.history || []).filter(
    (h) => h.level === 1 && h.mode === "perform",
  ).length;
  await chooseLevel(1);
  await expect(panel.locator(".exercise-results")).toContainText(
    `${levelOneBefore + 2} run`,
  );
  await page.screenshot({
    path: path.join(evidenceDir, `${prefix}-levels.png`),
  });
  await chooseLevel(2);
  await panel
    .getByRole("button", { name: "Start exercise", exact: true })
    .click();
  await expect(title()).toContainText("Level 2");
  assert.equal(await page.locator(".reading-right .reading-note").count(), 0);
  assert.ok((await page.locator(".reading-left .reading-note").count()) >= 4);
  await button("Exercises").click();
  await chooseLevel(5);
  await openCustomize();
  await panel
    .getByRole("combobox", { name: "Exercise key" })
    .selectOption("-1");
  await panel
    .getByRole("button", { name: "Start exercise", exact: true })
    .click();
  await expect(title()).toHaveText("Sight reading · Level 5 · F major");
  await expect(
    page.getByRole("button", { name: "B♭3 ♭7 Te", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".reading-footer")).toContainText("1 = C");
  await button("Reading settings").click();
  await page.getByRole("switch", { name: "Number 1 follows the key" }).click();
  await close();
  await expect(
    page.getByRole("button", { name: "B♭3 4 Fa", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".reading-footer")).toContainText("1 = F");
  await button("Reading settings").click();
  await page.getByRole("switch", { name: "Number 1 follows the key" }).click();
  await page
    .getByRole("combobox", { name: "Number tonic", exact: true })
    .selectOption("0");
  await close();
  // Progress keeps every graded run and reopens the exact exercise.
  await button("Progress").click();
  // (Since 2.31 the graded runs sit in a disclosure.)
  const gradedRuns = page.locator("details.progress-graded");
  if (!(await gradedRuns.evaluate((d) => d.open)))
    await gradedRuns.locator("summary").click();
  await expect(page.locator(".progress-stats")).toContainText("graded runs");
  assert.ok(
    (await page.locator(".trend-chart rect.bar").count()) >= 2,
    "trend chart bars",
  );
  assert.equal(await page.locator(".level-table tbody tr").count(), 12);
  await page.screenshot({
    path: path.join(evidenceDir, `${prefix}-progress.png`),
  });
  await page
    .locator(".run-list li")
    .first()
    .getByRole("button", { name: "Open" })
    .click();
  await expect(title()).toHaveText(known.title);
  await expect(byline()).toContainText("#5");
  await button("Library").click();
  // (Since 2.13 the Library shows cards; the current piece's says so.)
  await expect(
    page.getByRole("button", { name: `Open ${known.title} (now reading)` }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /^Open Für Elise/ }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidenceDir, `${prefix}-library.png`),
  });
  checks.push(
    "Exercises lists twelve levels, counts the selected level's runs and starts a left-hand level; F major spells B♭ and can make number 1 follow the key; Progress charts every run and reopens the exact exercise; the Library card marks the current piece",
  );
  assert.deepEqual(errors, []);
  return { checks, seeds: [firstSeed, secondSeed] };
}
