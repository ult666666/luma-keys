// Initial delivery only: archive our own test imports, keep one verified starter melody.
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { numberedSheet } from "../src/export.mjs";
import { demos } from "../src/music.mjs";

if (existsSync("evidence/starter-library-prepared.json"))
  throw Error(
    "Initial delivery cleanup already ran. Never run this on a user library.",
  );
const archive = "evidence/initial-test-library";
await fs.mkdir(archive, { recursive: true });
const files = (await fs.readdir("Library")).filter(
  (f) => f.endsWith(".json") && f !== "preferences.json",
);
const expected = [
  60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60,
];
let keep;
for (const f of files) {
  const s = JSON.parse(await fs.readFile(path.join("Library", f), "utf8"));
  if (
    s.source === "PDF" &&
    JSON.stringify(s.notes.map((n) => n.midi)) === JSON.stringify(expected)
  )
    keep = { f, s };
}
if (!keep) throw Error("No verified starter PDF score found.");
for (const f of files)
  if (f !== keep.f)
    await fs.rename(path.join("Library", f), path.join(archive, f));
keep.s.title = "Start here · C major melody";
keep.s.composer = "Luma Keys · your first 16 notes";
keep.s.reviewed = true;
keep.s.description =
  "A verified starter PDF. Find Do, Re, Mi, and your first octave.";
await fs.writeFile(path.join("Library", keep.f), JSON.stringify(keep.s));
await fs.writeFile(
  "Library/preferences.json",
  JSON.stringify({
    theme: "mint",
    pet: "cat",
    volume: 0.65,
    stats: {
      correct: 0,
      minutes: 0,
      dailyMinutes: 0,
      sessions: 0,
      practiceDate: new Date().toLocaleDateString("en-CA"),
    },
  }),
);
for (const file of await fs.readdir("Exports")) {
  if (file.startsWith("Your first little melody"))
    await fs.rename(path.join("Exports", file), path.join(archive, file));
}
await fs.writeFile(
  "Practice Sheets/Start here - C major numbers.html",
  numberedSheet(keep.s),
);
for (const s of demos())
  await fs.writeFile(
    "Practice Sheets/" +
      s.title.replace(/[^a-z0-9 -]/gi, "") +
      " - numbers.html",
    numberedSheet(s),
  );
console.log(
  "One verified starter score, four built-in lessons, and fresh practice settings are ready.",
);

await fs.writeFile(
  "evidence/starter-library-prepared.json",
  JSON.stringify({
    preparedAt: new Date().toISOString(),
    keptScoreId: keep.s.id,
  }),
);
