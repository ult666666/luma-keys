// When the Library folder cannot be opened at all, startup reports a typed
// error the desktop app explains with Try Again (no stack trace), and a
// library that can be read but not written still opens.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { startServer, LibraryUnavailableError } from "../server.mjs";

const require = createRequire(import.meta.url);
const { libraryProblem } = require("../library-access.cjs");
const temp = () => fs.mkdtemp(path.join(os.tmpdir(), "luma-access-"));

test("a file in the Library's place is a LibraryUnavailableError naming the folder, and nothing is changed", async () => {
  const dir = await temp();
  const dataDir = path.join(dir, "Luma Keys", "Library");
  await fs.mkdir(path.dirname(dataDir), { recursive: true });
  await fs.writeFile(dataDir, "not a folder");
  try {
    await assert.rejects(startServer({ port: 0, dataDir }), (e) => {
      assert.ok(e instanceof LibraryUnavailableError);
      assert.equal(e.name, "LibraryUnavailableError");
      assert.equal(e.dir, path.resolve(dataDir));
      assert.ok(["EEXIST", "ENOTDIR"].includes(e.code), e.code);
      return true;
    });
    assert.equal(await fs.readFile(dataDir, "utf8"), "not a folder");
    // A parent that is a file fails the same way.
    await assert.rejects(
      startServer({ port: 0, dataDir: path.join(dataDir, "Inner") }),
      (e) => e instanceof LibraryUnavailableError && e.code === "ENOTDIR",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("a read-only library without an imports folder still opens, reported as not writable", async (t) => {
  if (process.getuid?.() === 0) return t.skip("root ignores permissions");
  const dir = await temp();
  const dataDir = path.join(dir, "Library");
  await fs.mkdir(dataDir);
  await fs.writeFile(
    path.join(dataDir, "preferences.json"),
    JSON.stringify({ theme: "mint", volume: 0.5 }),
  );
  await fs.chmod(dataDir, 0o555);
  let started;
  try {
    started = await startServer({ port: 0, dataDir });
    const base = `http://127.0.0.1:${started.port}`;
    const health = await (await fetch(base + "/api/health")).json();
    assert.equal(health.writable, false);
    const prefs = await (await fetch(base + "/api/preferences")).json();
    assert.equal(prefs.volume, 0.5);
    const log = await fs.readFile(
      path.join(dir, "Logs", "luma-keys.log"),
      "utf8",
    );
    assert.match(log, /imports-folder-unavailable/);
    assert.match(log, /library-not-writable/);
    // Saving into it fails with an error the page can show, and the server
    // keeps answering.
    const form = new FormData();
    form.append(
      "score",
      new Blob([
        JSON.stringify({
          title: "Read-only check",
          bpm: 90,
          notes: [{ midi: 60, beat: 0, duration: 1 }],
        }),
      ]),
      "read-only.json",
    );
    const imported = await fetch(base + "/api/import", {
      method: "POST",
      body: form,
    });
    assert.ok(imported.status >= 400, String(imported.status));
    assert.equal(typeof (await imported.json()).error, "string");
    assert.equal((await fetch(base + "/api/health")).status, 200);
    assert.deepEqual(
      (await fs.readdir(dataDir)).sort(),
      ["preferences.json"],
      "nothing was written into the read-only library",
    );
  } finally {
    await new Promise((r) => (started?.server ? started.server.close(r) : r()));
    await started?.shutdown?.();
    await fs.chmod(dataDir, 0o755);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("the explanation names the folder and the fix for each cause, never a stack trace", () => {
  const dir = "/Users/someone/Desktop/Luma Keys/Library";
  const denied = libraryProblem({ dir, code: "EPERM" });
  assert.match(denied, /Privacy & Security › Files and Folders/);
  assert.ok(denied.includes(dir));
  assert.match(libraryProblem({ dir, code: "EACCES" }), /Files and Folders/);
  assert.match(
    libraryProblem({ dir, code: "EEXIST" }),
    /not a folder is in the way/,
  );
  assert.match(libraryProblem({ dir, code: "ENOTDIR" }), /Rename or move/);
  assert.match(libraryProblem({ dir, code: "EROFS" }), /read-only/);
  assert.match(libraryProblem({ dir, code: "EIO" }), /\(EIO\)/);
  assert.match(libraryProblem({}), /the Library folder/);
  for (const code of ["EPERM", "EEXIST", "EROFS", "EIO"])
    assert.ok(!/\n\s+at /.test(libraryProblem({ dir, code })));
});
