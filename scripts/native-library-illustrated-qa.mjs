import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { defaultReading } from "../src/preferences.mjs";
import { validatePractice } from "../src/export.mjs";

const directory = path.resolve(".qa-runs/library-illustrated-2.13");
await fs.mkdir(directory, { recursive: true });
const qaRoot = await fs.mkdtemp(path.join(directory, "native-"));
const libraryDirectory = path.join(qaRoot, "Library");
await fs.mkdir(path.join(libraryDirectory, "imports"), { recursive: true });
const today = new Date().toISOString();
const fixtures = [
  [
    "illustrated-sunny-melody",
    "晴天 · Sunny Day",
    "Jay Chou · 周杰伦",
    "Melody & accompaniment · A simpler arrangement for two hands.",
    76,
  ],
  [
    "illustrated-sunny-concert",
    "晴天 · Sunny Day",
    "Jay Chou · 周杰伦",
    "Concert arrangement · A fuller two-hand version.",
    76,
  ],
  [
    "illustrated-storm",
    "Piano Sonata No. 23 “Appassionata” · III. Allegro ma non troppo — Complete performance edition",
    "Ludwig van Beethoven",
    "The original written rhythm and full movement, including the final coda.",
    570,
  ],
  [
    "illustrated-nocturne",
    "Nocturne in E-flat major",
    "Frédéric Chopin",
    "A quiet evening piece.",
    24,
  ],
  [
    "illustrated-prelude",
    "Prelude in C major",
    "Johann Sebastian Bach",
    "Arpeggios and a steady pulse.",
    35,
  ],
].map(([id, title, composer, description, measures], i) =>
  validatePractice({
    id,
    title,
    composer,
    description,
    measures,
    meter: 4,
    bpm: 72 + i * 7,
    source: i % 2 ? "MusicXML" : "PDF",
    createdAt: today,
    reviewed: i !== 2,
    tonic: 0,
    duration: measures * 4,
    warnings: [],
    notes: Array.from({ length: measures * 4 }, (_, n) => ({
      id: `${id}-${n}`,
      midi: [60, 64, 67, 62][n % 4],
      beat: n,
      duration: 0.8,
      hand: n % 4 === 0 ? "left" : "right",
      velocity: 0.6,
    })),
  }),
);
for (const fixture of fixtures)
  await fs.writeFile(
    path.join(libraryDirectory, fixture.id + ".json"),
    JSON.stringify(fixture),
  );
const original = Buffer.from(
  "Isolated QA original import: keep after removing the saved library entry.",
);
const originalPath = path.join(
  libraryDirectory,
  "imports",
  "isolated-original.pdf",
);
await fs.writeFile(originalPath, original);
const preferences = {
  volume: 0,
  theme: "ocean",
  pet: "cat",
  stats: { correct: 0, minutes: 0, sessions: 0 },
  reading: {
    ...defaultReading(),
    companion: "langlang",
    welcomeSeen: true,
    countIn: false,
    last: { scoreId: fixtures[0].id, exercise: null },
  },
  journal: {
    days: {},
    pieces: {
      [fixtures[0].id]: {
        title: fixtures[0].title,
        minutes: 28.5,
        sessions: 4,
        last: today,
        bar: 16,
        ranges: [
          [1, 16],
          [21, 24],
        ],
        passages: [
          [9, 12],
          [21, 24],
        ],
      },
    },
  },
  history: [],
};
await fs.writeFile(
  path.join(libraryDirectory, "preferences.json"),
  JSON.stringify(preferences),
);
const report = {
  passed: false,
  qaRoot,
  checks: [],
  layouts: [],
  themes: [],
  errors: [],
};
let app, page;
const focusOwned = () =>
  app.evaluate(({ app, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.setAudioMuted(true);
    }
    app.focus({ steal: true });
  });
try {
  app = await electron.launch({
    executablePath:
      process.env.LUMA_APP ||
      path.resolve("release/mac-arm64/Luma Keys.app/Contents/MacOS/Luma Keys"),
    env: { ...process.env, LUMA_QA_ROOT: qaRoot },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  report.version = await app.evaluate(({ app }) => app.getVersion());
  assert.match(
    report.version,
    /^2\.13\./,
    "This acceptance suite requires the illustrated Library package",
  );
  const button = (name) => page.getByRole("button", { name, exact: true });
  const library = () =>
    page.getByRole("region", { name: "Library", exact: true });
  const search = () =>
    page.getByRole("textbox", { name: "Find a piece", exact: true });
  const cards = () => library().locator(".piece-card");
  const clock = () => page.evaluate(() => window.lumaClock());
  const close = async () => {
    if (await page.getByRole("dialog").count())
      await button("Close dialog").click();
  };
  const settle = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(650);
  };
  const goLibrary = async () => {
    await button("Library").click();
    await expect(library()).toBeVisible();
    await settle();
  };
  const shot = async (name) => {
    if (await button("Dismiss notification").count())
      await button("Dismiss notification").click();
    await settle();
    await focusOwned();
    await page.screenshot({
      path: path.join(directory, `${name}.png`),
      fullPage: false,
    });
  };
  const metrics = async (name) => {
    const result = await library().evaluate((root) => {
      const rect = (e) => {
        const r = e.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          width: r.width,
          top: r.top,
          bottom: r.bottom,
          height: r.height,
        };
      };
      const visible = (e) =>
        e.getClientRects().length &&
        getComputedStyle(e).visibility !== "hidden";
      return {
        width: innerWidth,
        height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        root: rect(root),
        cards: [...root.querySelectorAll(".piece-card")].map(rect),
        buttons: [...root.querySelectorAll("button")]
          .filter(visible)
          .map((e) => ({
            text: e.getAttribute("aria-label") || e.textContent.trim(),
            ...rect(e),
            clipped: e.scrollWidth > e.clientWidth + 2,
          })),
        titles: [...root.querySelectorAll("h1,h2,h3")]
          .filter(visible)
          .map((e) => ({
            text: e.textContent,
            title: e.title,
            ...rect(e),
            scrollWidth: e.scrollWidth,
            clientWidth: e.clientWidth,
            clamp: getComputedStyle(e).webkitLineClamp,
          })),
        images: [...root.querySelectorAll("img")].map((e) => ({
          src: new URL(e.currentSrc || e.src).pathname,
          complete: e.complete,
          naturalWidth: e.naturalWidth,
          naturalHeight: e.naturalHeight,
          alt: e.alt,
          fit: getComputedStyle(e).objectFit,
          ...rect(e),
        })),
      };
    });
    report.layouts.push({ name, ...result });
    assert.ok(
      result.documentWidth <= result.width + 1,
      `${name}: page overflows horizontally ${result.documentWidth}/${result.width}`,
    );
    assert.ok(
      result.cards.every((r) => r.left >= -1 && r.right <= result.width + 1),
      `${name}: a card leaves the viewport`,
    );
    assert.ok(
      result.buttons.every(
        (b) => b.left >= -1 && b.right <= result.width + 1 && !b.clipped,
      ),
      `${name}: a button is clipped: ${JSON.stringify(result.buttons.filter((b) => b.left < -1 || b.right > result.width + 1 || b.clipped))}`,
    );
    assert.ok(
      result.titles.every(
        (t) => t.scrollWidth <= t.clientWidth + 2 || t.title === t.text,
      ),
      `${name}: truncated title has no complete accessible title`,
    );
    assert.ok(
      result.images.length >= fixtures.length,
      `${name}: illustrated images missing`,
    );
    assert.ok(
      result.images.every(
        (i) =>
          i.complete &&
          i.naturalWidth >= 640 &&
          i.naturalHeight >= 400 &&
          i.width > 0 &&
          i.height > 0 &&
          i.alt === "",
      ),
      `${name}: illustration is broken or lacks decorative semantics`,
    );
    return result;
  };
  await expect(button("Play")).toBeEnabled();
  await focusOwned();
  assert.equal((await clock()).playing, false);
  await goLibrary();
  await expect(cards().filter({ hasText: "晴天 · Sunny Day" })).toHaveCount(2);
  // Native lazy images should load through an actual visit, not a test-only eager override.
  for (const image of await library().locator(".score-artwork img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((el) => el.complete && el.naturalWidth > 0))
      .toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(
    await library().locator("details[open]").count(),
    0,
    "Details are collapsed by default",
  );
  assert.equal(
    await library().locator(".continue-stats:visible").count(),
    0,
    "Featured card does not default to a statistics grid",
  );
  report.checks.push(
    "The native library loads the owned collection without autoplay, with collapsed details and no default featured statistics grid.",
  );

  // Capture all requested geometries on the real package, without touching the personal app.
  for (const [width, height] of [
    [1280, 800],
    [900, 800],
    [390, 844],
    [1280, 633],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle();
    await metrics(`${width}x${height}`);
    await shot(`library-${width}x${height}`);
  }
  report.checks.push(
    "Illustrations load, titles remain available and every card/control fits desktop, narrow, mobile and short-window widths.",
  );
  await page.setViewportSize({ width: 1280, height: 800 });

  await search().fill("晴天");
  await expect(cards()).toHaveCount(2);
  await expect(library().locator(".continue-card")).toHaveCount(0);
  await expect(cards().locator(".piece-arrangement")).toHaveCount(2);
  const arrangements = await cards()
    .locator(".piece-arrangement")
    .allTextContents();
  assert.equal(
    new Set(arrangements).size,
    2,
    "Exact-title editions have distinct visible arrangement labels",
  );
  for (const marker of await cards().locator(".piece-arrangement").all())
    await expect(marker).toBeVisible();
  await shot("library-chinese-variants");
  await search().fill("no-qa-piece-matches-this");
  await expect(cards()).toHaveCount(0);
  await expect(
    library().getByText("No piece matches that search.", { exact: true }),
  ).toBeVisible();
  await search().fill("");
  await button("Continue at bar 16").click();
  await expect(button("Play")).toBeEnabled();
  assert.equal((await clock()).beat, 60);
  assert.equal((await clock()).playing, false);
  await goLibrary();
  await button("9–12").click();
  await expect(
    page.getByRole("button", { name: "Toggle phrase loop", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("spinbutton", { name: "Loop start bar", exact: true }),
  ).toHaveValue("9");
  await expect(
    page.getByRole("spinbutton", { name: "Loop end bar", exact: true }),
  ).toHaveValue("12");
  assert.equal((await clock()).beat, 32);
  assert.equal((await clock()).playing, false);
  await goLibrary();
  await button("From the beginning").click();
  assert.equal((await clock()).beat, 0);
  assert.equal((await clock()).playing, false);
  await goLibrary();
  report.checks.push(
    "Chinese search distinguishes exact-title arrangements; Continue, saved passages and From the beginning open the exact bars safely paused.",
  );

  const storm = cards().filter({
    has: page.getByRole("heading", { name: fixtures[2].title, exact: true }),
  });
  const unrelatedCard = cards().filter({
    has: page.getByRole("heading", { name: fixtures[3].title, exact: true }),
  });
  const unrelatedHeightBefore = (await unrelatedCard.boundingBox()).height;
  const details = storm.locator("details");
  const summary = details.locator("summary");
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(details).toHaveAttribute("open", "");
  const unrelatedHeightAfter = (await unrelatedCard.boundingBox()).height;
  report.detailsLayout = { unrelatedHeightBefore, unrelatedHeightAfter };
  assert.ok(
    Math.abs(unrelatedHeightAfter - unrelatedHeightBefore) < 1,
    "Opening Details must not stretch the other card backgrounds",
  );
  await expect(
    details.getByText(fixtures[2].description, { exact: true }),
  ).toBeVisible();
  await expect(storm.getByText("Review needed", { exact: true })).toBeVisible();
  await storm.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -72));
  await shot("library-grid-details");
  assert.equal(
    (await clock()).playing,
    false,
    "Space on Details must not start the piano",
  );
  await page.keyboard.press("Space");
  await expect(details).not.toHaveAttribute("open", "");
  assert.equal((await clock()).playing, false);
  const keyFocus = await summary.evaluate((e) => ({
    outline: getComputedStyle(e).outlineStyle,
    width: parseFloat(getComputedStyle(e).outlineWidth),
  }));
  assert.ok(
    keyFocus.outline !== "none" && keyFocus.width >= 1,
    `Details focus indicator missing: ${JSON.stringify(keyFocus)}`,
  );
  const artButton = storm.locator(".piece-art-open");
  await artButton.scrollIntoViewIfNeeded();
  const idleArt = await artButton.boundingBox();
  await artButton.hover();
  await expect(artButton).toHaveCSS("filter", "none");
  const hoverArt = await artButton.boundingBox();
  await page.mouse.down();
  await page.waitForTimeout(170);
  const pressedArt = await artButton.boundingBox();
  report.artButton = { idle: idleArt, hovered: hoverArt, pressed: pressedArt };
  for (const box of [hoverArt, pressedArt])
    for (const dimension of ["x", "y", "width", "height"])
      assert.ok(
        Math.abs(box[dimension] - idleArt[dimension]) < 0.1,
        `Large illustration button moves on hover/press: ${dimension}`,
      );
  await page.mouse.up();
  await expect(page.locator(".piece-info h1")).toHaveText(fixtures[2].title);
  assert.equal((await clock()).playing, false);
  await goLibrary();
  const deleteTitle = fixtures[3].title;
  const failDelete = (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "QA delete unavailable; the saved piece remains.",
          }),
        })
      : route.continue();
  await page.route(`**/api/scores/${fixtures[3].id}`, failDelete);
  await button(`Remove ${deleteTitle}`).click();
  await expect(
    page.getByText("QA delete unavailable; the saved piece remains.", {
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(
    await cards()
      .filter({
        has: page.getByRole("heading", { name: deleteTitle, exact: true }),
      })
      .count(),
    1,
  );
  assert.deepEqual(await fs.readFile(originalPath), original);
  await page.unroute(`**/api/scores/${fixtures[3].id}`, failDelete);
  await button(`Remove ${deleteTitle}`).click();
  await expect(
    cards().filter({
      has: page.getByRole("heading", { name: deleteTitle, exact: true }),
    }),
  ).toHaveCount(0);
  assert.deepEqual(await fs.readFile(originalPath), original);
  await assert.rejects(
    fs.stat(path.join(libraryDirectory, fixtures[3].id + ".json")),
    /ENOENT/,
  );
  report.checks.push(
    "Details toggles with Space and visible focus without playing; stationary artwork opens the exact score; failed removal preserves the card and successful removal retains original imports.",
  );

  const historyBefore = await page.evaluate(async () =>
    (await fetch("/api/companion/history")).json(),
  );
  const greeting = button("Say hello to Lang Lang");
  for (const gesture of ["click", "Enter", "Space"]) {
    await page.waitForTimeout(750);
    if (gesture === "click") await greeting.click();
    else {
      await greeting.focus();
      await page.keyboard.press(gesture);
    }
    await expect(library().locator(".library-companion-visit")).toHaveAttribute(
      "data-greeting",
      "yes",
    );
    await expect(greeting).toHaveAttribute("data-reaction", "wave");
    assert.equal(
      (await clock()).playing,
      false,
      `${gesture} greeting must not start playback`,
    );
    assert.equal(
      await page.getByRole("dialog").count(),
      0,
      "A greeting alone is not a chat request",
    );
  }
  await expect(greeting).toHaveAttribute("data-reaction", "none", {
    timeout: 5000,
  });
  const talk = button("Talk with Lang Lang");
  await talk.click();
  const chat = page.getByRole("dialog", { name: "Lang Lang", exact: true });
  await expect(chat).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Ask Lang Lang", exact: true }),
  ).toHaveValue("");
  await expect(button("Stop reply")).toHaveCount(0);
  const historyAfter = await page.evaluate(async () =>
    (await fetch("/api/companion/history")).json(),
  );
  assert.deepEqual(
    historyAfter,
    historyBefore,
    "Greeting/opening chat must not create a message",
  );
  await page.keyboard.press("Escape");
  await expect(chat).toHaveCount(0);
  await expect(talk).toBeFocused();
  report.checks.push(
    "Mouse, Enter and Space greetings animate finitely without sound/playback, chat or writes; Talk opens the empty draft with unchanged history and restores focus on Escape.",
  );

  const profiles = [
    ["beethoven", "Beethoven"],
    ["langlang", "Lang Lang"],
    ["mozart", "Mozart"],
    ["liszt", "Liszt"],
    ["cat", "Luma"],
    ["bunny", "Mochi"],
  ];
  const contrast = async (locator) =>
    locator.evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const c = canvas.getContext("2d", { willReadFrequently: true });
      const color = (value) => {
        c.clearRect(0, 0, 1, 1);
        c.fillStyle = value;
        c.fillRect(0, 0, 1, 1);
        return [...c.getImageData(0, 0, 1, 1).data];
      };
      const fg = color(getComputedStyle(el).color);
      let parent = el,
        bg;
      while (parent) {
        bg = color(getComputedStyle(parent).backgroundColor);
        if (bg[3] > 254) break;
        parent = parent.parentElement;
      }
      const luminance = (a) =>
        a
          .slice(0, 3)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const a = luminance(fg),
        b = luminance(bg);
      return {
        fg,
        bg,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  let currentName = "Lang Lang";
  for (const [id, name] of profiles) {
    await button(`Talk with ${currentName}`).click();
    await button("Change companion").click();
    await button(`Preview ${name}`).click();
    await page
      .getByRole("checkbox", { name: "Match piano sound", exact: true })
      .uncheck();
    await button(`Choose ${name}`).click();
    await expect(page.getByRole("dialog", { name, exact: true })).toBeVisible();
    await close();
    currentName = name;
    await expect(library().locator(".companion-presence")).toHaveAttribute(
      "data-character",
      id,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle();
    const title = await contrast(cards().first().locator("h3"));
    const composer = await contrast(cards().first().locator(".piece-composer"));
    assert.ok(
      title.ratio >= 4.5 && composer.ratio >= 4.5,
      `${id}: title/composer contrast ${title.ratio}/${composer.ratio}`,
    );
    report.themes.push({ id, title, composer });
    await shot(`library-theme-${id}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const mobileGreeting = button("Say hello to Mochi");
  await expect(mobileGreeting).toHaveAttribute("data-reduced-motion", "true");
  await mobileGreeting.click();
  await expect(library().locator(".library-companion-visit")).toHaveAttribute(
    "data-greeting",
    "yes",
  );
  const infiniteMotion = await library().evaluate(
    (el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations === Infinity).length,
  );
  assert.equal(
    infiniteMotion,
    0,
    "Reduced-motion library has no continuous animation",
  );
  assert.equal((await clock()).playing, false);
  await search().focus();
  await page.keyboard.press("a");
  await expect(search()).toHaveValue("a");
  assert.equal((await clock()).playing, false);
  await search().fill("");
  const reducedArt = cards().first().locator(".piece-art-open");
  await reducedArt.scrollIntoViewIfNeeded();
  const reducedIdle = await reducedArt.boundingBox();
  await reducedArt.hover();
  await expect(reducedArt).toHaveCSS("filter", "none");
  await page.mouse.down();
  await page.waitForTimeout(170);
  const reducedPressed = await reducedArt.boundingBox();
  report.reducedArtButton = { idle: reducedIdle, pressed: reducedPressed };
  for (const dimension of ["x", "y", "width", "height"])
    assert.ok(
      Math.abs(reducedPressed[dimension] - reducedIdle[dimension]) < 0.1,
      `Reduced-motion illustration button moves on press: ${dimension}`,
    );
  await page.mouse.up();
  await expect(button("Play")).toBeEnabled();
  await goLibrary();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("library-mobile-reduced");
  report.checks.push(
    "All six companions render with readable title/composer colours; live reduced motion removes continuous animation and mobile greeting/search keyboard input remains safe.",
  );

  await button("Import a score").click();
  const importDialog = page.getByRole("dialog", {
    name: "Import a score",
    exact: true,
  });
  await expect(importDialog).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid-illustrated.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not valid JSON"),
  });
  await expect(importDialog.locator('[role="alert"]')).toBeVisible();
  const existingCount = await page.evaluate(
    async () => (await (await fetch("/api/scores")).json()).length,
  );
  assert.equal(
    existingCount,
    fixtures.length - 1,
    "Invalid import must not replace the library",
  );
  await shot("library-import-error-mobile");
  await page.locator("input[type=file]").setInputFiles({
    name: "illustrated-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...fixtures[4],
        title: "QA imported illustrated piece",
      }),
    ),
  });
  await expect(
    page.getByRole("dialog", { name: "Review score", exact: true }),
  ).toBeVisible();
  await close();
  await goLibrary();
  await search().fill("QA imported illustrated piece");
  await expect(cards()).toHaveCount(1);
  await expect(
    cards().first().getByRole("heading", {
      name: "QA imported illustrated piece",
      exact: true,
    }),
  ).toBeVisible();
  await search().fill("");
  report.checks.push(
    "Invalid imports show a visible mobile error without changing the collection; a corrected import reaches review and becomes searchable.",
  );

  // A read-only response override creates an empty collection on the isolated app;
  // all saved fixture bytes remain on disk for failure diagnosis.
  await page.route("**/api/library", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scores: [], issues: [] }),
    }),
  );
  await page.route("**/api/scores", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.evaluate(() => window.lumaFlushPreferences());
  await page.reload();
  await expect(button("Play")).toBeEnabled();
  await goLibrary();
  await expect(
    library().getByText("No saved pieces yet.", { exact: true }),
  ).toBeVisible();
  assert.ok(
    (await cards().count()) > 0,
    "Empty user collection retains starter pieces",
  );
  await library()
    .getByRole("button", { name: /No saved pieces yet/ })
    .click();
  await expect(importDialog).toBeVisible();
  await close();
  await shot("library-empty-mobile");
  report.checks.push(
    "An empty collection retains starter pieces and a working import action; all native QA files stay isolated from the personal library.",
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  await page
    ?.screenshot({ path: path.join(qaRoot, "failure.png"), fullPage: false })
    .catch(() => {});
  await fs
    .copyFile(
      path.join(qaRoot, "failure.png"),
      path.join(directory, "failure.png"),
    )
    .catch(() => {});
  throw error;
} finally {
  await app
    ?.close()
    .catch((error) => report.errors.push(`Close: ${error.message}`));
  await fs.writeFile(
    path.join(directory, "native-report.json"),
    JSON.stringify(report, null, 2),
  );
  await fs.writeFile(
    path.join(qaRoot, "report.json"),
    JSON.stringify(report, null, 2),
  );
}
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      version: report.version,
      checks: report.checks.length,
      qaRoot,
    },
    null,
    2,
  ),
);
