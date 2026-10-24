import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { validatePractice, numberedSheet } from "../src/export.mjs";
import { demos, parseMusicXML } from "../src/music.mjs";
import { startServer } from "../server.mjs";
const legacy = () => ({
  title: "A recovered melody",
  composer: "Your music",
  bpm: 90,
  meter: 4,
  notes: [
    { midi: 64, beat: 4, duration: 1, hand: "right", id: "duplicate" },
    { midi: 60, beat: 0, duration: 1, hand: "right", id: "duplicate" },
    { midi: 48, beat: 0, duration: 2, hand: "left" },
  ],
});
test("legacy backups normalize chronological chords and unique editable note IDs without mutating input", () => {
  const raw = legacy(),
    before = structuredClone(raw),
    s = validatePractice(raw);
  assert.deepEqual(raw, before);
  assert.deepEqual(
    s.notes.map((n) => n.midi),
    [48, 60, 64],
  );
  assert.equal(new Set(s.notes.map((n) => n.id)).size, 3);
  assert.deepEqual(
    s.notes.map((n) => n.measure),
    [1, 1, 2],
  );
  assert.ok(s.notes.every((n) => n.velocity === 0.72));
  assert.equal(s.duration, 5);
  assert.equal(s.measures, 2);
  assert.equal(s.reviewed, false);
  assert.match(s.warnings[0], /timing metadata was restored/);
  assert.deepEqual(
    validatePractice(s),
    s,
    "normalization is stable across save/reload",
  );
  const html = numberedSheet(s);
  assert.ok(html.indexOf("Bar 1") < html.indexOf("Bar 2"));
});
test("backup validation rejects malformed metadata and notes with actionable errors", () => {
  const s = demos()[0];
  for (const patch of [
    { warnings: false },
    { warnings: [{}] },
    { createdAt: {} },
    { title: {} },
    { source: {} },
    { description: {} },
    { reviewed: "yes" },
    { duration: "12" },
    { duration: Infinity },
    { measures: 0 },
    { measures: "4" },
    { meter: 1e-30 },
    { meterPulses: [1e-30] },
    { pickup: {} },
    { tonic: 99 },
    { practiceTips: {} },
    { measureLengths: [1e30], measureStarts: [0] },
  ])
    assert.throws(
      () => validatePractice({ ...s, ...patch }),
      /Invalid|invalid/,
      JSON.stringify(patch),
    );
  for (const note of [
    null,
    [],
    {},
    { ...s.notes[0], beat: Infinity },
    { ...s.notes[0], duration: -1 },
    { ...s.notes[0], velocity: {} },
    { ...s.notes[0], velocity: 2 },
  ])
    assert.throws(
      () => validatePractice({ ...s, notes: [note] }),
      /Note 1 has an invalid/,
    );
});
test("round trips preserve real score rhythms, trailing rests and all built-in lessons", async () => {
  const scores = demos();
  for (const file of [
    "Bach-Praeludium.musicxml",
    "Joplin-Entertainer.musicxml",
  ])
    scores.push(
      parseMusicXML(await fs.readFile("tests/fixtures/" + file, "utf8")),
    );
  for (const score of scores) {
    const normalized = validatePractice(JSON.parse(JSON.stringify(score)));
    assert.deepEqual(normalized.notes, score.notes, score.title);
    assert.equal(normalized.duration, score.duration, score.title);
    assert.equal(normalized.measures, score.measures, score.title);
    assert.deepEqual(normalized.warnings, score.warnings, score.title);
  }
});
test("library recovery preserves broken files and healthy scores across import, reload and repair", async () => {
  await fs.mkdir(".qa-runs", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".qa-runs/backup-api-"));
  const dataDir = path.join(root, "Library");
  const { server, port } = await startServer({ port: 0, dataDir });
  const base = `http://127.0.0.1:${port}/api`;
  const upload = async (score) => {
    const form = new FormData();
    form.append("score", new Blob([JSON.stringify(score)]), "backup.json");
    return fetch(base + "/import", { method: "POST", body: form });
  };
  try {
    const imported = await upload(legacy());
    assert.equal(imported.status, 200);
    const { score } = await imported.json();
    const originals = new Map([
      [
        "damaged-date-a.json",
        JSON.stringify({
          ...demos()[0],
          id: "damaged-date-a",
          createdAt: { bad: true },
        }),
      ],
      [
        "damaged-date-b.json",
        JSON.stringify({
          ...demos()[0],
          id: "damaged-date-b",
          createdAt: { bad: true },
        }),
      ],
      ["incomplete.json", '{"notes":'],
      [
        "bad-note.json",
        JSON.stringify({ ...demos()[0], id: "bad-note", notes: [null] }),
      ],
      ["wrong-id.json", JSON.stringify({ ...demos()[0], id: "another-id" })],
    ]);
    for (const [name, value] of originals)
      await fs.writeFile(path.join(dataDir, name), value);
    let library = await (await fetch(base + "/library")).json();
    assert.deepEqual(
      library.scores.map((s) => s.id),
      [score.id],
    );
    assert.equal(library.issues.length, 5);
    assert.equal(
      (await (await fetch(base + "/scores")).json()).length,
      1,
      "old score API stays compatible",
    );
    const before = await fs.readFile(
      path.join(dataDir, score.id + ".json"),
      "utf8",
    );
    for (const bad of [
      { ...score, duration: {} },
      { ...score, notes: [null] },
      null,
    ]) {
      const r = await fetch(base + "/scores/" + score.id, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bad),
      });
      assert.equal(r.status, 400);
      assert.equal(
        await fs.readFile(path.join(dataDir, score.id + ".json"), "utf8"),
        before,
      );
    }
    const r = await upload({ ...score, description: { broken: true } });
    assert.equal(r.status, 400);
    assert.equal(
      (await fs.readdir(dataDir)).filter((f) => f.endsWith(".json")).length,
      6,
      "rejected import leaves no file",
    );
    for (const [name, value] of originals)
      assert.equal(await fs.readFile(path.join(dataDir, name), "utf8"), value);
    await fs.writeFile(
      path.join(dataDir, "damaged-date-a.json"),
      JSON.stringify({ ...demos()[0], id: "damaged-date-a" }),
    );
    library = await (await fetch(base + "/library")).json();
    assert.equal(library.scores.length, 2);
    assert.equal(library.issues.length, 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('practice backups preserve validated score fingering and explicit overrides', () => {
  const score = structuredClone(demos()[0]);
  Object.assign(score.notes[0], { finger: 3, fingerOverride: 2, fingeringSource: 'score', handSource: 'staff' });
  const restored = validatePractice(JSON.parse(JSON.stringify(score)));
  assert.deepEqual(restored.notes[0], score.notes[0]);
  assert.throws(() => validatePractice({ ...score, notes: [{ ...score.notes[0], fingerOverride: 6 }] }), /invalid fingering/);
});
