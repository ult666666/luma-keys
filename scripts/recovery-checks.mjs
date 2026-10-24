import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { demos } from "../src/music.mjs";
import { setPianoVolume } from "./piano-volume.mjs";
import { ready, inReadingSettings, colourChoice } from "./settings-ui.mjs";
import { openReview } from "./practice-tools.mjs";

// Recovery in the app (2.44), on an isolated library: an edited piece's
// earlier version comes back from the Library card's menu; a removed piece
// comes back from Recently removed under its own id, with its practice
// history; a damaged removed copy is shown but cannot be restored; and a
// settings snapshot is restored from Settings › Settings history, keeping
// the settings it replaced.
export async function verifyRecovery(page, prefix = "recovery") {
  const checks = [],
    errors = [];
  const onError = (e) => errors.push(e.message);
  page.on("pageerror", onError);
  page.setDefaultTimeout(15000);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const api = (url, init) =>
    page.evaluate(
      async ([url, init]) => {
        const r = await fetch(url, init);
        return { status: r.status, body: await r.json().catch(() => null) };
      },
      [url, init],
    );
  const json = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const health = (await api("/api/health")).body;
  assert.ok(
    health.dataDir.includes("/.qa-runs/"),
    "Recovery QA requires an isolated library",
  );
  const go = async (name) => {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true })
      .click();
  };
  const menuFor = async (title) => {
    await page
      .getByRole("button", { name: `More for ${title}`, exact: true })
      .click();
    return page.getByRole("menu", { name: `${title} actions` });
  };
  const toast = (text) => page.getByText(text).first();
  try {
    await ready(page);
    await setPianoVolume(page, "0");
    const welcome = button("Dismiss welcome");
    if (await welcome.isVisible()) await welcome.click();

    // 1. A piece with an earlier version.
    // (A unique title per run, so a reused library never confuses the cards.)
    const TITLE = `Recovery check ${Date.now().toString(36)}`;
    await button("Import a score").click();
    await page.locator("input[type=file]").setInputFiles({
      name: "recovery.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...demos()[0],
          id: "recovery-fixture",
          title: TITLE,
          composer: "Luma Keys regression fixture",
        }),
      ),
    });
    await page.getByRole("dialog", { name: "Review score" }).waitFor();
    await button("Close dialog").click();
    const saved = (await api("/api/scores")).body.find(
      (s) => s.title === TITLE,
    );
    assert.ok(saved, "the imported piece is listed");
    const id = saved.id;
    // Edit a note in Review, as a reader correcting a recognised score does.
    await go("Library");
    await page
      .getByRole("button", { name: new RegExp(`^Open ${TITLE}`) })
      .click();
    await expect(page.locator(".reader-score-heading h1")).toContainText(TITLE);
    await openReview(page);
    const pitch = page.locator('select[aria-label^="Pitch"]').first();
    const originalMidi = +(await pitch.inputValue());
    const editedMidi = originalMidi + 2;
    await pitch.selectOption(String(editedMidi));
    await button("Save & mark reviewed").click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const firstMidi = async () =>
      (await api("/api/scores")).body
        .find((s) => s.id === id)
        .notes.slice()
        .sort((a, b) => a.beat - b.beat || a.midi - b.midi)[0].midi;
    assert.equal(await firstMidi(), editedMidi, "the review edit was saved");
    await go("Library");
    const menu1 = await menuFor(TITLE);
    await menu1.getByRole("menuitem", { name: /Earlier versions/ }).click();
    const versions = page.getByRole("dialog", { name: "Earlier versions" });
    await expect(versions).toContainText(`Now: ${TITLE}`);
    await expect(versions.locator(".recovery-list li")).toHaveCount(1);
    await expect(versions.locator(".recovery-list li").first()).toContainText(
      /^Until /,
    );
    await page.screenshot({ path: `evidence/${prefix}-versions.png` });
    await versions
      .getByRole("button", { name: /^Restore the version you had until / })
      .click();
    await expect(versions).toHaveCount(0);
    await expect(toast(/^Restored the version you had until /)).toBeVisible();
    assert.equal(await firstMidi(), originalMidi, "the earlier note is back");
    // The piece open in Practice follows the restore.
    await go("Practice");
    await openReview(page);
    assert.equal(
      +(await page.locator('select[aria-label^="Pitch"]').first().inputValue()),
      originalMidi,
    );
    await button("Close dialog").click();
    const after = (await api(`/api/scores/${id}/versions`)).body.versions;
    assert.equal(after.length, 2, "the replaced (edited) version is kept too");
    checks.push(
      "A note edited in Review leaves an earlier version, listed from the Library card's menu; restoring it brings the note back in the Library and in the open piece, and keeps the edited version",
    );

    // 2. Practice history, then remove and restore from Recently removed.
    // (The journal keeps sessions of three seconds or more: play about four.)
    await button("Play").click();
    await page.waitForTimeout(4200);
    await button("Pause").click();
    await expect
      .poll(async () => {
        await page.evaluate(() => window.lumaFlushPreferences?.());
        return !!(await api("/api/preferences")).body.journal.pieces[id];
      })
      .toBe(true);
    await go("Library");
    const menu2 = await menuFor(TITLE);
    await menu2.getByRole("menuitem", { name: /Remove from library/ }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(`^Open ${TITLE}`) }),
    ).toHaveCount(0);
    const removed = page.locator(".recently-removed");
    await expect(removed).toBeVisible();
    await removed.locator("summary").click();
    await expect(removed.locator(`[data-removed-id="${id}"]`)).toContainText(
      TITLE,
    );
    // A damaged copy beside it is shown, never offered for restoring.
    const removedDir = path.join(health.dataDir, "Score recovery", "removed");
    const damaged = "damaged-2026-01-01T00-00-00-000Z.json";
    await fs.writeFile(path.join(removedDir, damaged), '{"notes":');
    await go("Practice");
    await go("Library");
    if (!(await removed.evaluate((d) => d.open)))
      await removed.locator("summary").click();
    const damagedRow = removed.locator('[data-removed-id="damaged"]');
    await expect(damagedRow).toContainText("A damaged file");
    await expect(damagedRow.getByRole("button")).toHaveCount(0);
    await removed.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `evidence/${prefix}-removed.png` });
    await removed
      .getByRole("button", { name: `Restore ${TITLE}`, exact: true })
      .click();
    await expect(
      toast(`${TITLE} is back in your library, with its practice history.`),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^Open ${TITLE}( \\(now reading\\))?$`),
      }),
    ).toBeVisible();
    assert.ok(
      (await api("/api/scores")).body.some((s) => s.id === id),
      "restored under its own id",
    );
    assert.equal(
      await fs.readFile(path.join(removedDir, damaged), "utf8"),
      '{"notes":',
      "the damaged copy is left as it was",
    );
    await fs.rm(path.join(removedDir, damaged));
    checks.push(
      "A removed piece is listed in Recently removed and restored under its own id with its practice history; a damaged copy is shown without a Restore button and left untouched",
    );

    // 3. Settings history.
    const before = (await api("/api/preferences")).body;
    const snapshots = (await api("/api/settings/snapshots")).body.snapshots;
    const today = snapshots.find((s) => s.kind === "day");
    assert.ok(today, "today's first settings write kept a snapshot");
    const snapshotFile = path.join(
      health.dataDir,
      "Settings snapshots",
      today.file,
    );
    const snapshotColours =
      JSON.parse(await fs.readFile(snapshotFile, "utf8")).reading?.colours ||
      "neutral";
    // Change something after the snapshot: the colours.
    const target = snapshotColours === "rose" ? "Ocean" : "Rose";
    await inReadingSettings(page, () => colourChoice(page, target).click());
    await expect
      .poll(async () => {
        await page.evaluate(() => window.lumaFlushPreferences?.());
        return (await api("/api/preferences")).body.reading.colours;
      })
      .toBe(target.toLowerCase());
    const keptBefore = new Set(
      (await api("/api/settings/snapshots")).body.snapshots
        .filter((x) => x.kind === "before-restore")
        .map((x) => x.file),
    );
    await inReadingSettings(page, async (dialog) => {
      const history = dialog.getByRole("region", { name: "Settings history" });
      await history.scrollIntoViewIfNeeded();
      await expect(history.locator(".recovery-list li").first()).toContainText(
        /session/,
      );
      await history
        .getByRole("button", { name: /^Restore settings from / })
        .first()
        .click();
      await page.screenshot({
        path: `evidence/${prefix}-settings-history.png`,
      });
      await history
        .getByRole("button", { name: "Replace my settings" })
        .click();
      await expect(toast(/^Settings restored from /)).toBeVisible();
      await expect(
        history
          .locator(".recovery-list li")
          .filter({ hasText: "Before a restore" })
          .first(),
      ).toBeVisible();
    });
    // (A reused library may already hold earlier ones: one more is new.)
    const keptAfter = (await api("/api/settings/snapshots")).body.snapshots
      .filter((x) => x.kind === "before-restore")
      .map((x) => x.file);
    assert.ok(
      keptAfter.some((f) => !keptBefore.has(f)),
      "the replaced settings were kept as a new entry",
    );
    await expect
      .poll(async () => (await api("/api/preferences")).body.reading.colours)
      .toBe(snapshotColours);
    if (snapshotColours !== "companion")
      await expect(page.locator(`.app.theme-${snapshotColours}`)).toHaveCount(
        1,
      );
    assert.ok(
      (await api("/api/settings/snapshots")).body.snapshots.some(
        (s) => s.kind === "before-restore",
      ),
    );
    checks.push(
      "Settings history lists today's snapshot; restoring it after a colour change asks once, brings the earlier colours back live and keeps the replaced settings as a restorable copy",
    );
    assert.equal(before.journal.pieces[id] !== undefined, true);
    assert.deepEqual(errors, []);
    return { checks, errors };
  } finally {
    page.off("pageerror", onError);
  }
}
