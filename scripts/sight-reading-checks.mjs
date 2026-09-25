import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { generateExercise } from "../src/exercise.mjs";

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
async function performPlan(page, plan) {
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

export async function verifySightReading(page, prefix = "sight-reading") {
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
  if (
    +(await page.getByRole("slider", { name: "Piano volume" }).inputValue()) !==
    0
  )
    await button("Mute").click();
  const historyBefore = (await preferences()).history?.length || 0;

  // 1. A dialog makes an engraved exercise; another one is different music.
  await button("New exercise").click();
  const dialog = page.getByRole("dialog", { name: "A fresh exercise" });
  await dialog
    .getByRole("combobox", { name: "Exercise level" })
    .selectOption("3");
  await dialog
    .getByRole("combobox", { name: "Exercise key" })
    .selectOption("0");
  await dialog
    .getByRole("combobox", { name: "Exercise length" })
    .selectOption("8");
  await dialog
    .getByRole("combobox", { name: "Exercise meter" })
    .selectOption("4/4");
  await dialog
    .getByRole("button", { name: "New exercise", exact: true })
    .click();
  await expect(title()).toHaveText("Sight reading · Level 3 · C major");
  await expect(byline()).toContainText("8 bars");
  const firstSeed = await seedOf();
  assert.ok(firstSeed > 0);
  assert.equal(
    await page.locator(".review-banner").count(),
    0,
    "exercises need no review",
  );
  assert.ok((await page.locator(".reading-right .reading-note").count()) >= 8);
  await expect(page.locator(".reading-heading")).toContainText("Bars 1–4 / 8");
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
  await page.screenshot({ path: `evidence/${prefix}-sheet.png` });
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  await button("Another like this").click();
  await expect(title()).toHaveText("Sight reading · Level 3 · C major");
  const secondSeed = await seedOf();
  assert.notEqual(firstSeed, secondSeed, "a new seed means new music");
  await page.screenshot({ path: `evidence/${prefix}-exercise.png` });
  checks.push(
    "New exercise dialog makes a level-3 C major exercise with eight engraved bars; Another like this changes the seed",
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
  await page.getByRole("dialog", { name: "Make the music yours" }).waitFor();
  await close();
  await expect(title()).toHaveText(known.title);
  await page
    .getByRole("combobox", { name: "Practice speed" })
    .selectOption("1");
  await button("Play in time").click();
  await expect(page.locator(".reader-play-status")).toContainText("count-in");
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
  await expect(page.locator(".reader-play-status")).toContainText(
    "Count in · 1",
  );
  const dispatched = await performPlan(page, plan);
  assert.equal(dispatched.length, plan.length);
  const results = page.getByRole("dialog", { name: /^100% · / });
  await results.waitFor();
  await expect(results.locator(".results-summary strong").first()).toHaveText(
    `${known.notes.length} / ${known.notes.length}`,
  );
  const onTime = Number(
    (
      await results.locator(".results-summary strong").nth(1).textContent()
    ).replace("%", ""),
  );
  assert.ok(onTime >= 80, `on-time share ${onTime}% (clock-scheduled presses)`);
  assert.equal(
    await results.locator(".results-bar.clean").count(),
    known.measures,
  );
  await page.screenshot({ path: `evidence/${prefix}-results-clean.png` });
  await results.getByRole("button", { name: "Play it again" }).click();
  await expect(results).toBeHidden();
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
  const strongs = await graded
    .locator(".results-summary strong")
    .allTextContents();
  assert.equal(
    strongs[0].replace(/\s/g, ""),
    `${known.notes.length - 2}/${known.notes.length}`,
  );
  assert.equal(
    strongs[2],
    "2",
    "the wrong pitch and the skipped note are missed",
  );
  assert.equal(strongs[3], "1", "the wrong pitch is a wrong note");
  await expect(graded.locator(".results-missed")).toContainText(
    `bar ${skipped.beat < 4 ? 1 : Math.floor(skipped.beat / 4) + 1}`,
  );
  const repeat = graded.getByRole("button", { name: /^Repeat bar/ });
  await expect(repeat).toBeVisible();
  await page.screenshot({ path: `evidence/${prefix}-results-flawed.png` });
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
  await expect(page.locator(".segmented .selected")).toHaveText(/Play in time/);
  assert.equal(
    await page.getByRole("combobox", { name: "Practice speed" }).inputValue(),
    "1",
  );
  await page
    .getByRole("combobox", { name: "Practice speed" })
    .selectOption("0.75");
  await button("Listen & follow").click();
  checks.push("The last piece, mode and speed are restored after a reload");

  // 4. The level path starts a left-hand exercise and flat keys read as flats.
  await button("Lessons").click();
  assert.equal(await page.locator(".level-card").count(), 12);
  await expect(
    page.locator(".level-card.recommended .level-number"),
  ).toHaveText("01");
  await expect(page.locator(".level-card").first()).toContainText(
    `${historyBefore + 2} run`,
  );
  await page.screenshot({ path: `evidence/${prefix}-levels.png` });
  await page
    .locator(".level-card")
    .nth(1)
    .getByRole("button", { name: "Start" })
    .click();
  await expect(title()).toContainText("Level 2");
  assert.equal(await page.locator(".reading-right .reading-note").count(), 0);
  assert.ok((await page.locator(".reading-left .reading-note").count()) >= 4);
  await button("New exercise").click();
  await dialog
    .getByRole("combobox", { name: "Exercise level" })
    .selectOption("5");
  await dialog
    .getByRole("combobox", { name: "Exercise key" })
    .selectOption("-1");
  await dialog
    .getByRole("button", { name: "New exercise", exact: true })
    .click();
  await expect(title()).toHaveText("Sight reading · Level 5 · F major");
  await expect(
    page.getByRole("button", { name: "B♭3 ♭7 Te", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".reading-footer")).toContainText("1 = C");
  await button("Reading settings").click();
  await page.getByRole("switch", { name: "Number 1 follows the key" }).click();
  await expect(page.locator(".progress-stats")).toContainText("graded runs");
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
  checks.push(
    "Level path cards show run counts and start a left-hand level; F major spells B♭ and can make number 1 follow the key",
  );
  assert.deepEqual(errors, []);
  return { checks, seeds: [firstSeed, secondSeed] };
}
