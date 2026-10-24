import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// Every module the packaged server loads must be listed in the app's files,
// or the desktop app cannot start its local server (2.0 briefly missed one).
test("the desktop package includes every module the server imports", () => {
  const { build } = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const listed = new Set(build.files.filter((f) => !f.includes("*")));
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const [, spec] of text.matchAll(
      /(?:from\s+|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g,
    )) {
      const target = path
        .normalize(path.join(path.dirname(file), spec))
        .split(path.sep)
        .join("/");
      if (!/\.(m?js|cjs)$/.test(target)) continue;
      assert.ok(
        listed.has(target),
        `${file} imports ${target}, which is not in package.json build.files`,
      );
      visit(target);
    }
  };
  for (const entry of ["server.mjs", "electron.cjs", "recognition-runner.cjs"])
    visit(entry);
  assert.ok(seen.has("src/preferences.mjs"));
  assert.ok(seen.has("src/journal.mjs"));
});
