import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { setPianoVolume } from "./piano-volume.mjs";
import { openFromLibrary } from "./library-open.mjs";

// Keyboard stage acceptance (1.5, 1.6): the keyboard is the main practice
// indicator, and the number score reads as a tape when the runway is off.
// Runs on an isolated library; imports are removed and preferences restored by
// the runner. Invoke serially with other preference-changing stories.

const DYNAMICS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>Stage dynamics</work-title></work>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
<direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type><staff>1</staff><sound tempo="80" dynamics="54"/></direction>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff></note>
</measure>
<measure number="2">
<direction placement="below"><direction-type><dynamics><f/></dynamics></direction-type><staff>1</staff><sound dynamics="106"/></direction>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff></note>
</measure></part></score-partwise>`;

const note = (id, midi, beat, duration, hand) => ({
  id,
  midi,
  beat,
  duration,
  hand,
  velocity: 0.7,
});
const piece = (id, title, notes, bars, bpm = 80) => ({
  id,
  title,
  composer: "Keyboard stage QA",
  bpm,
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
const WIDE = piece(
  "stage-wide",
  "Stage wide range",
  [note("low", 36, 0, 2, "left"), note("high", 96, 0, 2, "right")],
  1,
);
// 400 bars of running sixteenths over eighths: a dense, long score.
const DENSE = (() => {
  const notes = [];
  for (let bar = 0; bar < 400; bar++)
    for (let i = 0; i < 16; i++) {
      notes.push(
        note(`r${bar}-${i}`, 72 + ((i * 5) % 12), bar * 4 + i / 4, 0.25, "right"),
      );
      if (i % 2 === 0)
        notes.push(
          note(`l${bar}-${i}`, 48 + ((i * 7) % 12), bar * 4 + i / 4, 0.5, "left"),
        );
    }
  return piece("stage-dense", "Stage dense", notes, 400, 120);
})();

const TEMPO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>Stage tempo</work-title></work>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<direction><direction-type><words>Moderato</words></direction-type><sound tempo="120"/></direction>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>
<measure number="2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>
<measure number="3"><direction><direction-type><words>Presto</words></direction-type><sound tempo="180"/></direction>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>
<measure number="4"><note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>
<measure number="5"><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>
</part></score-partwise>`;
// A right hand that jumps two octaves over a held bass.
const LEAP = piece(
  "stage-leap",
  "Stage leap",
  [
    note("r1", 60, 0, 1, "right"),
    note("r2", 62, 1, 1, "right"),
    note("r3", 84, 2, 2, "right"),
    note("l1", 48, 0, 4, "left"),
  ],
  1,
  80,
);
// A right-hand triad, then running sixteenths.
const CHORDS = piece(
  "stage-chords",
  "Stage chords",
  [
    note("c1", 60, 0, 1, "right"),
    note("c2", 64, 0, 1, "right"),
    note("c3", 67, 0, 1, "right"),
    ...Array.from({ length: 12 }, (_, i) =>
      note(`s${i}`, 60 + (i % 5) * 2, 1 + i / 4, 0.25, "right"),
    ),
  ],
  1,
  96,
);

const running = (items) =>
  items.filter((item) => item.state === "running" || item.state === "pending");
const animationsOf = (locator) =>
  locator.evaluate((element) =>
    element.getAnimations({ subtree: true }).map((animation) => ({
      name: animation.animationName || animation.constructor.name,
      state: animation.playState,
    })),
  );

export async function verifyKeyboardStage(page, prefix = "keyboard-stage", {
  beforeMotionSample = async () => {},
  afterMotionSample = async () => {},
} = {}) {
  const checks = [],
    errors = [],
    measurements = {};
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const play = () => button("Play");
  const pause = () => button("Pause");
  const position = async () =>
    +(await page.getByRole("slider", { name: "Song position" }).inputValue());
  const key = (midi) => page.locator(`.piano-key[data-midi="${midi}"]`);
  const mode = (name) => button(name).click();
  const importText = async (name, mimeType, text) => {
    await button("Import a score").click();
    await page.locator("input[type=file]").setInputFiles({
      name,
      mimeType,
      buffer: Buffer.from(text),
    });
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await button("Close dialog").click();
  };
  const openPiece = async (title) => {
    await openFromLibrary(page, title);
  };
  const clockBeat = (bpm) =>
    page.evaluate((bpm) => {
      const c = window.lumaClock();
      return c.origin + ((c.now - c.start) * bpm) / 60;
    }, bpm);

  await expect(play()).toBeEnabled();
  await setPianoVolume(page);
  // A fresh library opens with the first-run welcome; the layout checks are
  // for a reader who has put it away.
  const welcome = button("Dismiss welcome");
  if (await welcome.isVisible()) await welcome.click();
  await button("Reading settings").click();
  await page.getByRole("combobox", { name: "Key labels" }).selectOption("numbers");
  await page.getByRole("combobox", { name: "Number tonic" }).selectOption("0");
  const countIn = page.getByRole("switch", { name: "Count me in" });
  if ((await countIn.getAttribute("aria-checked")) === "true") await countIn.click();
  await button("Close dialog").click();
  await openPiece("Twinkle, Little Star");
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  await mode("Listen & follow");
  await page.getByRole("radiogroup", { name: "Practice hand" }).locator(".hand-both").click();
  await page.getByRole("combobox", { name: "Practice speed" }).selectOption("1");
  if (!(await page.locator('[data-testid="note-roll"]').count()))
    await button("Note runway").click();
  const hide = button("Show keyboard guide");
  if (await hide.count()) await hide.click();
  await button("Start over").click();

  // 1. One view: score, keyboard stage (runway + fitted keys) and transport.
  const layout = await page.evaluate(() => {
    const rect = (s) => document.querySelector(s).getBoundingClientRect();
    const viewport = rect(".keyboard-viewport");
    const keys = [60, 62, 64, 65, 67, 69].map((m) =>
      document.querySelector(`.piano-key[data-midi="${m}"]`).getBoundingClientRect(),
    );
    return {
      scoreTop: rect(".score-stage").top,
      stageTop: rect(".keyboard-stage").top,
      stageBottom: rect(".keyboard-stage").bottom,
      dockBottom: rect(".control-dock").bottom,
      pageScroll: document.documentElement.scrollHeight - innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      keyWidth: keys[0].width,
      keyLength: keys[0].height,
      keysVisible: keys.every(
        (k) => k.left >= viewport.left - 0.5 && k.right <= viewport.right + 0.5,
      ),
      runway: rect('[data-testid="note-roll"]').height,
      runwayBeats:
        rect('[data-testid="note-roll"]').height /
        +document.querySelector('[data-testid="note-roll"]').dataset.pxPerBeat,
    };
  });
  measurements.layout = layout;
  assert.ok(layout.scoreTop < layout.stageTop, "score above the keyboard");
  assert.ok(layout.stageBottom <= 800 && layout.dockBottom <= 800, JSON.stringify(layout));
  assert.ok(layout.pageScroll <= 1, "no page scrolling in the studio layout");
  assert.equal(layout.overflow, false);
  assert.ok(layout.keysVisible, "every key of the piece is in view");
  // The keyboard is fitted once to the piece: Twinkle's few notes, as large
  // as the hands allow. (With the 3-D hands shown a key is at least 4.5
  // times as long as it is wide, so they keep natural proportions: about
  // 28 px at 128 px keys in a 1280×800 window.)
  assert.ok(
    layout.keyWidth >= 24 &&
      layout.keyWidth <= Math.floor(layout.keyLength / 4.5) + 1 &&
      layout.keyWidth >= Math.floor(layout.keyLength / 4.5) - 1,
    `${layout.keyWidth}×${layout.keyLength}`,
  );
  // (Since 2.39 the full staff sits above a shorter piano; at 1280×800 the
  // runway is short and shows fewer beats rather than squashing them.)
  assert.ok(
    layout.runway >= 40 && layout.runwayBeats >= 1.4,
    `the note runway shows at least a beat and a half ahead: ${JSON.stringify(layout)}`,
  );
  await page.screenshot({ path: `evidence/${prefix}-studio.png` });
  // 2.2: the keyboard stands still while the music plays (no zoom, no pan).
  const keyRect = () =>
    page.evaluate(() => {
      const r = document.querySelector('.piano-key[data-midi="60"]').getBoundingClientRect();
      return { left: r.left, width: r.width };
    });
  const still = { before: await keyRect() };
  await play().click();
  await pause().waitFor();
  const samples = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(200);
    samples.push(await keyRect());
  }
  await pause().click();
  still.samples = samples;
  measurements.still = still;
  for (const r of samples) {
    assert.ok(Math.abs(r.left - still.before.left) < 0.5, JSON.stringify(still));
    assert.ok(Math.abs(r.width - still.before.width) < 0.5, JSON.stringify(still));
  }
  await button("Start over").click();
  checks.push(
    "At 1280×800 the score, the keyboard stage with its note runway and the transport share one view; the keyboard is fitted once to the piece (Twinkle's keys as large as the hands' proportions allow, all visible) and stands still while the music plays",
  );

  // 2. A C2–C7 piece is fitted without scrolling.
  await importText("stage-wide.json", "application/json", JSON.stringify(WIDE));
  const wide = await page.evaluate(() => {
    const viewport = document.querySelector(".keyboard-viewport").getBoundingClientRect();
    const box = (m) =>
      document.querySelector(`.piano-key[data-midi="${m}"]`).getBoundingClientRect();
    const low = box(36),
      high = box(96);
    return {
      width: box(60).width,
      visible:
        low.left >= viewport.left - 0.5 && high.right <= viewport.right + 0.5,
      offscreen: document.querySelectorAll(".keyboard-offscreen").length,
      low: Math.round(low.left),
      high: Math.round(high.right),
      view: [Math.round(viewport.left), Math.round(viewport.right)],
      title: document.querySelector(".piece-header h1")?.textContent,
    };
  });
  measurements.wide = wide;
  assert.ok(wide.visible, `C2 and C7 are both in view: ${JSON.stringify(wide)}`);
  assert.ok(wide.width >= 24, String(wide.width));
  assert.equal(wide.offscreen, 0);
  checks.push(
    "A five-octave piece (C2–C7) is fitted with readable keys and no offscreen notice",
  );

  // 3. Runway notes land on the line at the audible beat.
  await openPiece("Twinkle, Little Star");
  await button("Start over").click();
  await play().click();
  await pause().waitFor();
  const alignment = async () => {
    const sample = await page.evaluate(() => {
      const c = window.lumaClock();
      const runway = document.querySelector('[data-testid="note-roll"]');
      const r = runway.getBoundingClientRect();
      return {
        now: c.now,
        latency: c.latency || 0,
        start: c.start,
        origin: c.origin,
        ppb: +runway.dataset.pxPerBeat,
        bottom: r.bottom,
        notes: [...document.querySelectorAll(".falling-note")].map((n) => ({
          beat: +n.dataset.beat,
          bottom: n.getBoundingClientRect().bottom,
        })),
      };
    });
    // The runway follows what is heard: the context clock less the output
    // latency (a few ms on speakers, about a quarter second on Bluetooth).
    const beat =
      sample.origin + ((sample.now - sample.latency - sample.start) * 80) / 60;
    const errorsPx = sample.notes
      .filter((n) => n.beat > beat + 0.1 && n.beat < beat + 2.5)
      .map((n) =>
        Math.abs(sample.bottom - n.bottom - (n.beat - beat) * sample.ppb),
      );
    return { beat, ppb: sample.ppb, worst: Math.max(...errorsPx), count: errorsPx.length };
  };
  await expect.poll(position).toBeGreaterThan(1.3);
  const early = await alignment();
  await expect.poll(position, { timeout: 12000 }).toBeGreaterThan(5.3);
  const later = await alignment();
  measurements.alignment = { early, later };
  for (const a of [early, later]) {
    assert.ok(a.count > 0, "notes are on the runway");
    // Within 0.15 beat (audible latency and one frame) of the audio clock.
    assert.ok(a.worst <= a.ppb * 0.15 + 3, JSON.stringify(a));
  }
  await pause().click();
  checks.push(
    "In Listen & follow the runway's notes sit where the audio clock says they should, before and after the runway re-anchors (within 0.15 beat)",
  );

  // 4. Key lights: the hold meter drains, the approach glow grows, dynamics show.
  await importText("stage-dynamics.musicxml", "application/vnd.recordare.musicxml+xml", DYNAMICS_XML);
  await expect(page.locator(".stage-dynamic")).toHaveText("p");
  await button("Start over").click();
  await play().click();
  await pause().waitFor();
  await expect.poll(position).toBeGreaterThan(0.6);
  const light = () =>
    page.evaluate(() => {
      const c4 = document.querySelector('.piano-key[data-midi="60"]');
      const g4 = document.querySelector('.piano-key[data-midi="67"]');
      return {
        on: c4.dataset.on,
        hold: +getComputedStyle(c4).getPropertyValue("--hold"),
        soonHand: g4.dataset.soon,
        soon: +getComputedStyle(g4).getPropertyValue("--soon"),
      };
    });
  // (The approach glow starts as far ahead as the runway shows, which is
  // about a beat and a half at 1280×800 since 2.39.)
  await expect
    .poll(async () => (await light()).soonHand, {
      timeout: 8000,
      intervals: [40],
    })
    .toBe("right");
  const first = { ...(await light()), at: await position() };
  await page.waitForTimeout(450);
  const second = await light();
  measurements.lights = { first, second };
  assert.equal(first.on, "right");
  assert.ok(first.hold > 0 && first.hold <= 1);
  assert.ok(second.hold < first.hold, "the hold meter drains");
  assert.equal(second.soonHand, "right", JSON.stringify({ first, second, at: await position() }));
  assert.ok(second.soon > first.soon, "the approach glow grows");
  await expect.poll(position, { timeout: 8000 }).toBeGreaterThan(4.05);
  await expect(page.locator(".stage-dynamic")).toHaveText("f");
  await pause().click();
  checks.push(
    "While a whole note sounds its key's hold meter drains, the next note's key glows more as it approaches, and the written dynamic follows the music (p, then f)",
  );

  // 5. Wait for me: a wrong key flashes rose, the right key flashes green.
  await openPiece("Twinkle, Little Star");
  await mode("Wait for me");
  await play().click();
  await pause().waitFor();
  await page.keyboard.down("s");
  await expect(key(62).locator('.key-flash[data-kind="miss"]')).toBeAttached();
  // (A wrong note brightens the keys to play once; only a right note raises
  // a light pillar on the runway.)
  await expect(page.locator('[data-nudge="a"], [data-nudge="b"]')).toHaveCount(1);
  await expect(page.locator('.lane-spark[data-kind="miss"]')).toHaveCount(0);
  await page.keyboard.up("s");
  await page.keyboard.down("a");
  await expect(key(60).locator('.key-flash[data-kind="hit"]')).toBeAttached();
  await expect(page.locator('.lane-spark[data-kind="hit"]')).toBeAttached();
  await expect.poll(position).toBe(1);
  await page.keyboard.up("a");
  await page.screenshot({ path: `evidence/${prefix}-wait-feedback.png` });
  await pause().click();
  checks.push(
    "Wait for me: a wrong key flashes rose and the keys to play brighten once; the right key flashes green with a light pillar and the runway steps on",
  );

  // 6. Play in time: on time, late and wrong verdicts on the keys.
  await mode("Play in time");
  await button("Start over").click();
  await play().click();
  await pause().waitFor();
  // A key tried during the count-in sounds but is not judged.
  await page.keyboard.down("d");
  await expect(key(64)).toHaveClass(/pressed/);
  await page.waitForTimeout(120);
  await expect(key(64).locator(".key-flash")).toHaveCount(0);
  await page.keyboard.up("d");
  await expect
    .poll(() => page.evaluate(() => { const c = window.lumaClock(); return c.now >= c.start - 0.004; }), { timeout: 10000, intervals: [5] })
    .toBe(true);
  await page.keyboard.down("a");
  await expect(key(60).locator('.key-flash[data-kind="hit"]')).toBeAttached();
  await page.keyboard.up("a");
  // Second C4 is at beat 1. Aim inside the amber window, with room for IPC.
  await expect.poll(() => clockBeat(80), { intervals: [5], timeout: 5000 }).toBeGreaterThan(1.25);
  await page.evaluate(() => {
    const capture = (event) => {
      if (event.code !== "KeyA") return;
      const clock = window.lumaClock();
      window.__stageDeliveredLate = { clock,
        beat: clock.origin + (clock.now - clock.start) * 80 / 60,
        focused: document.hasFocus(), visibility: document.visibilityState };
      window.removeEventListener("keydown", capture, true);
    };
    window.addEventListener("keydown", capture, true);
  });
  await page.keyboard.down("a");
  measurements.lateDelivery = await page.evaluate(() => window.__stageDeliveredLate);
  await expect(key(60).locator('.key-flash[data-kind="late"]')).toBeAttached();
  await page.keyboard.up("a");
  await page.keyboard.down("s");
  await expect(key(62).locator('.key-flash[data-kind="miss"]')).toBeAttached();
  await page.keyboard.up("s");
  await pause().click();
  const results = page.getByRole("dialog");
  if (await results.count()) await button("Close dialog").click();
  checks.push(
    "Play in time: a press on the beat flashes green, a deliberately late press flashes amber, a wrong pitch flashes rose; count-in presses are not judged",
  );

  // 7. The runway can be hidden, and that choice survives a reload.
  await mode("Listen & follow");
  await button("Note runway").click();
  await expect(page.locator('[data-testid="note-roll"]')).toHaveCount(0);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(play()).toBeEnabled();
  await expect(page.locator('[data-testid="note-roll"]')).toHaveCount(0);
  await button("Note runway").click();
  await expect(page.locator('[data-testid="note-roll"]')).toBeVisible();
  checks.push("Note runway hides and shows the runway, and the choice is kept after a reload");

  // 8. Falling notes: a tall runway and no hide toggle.
  await page.getByRole("tab", { name: "Falling notes", exact: true }).click();
  await expect(page.locator(".runway-tall")).toBeVisible();
  await expect(button("Hide keyboard guide")).toHaveCount(0);
  const tall = await page.locator(".runway-tall").boundingBox();
  // (At 1280×800 the 3-D hands' bed below the keys takes part of the stage:
  // the runway is about 150 px, three times the number view's, and still
  // shows several beats ahead.)
  const tallBeats = await page
    .locator('[data-testid="note-roll"]')
    .evaluate((e) => e.clientHeight / +e.dataset.pxPerBeat);
  assert.ok(
    tall.height >= 2.5 * layout.runway && tall.height >= 130 && tallBeats >= 4,
    JSON.stringify({ tall: tall.height, numbers: layout.runway, tallBeats }),
  );
  measurements.fallingRunway = { height: tall.height, beats: tallBeats };
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  checks.push("Falling notes gives the runway the score's space and keeps the keyboard shown");

  // 9. Reduced motion: feedback without animation.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPiece("Twinkle, Little Star");
  await mode("Wait for me");
  await play().click();
  await pause().waitFor();
  await page.keyboard.down("s");
  await expect(key(62).locator(".key-flash")).toBeAttached();
  assert.equal(running(await animationsOf(key(62))).length, 0);
  await page.keyboard.up("s");
  // (Only a right note raises the runway's light pillar.)
  await page.keyboard.down("a");
  await expect(key(60).locator('.key-flash[data-kind="hit"]')).toBeAttached();
  assert.equal(running(await animationsOf(key(60))).length, 0);
  assert.equal(
    await page.locator(".lane-spark").first().evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await page.keyboard.up("a");
  await pause().click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  checks.push("With reduced motion the verdicts still show, without any key or runway animation");

  // 10. A dense, long score keeps the frame rate.
  await importText("stage-dense.json", "application/json", JSON.stringify(DENSE));
  await mode("Listen & follow");
  await button("Start over").click();
  await play().click();
  await pause().waitFor();
  await beforeMotionSample("dense");
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        const start = performance.now();
        const tick = (t) => {
          times.push(t);
          if (t - start < 2500) requestAnimationFrame(tick);
          else resolve(times.slice(1).map((v, i) => v - times[i]));
        };
        requestAnimationFrame(tick);
      }),
  );
  await afterMotionSample("dense");
  await pause().click();
  frames.sort((a, b) => a - b);
  const median = frames[Math.floor(frames.length / 2)];
  const p95 = frames[Math.floor(frames.length * 0.95)];
  measurements.denseFrames = { count: frames.length, median, p95 };
  assert.ok(median <= 25 && p95 <= 60, JSON.stringify(measurements.denseFrames));
  checks.push(
    `A 400-bar, 9,600-note score plays with smooth frames (median ${median.toFixed(1)} ms, 95th percentile ${p95.toFixed(1)} ms)`,
  );

  // 11. Beside the runway the score is a strip: one line fitted to the width,
  // whole, moving on to the next line when the music gets there, and the
  // runway below it is the larger part of the view.
  await openPiece("Twinkle, Little Star");
  await mode("Listen & follow");
  await page.getByRole("combobox", { name: "Practice speed" }).selectOption("1.25");
  await button("Start over").click();
  await expect(page.locator(".reading-score.reading-strip")).toBeVisible();
  await expect(page.locator(".reading-heading")).toContainText("Bars 1–4");
  const strip = await page.evaluate(() => {
    const scroll = document.querySelector(".reading-strip .reading-scroll");
    const line = scroll.querySelector(".reading-system").getBoundingClientRect();
    const box = scroll.getBoundingClientRect();
    return {
      lines: scroll.querySelectorAll(".reading-system").length,
      sideways: scroll.scrollWidth > scroll.clientWidth + 1,
      whole: line.bottom <= box.bottom + 1 && line.top >= box.top - 1,
      strip: document.querySelector(".score-stage").getBoundingClientRect().height,
      runway: document.querySelector('[data-testid="note-roll"]').getBoundingClientRect().height,
    };
  });
  measurements.strip = strip;
  assert.equal(strip.lines, 1);
  assert.equal(strip.sideways, false, "the strip's line fits the width");
  assert.ok(strip.whole, "the strip's line is whole");
  // (Since 2.39 the score comes first and the piano is shorter, so at
  // 1280×800 the runway is the smaller part; it still shows notes ahead.)
  assert.ok(strip.runway >= 40, JSON.stringify(strip));
  await play().click();
  await pause().waitFor();
  await expect.poll(position, { timeout: 12000 }).toBeGreaterThan(12.2);
  await expect(page.locator(".reading-heading")).toContainText("Bars 1–4");
  await expect.poll(position, { timeout: 8000 }).toBeGreaterThan(16.05);
  await expect(page.locator(".reading-heading")).toContainText("Bars 5–8");
  await pause().click();
  await page.getByRole("combobox", { name: "Practice speed" }).selectOption("1");
  checks.push(
    "Beside the runway the number score is a strip: one whole line fitted to the width (bars 1–4, then 5–8 as the music gets there), above a runway that still shows the notes ahead",
  );

  // 12. Without the runway the score is a tape of lines fitted to the width:
  // the line being played whole on top, the next ones below it.
  await button("Note runway").click();
  await expect(page.locator('[data-testid="note-roll"]')).toHaveCount(0);
  await openPiece("Stage dense");
  await button("Start over").click();
  await expect(page.locator(".reading-score.reading-tape")).toBeVisible();
  const tapeLayout = () =>
    page.evaluate(() => {
      const scroll = document.querySelector(".reading-tape .reading-scroll");
      const box = scroll.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        sideways: scroll.scrollWidth > scroll.clientWidth + 1,
        pageScroll: document.documentElement.scrollHeight - innerHeight,
        gutterText: getComputedStyle(
          document.querySelector(".reading-tape .reading-hand-name span"),
        ).display,
        systems: [...scroll.querySelectorAll(".reading-system")].map((s) => {
          const r = s.getBoundingClientRect();
          return {
            top: r.top,
            bottom: r.bottom,
            first: s.querySelector(".reading-bar-label")?.textContent,
            cursor: !!s.querySelector(".reading-cursor"),
            current: s.classList.contains("reading-system-current"),
          };
        }),
      };
    });
  const tape = await tapeLayout();
  measurements.tape = tape;
  // (At 1280×800 since 2.39 the shorter piano still leaves room for one
  // whole line of this dense piece; a taller window shows the next below.)
  assert.ok(tape.systems.length >= 1, JSON.stringify(tape));
  assert.equal(tape.sideways, false, "tape lines fit the width");
  assert.ok(tape.pageScroll <= 1, "no page scrolling with the tape");
  assert.ok(Math.abs(tape.systems[0].top - tape.top) <= 1.5, "first line on top");
  assert.ok(tape.systems[0].bottom <= tape.bottom + 1, "the line being read is whole");
  assert.ok(tape.systems[0].cursor, "the cursor is on the top line");
  assert.equal(tape.gutterText, "none", "the hand gutter is just R and L");
  // A run of equal notes writes its duration once per bar.
  const rhythm = await page.evaluate(() => {
    const same = document.querySelector(".reading-tape .reading-right .reading-same-rhythm");
    const first = document.querySelector(".reading-tape .reading-right .reading-note");
    return {
      same: document.querySelectorAll(".reading-tape .reading-same-rhythm").length,
      hidden: same && getComputedStyle(same.querySelector("small")).visibility,
      firstShown: getComputedStyle(first.querySelector("small")).visibility,
    };
  });
  assert.ok(rhythm.same > 0, JSON.stringify(rhythm));
  assert.equal(rhythm.hidden, "hidden");
  assert.equal(rhythm.firstShown, "visible");
  await page.screenshot({ path: `evidence/${prefix}-tape.png` });
  // Moving on a line slides the next line up from where the eye found it.
  const nextFirst = tape.systems[1]?.first ?? null;
  const slid = page.locator(".reading-tape .reading-sheet").evaluate(
    (sheet) =>
      new Promise((resolve) => {
        const seen = new Set();
        const start = performance.now();
        const look = () => {
          for (const a of sheet.getAnimations())
            seen.add(String(a.effect.getKeyframes()[0].transform || "fade"));
          if (performance.now() - start < 1200) requestAnimationFrame(look);
          else resolve([...seen]);
        };
        look();
      }),
  );
  await button("Next passage").click();
  const slides = await slid;
  measurements.tapeSlide = slides;
  // (With the next line in view it slides up from where the eye found it;
  // with only the current line in view the next passage enters with a fade.)
  assert.ok(
    nextFirst
      ? slides.some((t) => t.startsWith("translateY("))
      : slides.length > 0,
    JSON.stringify(slides),
  );
  await expect
    .poll(async () => (await tapeLayout()).systems[0].first)
    .not.toBe(tape.systems[0].first);
  if (nextFirst)
    assert.equal((await tapeLayout()).systems[0].first, nextFirst);
  const settled = await tapeLayout();
  assert.ok(Math.abs(settled.systems[0].top - settled.top) <= 1.5, "the tape settles on the new line");
  // Playing along, the frame rate holds with several lines drawn.
  await button("Start over").click();
  await play().click();
  await pause().waitFor();
  await beforeMotionSample("tape");
  const tapeFrames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        const start = performance.now();
        const tick = (t) => {
          times.push(t);
          if (t - start < 2500) requestAnimationFrame(tick);
          else resolve(times.slice(1).map((v, i) => v - times[i]));
        };
        requestAnimationFrame(tick);
      }),
  );
  await afterMotionSample("tape");
  const playing = await tapeLayout();
  await pause().click();
  tapeFrames.sort((a, b) => a - b);
  const tapeMedian = tapeFrames[Math.floor(tapeFrames.length / 2)];
  const tapeP95 = tapeFrames[Math.floor(tapeFrames.length * 0.95)];
  measurements.tapeFrames = { count: tapeFrames.length, median: tapeMedian, p95: tapeP95 };
  assert.ok(tapeMedian <= 25 && tapeP95 <= 60, JSON.stringify(measurements.tapeFrames));
  // Mid-scroll the finished line may still be leaving the top; the line
  // being played is the current one and holds the cursor.
  assert.ok(
    playing.systems.find((s) => s.current)?.cursor,
    "while playing, the cursor stays on the line being played",
  );
  checks.push(
    `Without the runway the score is a tape: lines fitted to the width (no sideways scroll), the line being played whole on top (the next below when there is room); moving on slides the next line up, or brings the next passage in; a run writes its duration once a bar; playing holds the frame rate (median ${tapeMedian.toFixed(1)} ms)`,
  );

  // 13. Count-in without a runway: the beats show beside the cue.
  await mode("Play in time");
  await button("Start over").click();
  await play().click();
  await expect(page.locator(".stage-count")).toHaveText(/^[1-4]$/);
  await pause().click();
  if (await page.getByRole("dialog").count()) await button("Close dialog").click();
  checks.push("Without the runway, Play in time counts in with a large beat number beside the cue");

  // 14. The notes to play light their keys in full.
  await openPiece("Twinkle, Little Star");
  await mode("Wait for me");
  await button("Start over").click();
  await expect(key(60)).toHaveClass(/lit/);
  assert.equal(
    await key(60).locator(".key-light").evaluate((e) => getComputedStyle(e).opacity),
    "1",
  );
  await button("Note runway").click();
  await expect(page.locator('[data-testid="note-roll"]')).toBeVisible();
  checks.push("The keys to play next are lit in full colour");

  // 15. Tempo changes are played: two bars at ♩ = 120, then ♩ = 180.
  await importText("stage-tempo.musicxml", "application/vnd.recordare.musicxml+xml", TEMPO_XML);
  await page.getByRole("tab", { name: "Falling notes", exact: true }).click();
  await mode("Listen & follow");
  await button("Start over").click();
  await play().click();
  await pause().waitFor();
  const rate = async (from, to) => {
    await expect
      .poll(() => page.evaluate(() => window.lumaClock().mapped), { intervals: [10], timeout: 12000 })
      .toBeGreaterThan(from);
    const a = await page.evaluate(() => ({ t: performance.now(), b: window.lumaClock().mapped }));
    await expect
      .poll(() => page.evaluate(() => window.lumaClock().mapped), { intervals: [10], timeout: 12000 })
      .toBeGreaterThan(to);
    const b = await page.evaluate(() => ({ t: performance.now(), b: window.lumaClock().mapped }));
    return ((b.b - a.b) / (b.t - a.t)) * 60000;
  };
  const slow = await rate(1, 3);
  const fast = await rate(9, 11);
  await pause().click();
  measurements.tempo = { slow, fast };
  assert.ok(Math.abs(slow - 120) < 12, JSON.stringify(measurements.tempo));
  assert.ok(Math.abs(fast - 180) < 18, JSON.stringify(measurements.tempo));
  checks.push(
    `A written tempo change is played: ♩ ≈ ${Math.round(slow)} for the opening bars, then ♩ ≈ ${Math.round(fast)} after the change`,
  );

  // 17. The hands: fingertips on the keys they play (the suggested
  // fingering), thumbs inward, the hand setting off for a leap before it lands,
  // and a Hands toggle that is kept after a reload.
  await importText("stage-leap.json", "application/json", JSON.stringify(LEAP));
  await mode("Listen & follow");
  await page.getByRole("combobox", { name: "Practice speed" }).selectOption("0.5");
  await button("Start over").click();
  await expect
    .poll(() => page.evaluate(() => window.lumaHands?.()?.right?.fingers?.length ?? 0))
    .toBe(5);
  const centre = (m) =>
    page.evaluate((m) => {
      const r = document.querySelector(`.piano-key[data-midi="${m}"]`).getBoundingClientRect();
      return r.left + r.width / 2;
    }, m);
  const c3 = await centre(48),
    c4 = await centre(60),
    c6 = await centre(84);
  const start = await page.evaluate(() => window.lumaHands());
  // (A fingertip on its key: within 3 px of its centre as the 2-D hands draw
  // it; the 3-D thumb and little finger play on their sides, a fifth of a
  // key in.)
  const keyW = (c4 - c3) / 7;
  const near = (hand) => (hand?.renderer === "3d" ? Math.max(3, 0.3 * keyW) : 3);
  const onKey = (hand, x) =>
    hand.fingers.find((f) => Math.abs(f.x - x) < near(hand) && f.state !== "up");
  const finger = (hand, n) => hand.fingers.find((f) => f.finger === n);
  assert.ok(onKey(start.right, c4), JSON.stringify({ start, c4 }));
  assert.ok(onKey(start.left, c3), JSON.stringify({ start, c3 }));
  assert.ok(finger(start.right, 1).x < finger(start.right, 5).x, "the right thumb is on the left");
  assert.ok(finger(start.left, 1).x > finger(start.left, 5).x, "the left thumb is on the right");
  // Follow the right hand through the leap, frame by frame.
  await play().click();
  const journey = await page.evaluate(
    ({ c4, c6, keyW }) =>
      new Promise((resolve) => {
        const frames = [];
        const began = performance.now();
        const tick = () => {
          const right = window.lumaHands?.()?.right;
          if (right) {
            const middle = right.fingers.reduce((s, f) => s + f.x, 0) / 5;
            const landed = right.fingers.some(
              (f) =>
                Math.abs(f.x - c6) < (right.renderer === "3d" ? Math.max(3, 0.3 * keyW) : 3) &&
                f.state === "down",
            );
            frames.push({ middle, landed });
          }
          if (performance.now() - began < 4500) requestAnimationFrame(tick);
          else resolve(frames);
        };
        requestAnimationFrame(tick);
      }),
    { c4, c6, keyW },
  );
  await pause().click();
  const landedAt = journey.findIndex((f) => f.landed);
  const gliding = journey
    .slice(0, landedAt < 0 ? journey.length : landedAt)
    .filter((f) => f.middle > c4 + (c6 - c4) * 0.2 && f.middle < c6 - (c6 - c4) * 0.2);
  measurements.hands = { c4, c6, frames: journey.length, landedAt, gliding: gliding.length };
  assert.ok(landedAt > 0, JSON.stringify(measurements.hands));
  assert.ok(gliding.length >= 3, JSON.stringify(measurements.hands));
  // The toggle hides both hands, and the choice survives a reload.
  // (Whichever renderer draws it: the 3-D hands, or the 2-D ones without WebGL.)
  const rightShown = () => page.evaluate(() => !!window.lumaHands?.()?.right);
  await button("Hands").click();
  await expect.poll(rightShown).toBe(false);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(play()).toBeEnabled();
  await expect.poll(rightShown).toBe(false);
  await button("Hands").click();
  await expect.poll(rightShown).toBe(true);
  await page.getByRole("combobox", { name: "Practice speed" }).selectOption("1");
  checks.push(
    `The hands show the suggested fingering on the keys (right hand on C4, left on C3, thumbs inward), set off for a leap before it lands (C4 → C6: gliding for ${gliding.length} frames first), and the Hands toggle is kept after a reload`,
  );

  // 16. The runway zooms to the music: sixteenths stay tall enough to label,
  // chord notes in one hand are tied where they land, the next chord glows.
  await importText("stage-chords.json", "application/json", JSON.stringify(CHORDS));
  await mode("Listen & follow");
  await button("Start over").click();
  const runway = await page.evaluate(() => {
    const roll = document.querySelector('[data-testid="note-roll"]');
    const notes = [...document.querySelectorAll(".falling-note")];
    const sixteenth = notes.find((n) => n.title.includes("0.25 quarter-note beats"));
    return {
      ppb: +roll.dataset.pxPerBeat,
      sixteenth: sixteenth?.getBoundingClientRect().height ?? 0,
      ties: [...document.querySelectorAll(".chord-tie.right")].map((t) => t.getBoundingClientRect().width),
      next: notes.filter((n) => n.classList.contains("next")).map((n) => +n.dataset.beat),
    };
  });
  measurements.runway = runway;
  assert.ok(runway.ppb >= 90, JSON.stringify(runway));
  assert.ok(runway.sixteenth >= 22, JSON.stringify(runway));
  assert.ok(runway.ties.length >= 1 && runway.ties[0] > 60, JSON.stringify(runway));
  // Stopped at the start, the opening triad is the chord to play next.
  assert.deepEqual([...new Set(runway.next)], [0], "the opening chord is next");
  await page.getByRole("tab", { name: "Number score", exact: true }).click();
  checks.push(
    `The runway zooms to the music's density (${Math.round(runway.ppb)} px a beat for sixteenths, each ${Math.round(runway.sixteenth)} px tall), ties the notes of a chord where they land and outlines the next notes`,
  );

  assert.deepEqual(errors, []);
  return { checks, measurements };
}
