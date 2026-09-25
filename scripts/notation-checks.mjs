import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { notationBook } from "../tests/fixtures/notation-book.mjs";

export async function verifyNotation(page, prefix = "notation") {
  const checks = [],
    measurements = [];
  const renderReady = async () => {
    await page.locator('.sheet-paper[aria-busy="false"] svg').first().waitFor();
    assert.ok(
      (await page.locator(".sheet-paper svg path").count()) > 50,
      "No engraved notation paths",
    );
  };
  const openScore = async (name, content) => {
    await page
      .getByRole("button", { name: "Import a score", exact: true })
      .click();
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/import") && r.request().method() === "POST",
    );
    await page.locator("input[type=file]").setInputFiles({
      name,
      mimeType: "application/xml",
      buffer: Buffer.from(content),
    });
    const result = await (await response).json();
    assert.ok(result.score, JSON.stringify(result));
    await page.getByRole("dialog", { name: "Make the music yours" }).waitFor();
    return result.score;
  };
  const jump = async (bar, expected) => {
    await page
      .getByRole("spinbutton", { name: "Review from bar" })
      .fill(String(bar));
    await page
      .getByRole("dialog", { name: "Make the music yours" })
      .getByRole("button", { name: "Go", exact: true })
      .click();
    if (expected) {
      await page
        .locator(".notation-navigation")
        .getByText(expected, { exact: true })
        .waitFor();
      await renderReady();
      if (bar > 1)
        await page.waitForFunction(
          (value) =>
            [...document.querySelectorAll(".sheet-paper svg text")].some(
              (t) => t.textContent.trim() === String(value),
            ),
          bar,
        );
    }
  };
  const measure = async (name, start) => {
    await renderReady();
    const data = await page.locator(".sheet-paper").evaluate((e) => ({
      scrollHeight: e.scrollHeight,
      nodes: e.querySelectorAll("*").length,
      paths: e.querySelectorAll("svg path").length,
      visibleHeight: e.clientHeight,
    }));
    measurements.push({
      name,
      ...data,
      loadRenderMs: performance.now() - start,
    });
    return data;
  };

  const bach = await openScore(
    "Bach-Praeludium.musicxml",
    await fs.readFile("tests/fixtures/Bach-Praeludium.musicxml", "utf8"),
  );
  assert.equal(bach.measures, 35);
  assert.equal(bach.notes.length, 549);
  assert.deepEqual(
    bach.notes.slice(0, 3).map((n) => [n.midi, n.beat, n.duration, n.hand]),
    [
      [60, 0, 2, "left"],
      [64, 0.25, 1.75, "left"],
      [67, 0.5, 0.25, "right"],
    ],
  );
  let start = performance.now();
  await page.getByRole("button", { name: "Sheet music", exact: true }).click();
  const first = await measure("Bach first 16 bars", start);
  assert.ok(
    first.nodes < 6000 && first.scrollHeight < 6000,
    JSON.stringify(first),
  );
  await page
    .locator(".notation-navigation")
    .getByText("Bars 1–16 of 35", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Next sheet passage" }).click();
  await page
    .locator(".notation-navigation")
    .getByText("Bars 17–32 of 35", { exact: true })
    .waitFor();
  await renderReady();
  await jump(33, "Bars 33–35 of 35");
  await page.screenshot({ path: `evidence/${prefix}-bach-ending.png` });
  await page
    .getByRole("button", { name: "Recognized notes · 549", exact: true })
    .click();
  assert.ok(
    (await page.locator("tbody tr td:first-child").allTextContents()).includes(
      "33",
    ),
  );
  await page.getByRole("button", { name: "Save & mark reviewed" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("slider", { name: "Song position" }).fill("132");
  await page.getByRole("button", { name: "Review sheet and notes" }).click();
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Review from bar" })
      .inputValue(),
    "34",
  );
  await page.getByRole("button", { name: "Sheet music", exact: true }).click();
  await page
    .locator(".notation-navigation")
    .getByText("Bars 34–35 of 35", { exact: true })
    .waitFor();
  await renderReady();
  await page.getByRole("button", { name: "Close dialog" }).click();
  checks.push(
    "Independent MuseScore Bach export preserves held left-hand voices; notation pages and note review reach late bars directly",
  );
  checks.push(
    "Review reopens at the current practice bar, including original notation",
  );

  const joplin = await openScore(
    "Joplin-Entertainer.musicxml",
    await fs.readFile("tests/fixtures/Joplin-Entertainer.musicxml", "utf8"),
  );
  assert.equal(joplin.measures, 92);
  assert.equal(joplin.notes.length, 1572);
  assert.equal(joplin.duration, 184);
  assert.ok(
    joplin.warnings.some((w) => w.includes("keep your selected tonic")),
  );
  start = performance.now();
  await page.getByRole("button", { name: "Sheet music", exact: true }).click();
  const joplinView = await measure("Joplin first 16 bars", start);
  assert.ok(
    joplinView.nodes < 6000 && joplinView.scrollHeight < 4000,
    JSON.stringify(joplinView),
  );
  await jump(55, "Bars 55–70 of 92");
  await page.screenshot({ path: `evidence/${prefix}-joplin-key-change.png` });
  await jump(90, "Bars 90–92 of 92");
  assert.ok(
    await page.getByRole("button", { name: "Next sheet passage" }).isDisabled(),
  );
  await page.getByRole("button", { name: "Previous sheet passage" }).click();
  await page
    .locator(".notation-navigation")
    .getByText("Bars 74–89 of 92", { exact: true })
    .waitFor();
  await renderReady();
  // Resize must rerender the same passage without loading the whole score.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await renderReady();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: `evidence/${prefix}-mobile-passage.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/scores/") && r.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save & mark reviewed" }).click();
  assert.equal((await saved).request().postDataJSON().duration, 184);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("slider", { name: "Song position" }).fill("183.5");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    () => +document.querySelector('[aria-label="Song position"]').value === 184,
  );
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  checks.push(
    "92-bar Joplin score supports key-change and final passages, previous/next limits and mobile resize",
  );
  checks.push(
    "Written final rest survives review/save and playback reaches the final bar's end",
  );

  const book = await openScore("Long-notation-book.musicxml", notationBook());
  assert.equal(book.measures, 256);
  assert.equal(book.notes.length, 4352);
  await page.getByRole("button", { name: "Sheet music", exact: true }).click();
  await renderReady();
  start = performance.now();
  await jump(129, "Bars 129–144 of 256");
  const late = await measure("256-bar book, bars 129–144", start);
  assert.ok(late.nodes < 6000, JSON.stringify(late));
  await page.screenshot({ path: `evidence/${prefix}-long-book.png` });
  await jump(250, "Bars 250–256 of 256");
  await page
    .getByRole("button", { name: "Recognized notes · 4352", exact: true })
    .click();
  assert.ok(
    (await page.locator("tbody tr td:first-child").allTextContents()).includes(
      "250",
    ),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  checks.push(
    "Valid MusicXML without an XML declaration renders locally; 256-bar / 4,352-note book reaches late notation and note-review passages",
  );
  await openScore(
    "Notation-fallback.json",
    JSON.stringify({
      title: "Notation fallback",
      composer: "QA",
      bpm: 60,
      meter: 4,
      duration: 1,
      measures: 1,
      notes: [
        {
          id: "only-note",
          midi: 60,
          beat: 0,
          duration: 1,
          hand: "right",
          measure: 1,
          velocity: 0.7,
        },
      ],
      xml: "<score-partwise>",
      warnings: [],
    }),
  );
  await page.getByRole("button", { name: "Sheet music", exact: true }).click();
  await page.getByText("Sheet preview unavailable", { exact: true }).waitFor();
  await page
    .getByText(
      "This score could not be engraved. Use the note list or original PDF to review it.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await page.locator(".sheet-paper svg").count(), 0);
  await page
    .getByRole("button", { name: "Recognized notes · 1", exact: true })
    .click();
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await openScore("Notation-recovery.musicxml", notationBook(2));
  await page.getByRole("button", { name: "Sheet music", exact: true }).click();
  await renderReady();
  await page
    .locator(".notation-navigation")
    .getByText("Bars 1–2 of 2", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  checks.push(
    "Invalid embedded notation gives a clear fallback; notes remain editable and the next valid score renders normally",
  );
  return { checks, measurements };
}
