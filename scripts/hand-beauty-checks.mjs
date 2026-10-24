import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { setPianoVolume } from "./piano-volume.mjs";

const note = (id, midi, beat, duration, hand = "right") => ({
  id,
  midi,
  beat,
  duration,
  hand,
  velocity: 0.7,
});
const piece = (id, title, notes, bars, bpm = 90) => ({
  id,
  title,
  composer: "Hand motion acceptance",
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
const MOTION = piece(
  "beauty-motion",
  "Repeated notes, held fingers and a leap",
  [
    note("repeat-0", 60, 0, 1),
    note("repeat-1", 60, 1, 1),
    note("repeat-2", 60, 2, 1),
    note("leap", 84, 4, 2),
    note("held", 48, 0, 6, "left"),
    note("left-0", 52, 0, 2, "left"),
    note("left-1", 53, 2, 2, "left"),
    note("left-2", 55, 4, 2, "left"),
  ],
  2,
);
// Identical note density to the existing stage story, so timings are comparable.
const DENSE = piece(
  "beauty-dense",
  "Hand animation at 9,600 notes",
  Array.from({ length: 400 }, (_, bar) =>
    Array.from({ length: 16 }, (_, i) => [
      note(`r${bar}-${i}`, 72 + ((i * 5) % 12), bar * 4 + i / 4, 0.25),
      ...(i % 2
        ? []
        : [
            note(
              `l${bar}-${i}`,
              48 + ((i * 7) % 12),
              bar * 4 + i / 4,
              0.5,
              "left",
            ),
          ]),
    ]).flat(),
  ).flat(),
  400,
  120,
);

const summary = (values) => {
  const times = [...values].sort((a, b) => a - b);
  return {
    count: times.length,
    median: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
    over33ms: times.filter((t) => t > 33.4).length,
    over50ms: times.filter((t) => t > 50).length,
  };
};

// Real imports and controls only. The caller owns the isolated library and cleanup.
export async function verifyHandBeauty(page, prefix = "beauty-2.3") {
  const checks = [],
    errors = [],
    measurements = {};
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const key = (midi) => page.locator(`.piano-key[data-midi="${midi}"]`);
  const seek = (beat) =>
    page.getByRole("slider", { name: "Song position" }).fill(String(beat));
  const play = async () => {
    await button("Play").click();
    await button("Pause").waitFor();
  };
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
  const collect = (ms) =>
    page.evaluate(
      (ms) =>
        new Promise((resolve, reject) => {
          const frames = [],
            start = performance.now();
          let frame;
          const tick = (t) => {
            try {
              const clock = window.lumaClock?.(),
                hands = window.lumaHands?.();
              const beat =
                hands?.right?.beat ??
                (clock?.mapped != null
                  ? clock.mapped - clock.latency * 1.5
                  : clock?.beat);
              const rects = [48, 60, 84].map((midi) => {
                const key = document.querySelector(
                  `.piano-key[data-midi="${midi}"]`,
                );
                if (!key)
                  throw new Error(
                    `Hand beauty capture lost piano key ${midi} after ${frames.length} frames (${Math.round(performance.now() - start)} ms).`,
                  );
                const r = key.getBoundingClientRect();
                return { left: r.left, width: r.width };
              });
              frames.push({ t, beat, hands, rects });
              if (performance.now() - start < ms)
                frame = requestAnimationFrame(tick);
              else resolve(frames);
            } catch (error) {
              cancelAnimationFrame(frame);
              reject(error);
            }
          };
          frame = requestAnimationFrame(tick);
        }),
      ms,
    );
  // (Within 3 px of the key's centre as the 2-D hands draw a fingertip; the
  // 3-D thumb and little finger play on their sides, up to 0.3 of a key in.)
  let keyW = 0;
  const near = (hand) =>
    hand?.renderer === "3d" && keyW ? Math.max(3, 0.3 * keyW) : 3;
  const tipAt = (hand, x) =>
    hand?.fingers.find((f) => Math.abs(f.x - x) < near(hand));
  try {
    await page.setViewportSize({ width: 1480, height: 980 });
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
    await importPiece(MOTION);
    await page.getByRole("tab", { name: "Falling notes", exact: true }).click();
    await button("Listen & follow").click();
    await page
      .getByRole("radiogroup", { name: "Practice hand" })
      .locator(".hand-both")
      .click();
    await page
      .getByRole("combobox", { name: "Practice speed" })
      .selectOption("1");
    if ((await button("Hands").getAttribute("aria-pressed")) !== "true")
      await button("Hands").click();
    await button("Start over").click();
    await expect(key(60)).toHaveAttribute(
      "aria-description",
      "Suggested right hand: finger 1, thumb.",
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.lumaHands?.()?.right?.fingers.length || 0),
      )
      .toBe(5);
    const centres = await page.evaluate(() =>
      Object.fromEntries(
        [48, 60, 84].map((m) => {
          const r = document
            .querySelector(`.piano-key[data-midi="${m}"]`)
            .getBoundingClientRect();
          return [m, r.left + r.width / 2];
        }),
      ),
    );
    keyW = (centres[60] - centres[48]) / 7;
    const initial = await page.evaluate(() => {
      window.__beautyNodes = {
        keys: [...document.querySelectorAll(".piano-key")],
        hands: [
          ...document.querySelectorAll(
            ".hand-layer, .hands3d-layer, .hands3d-canvas",
          ),
        ],
      };
      return window.lumaHands();
    });
    const heldFinger = tipAt(initial.left, centres[48])?.finger;
    assert.ok(heldFinger, "The held bass must have a fingertip on C3");
    await page.screenshot({ path: `evidence/${prefix}-hands-before.png` });
    await play();
    const journey = await collect(3400);
    await pause();
    measurements.attackDiagnostic = {
      centres,
      firstBeat: journey[0]?.beat,
      lastBeat: journey.at(-1)?.beat,
      samples: journey
        .filter(
          (f) =>
            (f.beat >= 0.55 && f.beat <= 1.3) ||
            (f.beat >= 1.55 && f.beat <= 2.3),
        )
        .map((f) => ({
          beat: f.beat,
          glide: f.hands?.right?.glide,
          fingers: f.hands?.right?.fingers,
          c4: f.rects[1],
        })),
    };
    assert.ok(
      journey.at(-1).beat > 4.15,
      "Capture the repeat, both upper changes and leap landing",
    );
    for (const onset of [1, 2]) {
      const before = journey.filter(
        (f) => f.beat > onset - 0.4 && f.beat < onset - 0.025,
      );
      const after = journey.filter(
        (f) => f.beat > onset + 0.025 && f.beat < onset + 0.25,
      );
      assert.ok(
        before.some((f) => {
          const tip = tipAt(f.hands.right, centres[60]);
          return tip && tip.state !== "down";
        }),
        `Repeated C4 must lift before beat ${onset}`,
      );
      assert.ok(
        after.some((f) => tipAt(f.hands.right, centres[60])?.state === "down"),
        `Repeated C4 must strike again at beat ${onset}`,
      );
    }
    const heldFrames = journey.filter((f) => f.beat >= 0 && f.beat < 4.4);
    // (With the 3-D hands the reported x is the fingertip's projected
    // underside, a few pixels off the key centre in perspective even when the
    // contact is exact. "Cannot slide" is the contact point staying on C3,
    // within half a millimetre of its key in 3-D, and not drifting.)
    const contactXs = [];
    for (const frame of heldFrames) {
      const tip = frame.hands.left.fingers.find((f) => f.finger === heldFinger);
      assert.equal(
        tip.state,
        "down",
        "Held C3 stays down while E3/F3/G3 change",
      );
      const x = tip.contact?.x ?? tip.x;
      contactXs.push(x);
      assert.ok(
        Math.abs(x - centres[48]) < keyW / 2 - 1,
        `Held C3 cannot slide off its key (${(x - centres[48]).toFixed(1)} px from its centre, key ${keyW.toFixed(1)} px)`,
      );
      if (tip.errorMm != null)
        assert.ok(
          tip.errorMm <= 0.5,
          `Held C3 stays in contact (${tip.errorMm} mm)`,
        );
    }
    const slide = Math.max(...contactXs) - Math.min(...contactXs);
    assert.ok(slide <= 2, `Held C3's contact drifted ${slide.toFixed(1)} px`);
    measurements.heldContact = {
      slidePx: +slide.toFixed(2),
      offsetPx: +(contactXs[0] - centres[48]).toFixed(2),
    };
    measurements.attacks = {
      frames: journey.length,
      heldFrames: heldFrames.length,
      heldFinger,
    };
    checks.push(
      "Repeated C4 lifts and strikes again; held C3 stays under the same finger while other notes change",
    );

    const first = journey[0].rects;
    let drift = 0;
    for (const frame of journey)
      frame.rects.forEach((r, i) => {
        drift = Math.max(
          drift,
          Math.abs(r.left - first[i].left),
          Math.abs(r.width - first[i].width),
        );
      });
    assert.ok(drift < 0.5, `Keys moved during hand motion by ${drift}px`);
    const retained = await page.evaluate(() => ({
      keys: document.querySelectorAll(".piano-key").length,
      keysRetained: window.__beautyNodes.keys.every(
        (n, i) => n === document.querySelectorAll(".piano-key")[i],
      ),
      handsRetained: window.__beautyNodes.hands.every(
        (n, i) =>
          n ===
          document.querySelectorAll(
            ".hand-layer, .hands3d-layer, .hands3d-canvas",
          )[i],
      ),
    }));
    assert.deepEqual(retained, {
      keys: 88,
      keysRetained: true,
      handsRetained: true,
    });
    const landing = journey.findIndex(
      (f) =>
        f.beat > 3.8 && tipAt(f.hands.right, centres[84])?.state === "down",
    );
    assert.ok(landing > 0, "The hand lands on C6");
    const travel = journey
      .slice(0, landing)
      .filter(
        (f) =>
          f.beat > 2 &&
          f.hands.right.glide > 0 &&
          f.hands.right.glide < 1 &&
          f.hands.right.fingers.some(
            (tip) =>
              tip.x > centres[60] + (centres[84] - centres[60]) * 0.25 &&
              tip.x < centres[84] - (centres[84] - centres[60]) * 0.25,
          ),
      );
    assert.ok(
      travel.length >= 3,
      "The leap has intermediate motion before landing",
    );
    measurements.stationary = {
      drift,
      ...retained,
      glideFrames: travel.length,
      landingBeat: journey[landing].beat,
    };
    checks.push(
      "The hands glide before their leap and land on C6 while all 88 keyboard hit targets and both canvases stay stable",
    );

    const paused = await collect(400);
    const rounded = (hands) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(hands).map(([h, value]) => [
            h,
            value?.fingers.map((f) => [
              f.finger,
              f.state,
              Math.round(f.x * 10),
              Math.round(f.y * 10),
            ]),
          ]),
        ),
      );
    assert.equal(
      new Set(paused.slice(2).map((f) => rounded(f.hands))).size,
      1,
      "Paused hands must not keep moving",
    );
    await seek(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.lumaHands()?.right?.fingers.some((f) => f.state === "down"),
        ),
      )
      .toBe(true);
    const seekBack = await collect(180);
    assert.ok(
      seekBack
        .slice(2)
        .every((f) => tipAt(f.hands.right, centres[60])?.state === "down"),
      "Seeking back shows the destination immediately",
    );
    await seek(4);
    const seekAhead = await collect(180);
    assert.ok(
      seekAhead
        .slice(2)
        .every((f) => tipAt(f.hands.right, centres[84])?.state === "down"),
      "Seeking ahead does not invent a cross-keyboard glide",
    );
    checks.push(
      "Pause freezes the hands; seeking directly to another bar shows that position without an animated sweep",
    );

    await seek(0);
    await page.waitForTimeout(60);
    const hit = await page.evaluate(() => {
      const hands = window.lumaHands();
      const key = document.querySelector('.piano-key[data-midi="60"]');
      const rect = key.getBoundingClientRect();
      const f = hands.right.fingers.find(
        (f) =>
          Math.abs(f.x - rect.left - rect.width / 2) <
            (hands.right.renderer === "3d"
              ? Math.max(3, 0.3 * rect.width)
              : 3) && f.state === "down",
      );
      const x = f.x,
        y = Math.min(rect.bottom - 3, f.y + 8);
      return {
        x,
        y,
        midi: document.elementFromPoint(x, y)?.closest(".piano-key")?.dataset
          .midi,
        overlays: [
          ...document.querySelectorAll(
            ".hand-layer, .hands3d-layer, .hands3d-canvas",
          ),
        ].map((e) => getComputedStyle(e).pointerEvents),
      };
    });
    assert.equal(hit.midi, "60", "The visible hand must not intercept its key");
    assert.ok(hit.overlays.every((v) => v === "none"));
    await page.mouse.move(hit.x, hit.y);
    await page.mouse.down();
    await expect(key(60)).toHaveClass(/pressed/);
    await page.mouse.up();
    await expect(key(60)).not.toHaveClass(/pressed/);
    measurements.pointer = hit;
    checks.push(
      "A pointer can press and release the key directly beneath the rendered hand",
    );

    await seek(3);
    await page
      .getByRole("combobox", { name: "Practice speed" })
      .selectOption("0.5");
    // Changing speed preserves the position; this fixture's late leap is still ahead.
    await seek(3);
    await play();
    await expect
      .poll(async () => {
        const frames = await collect(40);
        return frames.at(-1).hands.right.glide ?? 0;
      })
      .toBeGreaterThan(0.05);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() => page.evaluate(() => window.lumaHands()?.right?.reducedMotion))
      .toBe(true);
    const reduced = await collect(350);
    assert.ok(
      reduced.every((f) => f.hands.right.glide === 0),
      "Reduced motion disables hand anticipation immediately",
    );
    assert.equal(
      new Set(reduced.map((f) => rounded(f.hands))).size,
      1,
      "Reduced hands remain at the current written position between events",
    );
    await pause();
    await page.screenshot({ path: `evidence/${prefix}-reduced-motion.png` });
    await button("Wait for me").click();
    await button("Start over").click();
    await play();
    await page.locator("h1").click();
    await page.keyboard.down("s");
    await expect(key(62).locator(".key-flash")).toBeAttached();
    assert.equal(
      await key(62).evaluate(
        (e) =>
          e
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      ),
      0,
    );
    await page.keyboard.up("s");
    await pause();
    measurements.reducedMotion = {
      frames: reduced.length,
      glide: reduced[0].hands.right.glide,
      uniquePoses: new Set(reduced.map((f) => rounded(f.hands))).size,
    };
    checks.push(
      "Changing reduced motion during a glide stops anticipation immediately, keeps a steady hand position, and preserves wrong-note feedback",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });

    await importPiece(DENSE);
    await button("Listen & follow").click();
    await page
      .getByRole("combobox", { name: "Practice speed" })
      .selectOption("1");
    measurements.performance = {
      devicePixelRatio: await page.evaluate(() => devicePixelRatio),
      viewport: page.viewportSize(),
      samples: [],
    };
    for (const { view, beat } of [
      { view: "Falling notes", beat: 156 },
      { view: "Falling notes", beat: 1196 },
      { view: "Number score", beat: 436 },
    ]) {
      await page.getByRole("tab", { name: view, exact: true }).click();
      await seek(beat);
      await play();
      await page.waitForTimeout(300);
      const times = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const frames = [],
              start = performance.now();
            const tick = (t) => {
              frames.push(t);
              if (t - start < 2500) requestAnimationFrame(tick);
              else resolve(frames.slice(1).map((t, i) => t - frames[i]));
            };
            requestAnimationFrame(tick);
          }),
      );
      await pause();
      const metrics = { view, beat, ...summary(times) };
      measurements.performance.samples.push(metrics);
      assert.ok(
        metrics.median <= 25 && metrics.p95 <= 60,
        JSON.stringify(metrics),
      );
    }
    await page.getByRole("tab", { name: "Falling notes", exact: true }).click();
    await page.screenshot({ path: `evidence/${prefix}-dense.png` });
    checks.push(
      "Both views retain the existing frame-time budget on a 9,600-note score; raw rAF timing, slow frames and device density are recorded",
    );
    assert.deepEqual(errors, []);
    return {
      checks,
      errors,
      measurements,
      physicalHardwareTested: false,
      audioOutput: "Muted",
      performanceScope:
        "rAF scheduling on this test machine; does not measure every presented GPU frame",
    };
  } catch (error) {
    error.handEvidence = { checks, errors, measurements };
    throw error;
  } finally {
    await page.keyboard.up("s").catch(() => {});
    await page.mouse.up().catch(() => {});
    await pause().catch(() => {});
    await page
      .evaluate(() => {
        delete window.__beautyNodes;
      })
      .catch(() => {});
    await page.emulateMedia({ reducedMotion: "no-preference" }).catch(() => {});
    page.off("pageerror", onError);
  }
}
