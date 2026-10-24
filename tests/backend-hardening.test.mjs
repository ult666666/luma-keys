// Backend hardening (2.44), from an audit of the local server: file names
// read as UTF-8, failures described in plain words with the right status,
// odd sub-folders that no longer stop the app from opening, removals that
// say when no recovery copy was kept, a log that survives a failed
// rotation, and interrupted uploads swept at startup.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import { describeFailure } from "../src/failures.mjs";
import { createDiagnosticsLog } from "../src/diagnostics-log.mjs";
import { demos } from "../src/music.mjs";

const temp = () => fs.mkdtemp(path.join(os.tmpdir(), "luma-harden-"));
async function serve(prepare) {
  const dir = await temp();
  const dataDir = path.join(dir, "Library");
  if (prepare) await prepare(dataDir);
  const started = await startServer({ port: 0, dataDir });
  const base = `http://127.0.0.1:${started.port}`;
  return {
    dir,
    dataDir,
    base,
    async close() {
      await started.shutdown();
      await new Promise((r) => started.server.close(r));
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
const XML =
  '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';

test("an imported file's Chinese name is read as UTF-8 for its title", async () => {
  const s = await serve();
  try {
    const form = new FormData();
    form.append("score", new Blob([XML]), "月光 · Moonlight.musicxml");
    const r = await fetch(s.base + "/api/import", {
      method: "POST",
      body: form,
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).score.title, "月光 · Moonlight");
  } finally {
    await s.close();
  }
});

test("failures are described by whose side they are on, never with a raw system message", () => {
  const full = describeFailure(
    Object.assign(new Error("ENOSPC: no space left on device, open '/x'"), {
      code: "ENOSPC",
    }),
  );
  assert.equal(full.status, 507);
  assert.match(full.error, /disk is full/);
  assert.ok(!full.error.includes("ENOSPC"));
  for (const code of ["EACCES", "EPERM", "EROFS"])
    assert.equal(
      describeFailure(Object.assign(Error("x"), { code })).status,
      503,
    );
  assert.equal(
    describeFailure(Object.assign(Error("x"), { code: "EIO" })).status,
    500,
  );
  assert.equal(
    describeFailure(new TypeError("Cannot read properties")).status,
    500,
  );
  assert.ok(
    !describeFailure(new TypeError("Cannot read")).error.includes(
      "Cannot read",
    ),
  );
  // The reader's mistakes keep their own explanation.
  const invalid = describeFailure(Error("Note 1 has an invalid pitch."));
  assert.deepEqual(invalid, {
    status: 400,
    error: "Note 1 has an invalid pitch.",
  });
  assert.equal(
    describeFailure(Object.assign(Error("gone"), { status: 404 })).status,
    404,
  );
  assert.equal(describeFailure({ code: "LIMIT_FILE_SIZE" }).status, 413);
  assert.equal(
    describeFailure({
      type: "entity.parse.failed",
      status: 400,
      message: "Unexpected token",
    }).error,
    "That request was not valid JSON.",
  );
});

test("a disk-side failure on save answers 503 in plain words and is logged as the server's", async (t) => {
  if (process.getuid?.() === 0) return t.skip("root ignores permissions");
  const s = await serve();
  try {
    await fs.chmod(s.dataDir, 0o555);
    const r = await fetch(s.base + "/api/scores/harden-a", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...demos()[0], id: "harden-a" }),
    });
    assert.equal(r.status, 503);
    const body = await r.json();
    assert.match(body.error, /can't write to its Library folder/);
    assert.ok(!/EACCES|\//.test(body.error), body.error);
  } finally {
    await fs.chmod(s.dataDir, 0o755);
    await s.close();
  }
});

test("a file where the accompaniment or imports folder should be no longer stops the server from starting", async () => {
  for (const name of ["accompaniment", "imports"]) {
    const s = await serve(async (dataDir) => {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(path.join(dataDir, name), "not a folder");
    });
    try {
      assert.equal((await fetch(s.base + "/api/health")).status, 200, name);
      assert.equal((await fetch(s.base + "/api/scores")).status, 200);
      // The odd file is left as it was.
      assert.equal(
        await fs.readFile(path.join(s.dataDir, name), "utf8"),
        "not a folder",
      );
      if (name === "accompaniment") {
        const asset = await fetch(
          s.base + "/api/backing-assets/00000000-0000-4000-8000-000000000000",
        );
        assert.equal(asset.status, 404);
      }
    } finally {
      await s.close();
    }
  }
});

test("a linked accompaniment folder is refused for playback but does not stop startup", async () => {
  const outside = await temp();
  const s = await serve(async (dataDir) => {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.symlink(outside, path.join(dataDir, "accompaniment"));
  });
  try {
    assert.equal((await fetch(s.base + "/api/health")).status, 200);
    const asset = await fetch(
      s.base + "/api/backing-assets/00000000-0000-4000-8000-000000000000",
    );
    assert.equal(asset.status, 404);
  } finally {
    await s.close();
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("interrupted accompaniment uploads are swept at startup; finished audio is kept", async () => {
  const keep = "00000000-0000-4000-8000-000000000001.mp3";
  const stale = [
    ".upload-11111111-1111-4111-8111-111111111111.tmp",
    ".metadata-22222222-2222-4222-8222-222222222222.tmp",
  ];
  const s = await serve(async (dataDir) => {
    const dir = path.join(dataDir, "accompaniment");
    await fs.mkdir(dir, { recursive: true });
    for (const name of [...stale, keep])
      await fs.writeFile(path.join(dir, name), "x");
  });
  try {
    const names = await fs.readdir(path.join(s.dataDir, "accompaniment"));
    assert.deepEqual(names, [keep]);
  } finally {
    await s.close();
  }
});

test("a removal says whether a recovery copy was kept", async () => {
  const s = await serve();
  try {
    const put = (id) =>
      fetch(`${s.base}/api/scores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...demos()[0], id }),
      });
    await put("harden-kept");
    let r = await (
      await fetch(`${s.base}/api/scores/harden-kept`, { method: "DELETE" })
    ).json();
    assert.equal(r.kept, true);
    // A file where Score recovery should be: the piece still goes, and the
    // reply says no copy was kept.
    await put("harden-lost");
    await fs.rm(path.join(s.dataDir, "Score recovery"), {
      recursive: true,
      force: true,
    });
    await fs.writeFile(path.join(s.dataDir, "Score recovery"), "in the way");
    r = await (
      await fetch(`${s.base}/api/scores/harden-lost`, { method: "DELETE" })
    ).json();
    assert.equal(r.kept, false);
    assert.ok(
      !(await fetch(`${s.base}/api/scores`).then((x) => x.json())).some(
        (x) => x.id === "harden-lost",
      ),
    );
    // Removing a piece that is not there: nothing to warn about.
    r = await (
      await fetch(`${s.base}/api/scores/harden-missing`, { method: "DELETE" })
    ).json();
    assert.equal(r.kept, null);
  } finally {
    await s.close();
  }
});

test("the diagnostics log keeps writing when rotation is blocked", async () => {
  const dir = await temp();
  try {
    // Something that cannot be replaced where the rotated log goes.
    await fs.mkdir(path.join(dir, "luma-keys.log.1"));
    await fs.writeFile(path.join(dir, "luma-keys.log.1", "x"), "x");
    const log = createDiagnosticsLog({ dir, maxBytes: 300 });
    for (let i = 0; i < 20; i++) log.record("event-" + i, { count: i });
    await log.flush();
    assert.equal(log.failures, 0);
    const text = await fs.readFile(path.join(dir, "luma-keys.log"), "utf8");
    assert.match(text.trim().split("\n").at(-1), /"event":"event-19"/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("the diagnostics log resumes once its folder can be made", async () => {
  const dir = await temp();
  try {
    const blocked = path.join(dir, "Logs");
    await fs.writeFile(blocked, "in the way");
    const log = createDiagnosticsLog({ dir: blocked });
    log.record("first");
    await log.flush();
    assert.equal(log.failures, 1);
    await fs.rm(blocked);
    log.record("second");
    await log.flush();
    assert.match(
      await fs.readFile(path.join(blocked, "luma-keys.log"), "utf8"),
      /"second"/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("a second server on the same Library is noticed: it reports the first and skips its sweeps", async () => {
  const { spawn } = await import("node:child_process");
  const dir = await temp();
  const dataDir = path.join(dir, "Library");
  await fs.mkdir(dataDir, { recursive: true });
  const first = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { startServer } from ${JSON.stringify(new URL("../server.mjs", import.meta.url).href)};
       await startServer({ port: 0, dataDir: ${JSON.stringify(dataDir)} });
       console.log("ready");`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  try {
    await new Promise((resolve, reject) => {
      first.stdout.on("data", (d) => String(d).includes("ready") && resolve());
      first.on("exit", reject);
    });
    // A temporary file the first server could be writing right now.
    const busy = path.join(
      dataDir,
      ".busy.json.12345678-1234-4123-8123-123456789abc.tmp",
    );
    await fs.writeFile(busy, "half");
    const second = await startServer({ port: 0, dataDir });
    try {
      const health = await (
        await fetch(`http://127.0.0.1:${second.port}/api/health`)
      ).json();
      assert.equal(health.sharedWith?.pid, first.pid);
      assert.equal(await fs.readFile(busy, "utf8"), "half", "not swept");
    } finally {
      await second.shutdown();
      await new Promise((r) => second.server.close(r));
    }
    first.kill();
    await new Promise((r) => first.once("exit", r));
    // The first is gone: a new server is on its own again.
    const third = await startServer({ port: 0, dataDir });
    try {
      const health = await (
        await fetch(`http://127.0.0.1:${third.port}/api/health`)
      ).json();
      assert.equal(health.sharedWith, null);
      // … and sweeps as usual: the same leftover is removed now.
      await assert.rejects(fs.access(busy));
    } finally {
      await third.shutdown();
      await new Promise((r) => third.server.close(r));
    }
    // The marker goes with the server that wrote it.
    await assert.rejects(fs.access(path.join(dir, "Logs", "server.json")));
  } finally {
    if (first.exitCode === null) first.kill();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("leftover temporary files are swept from the recovery, snapshot and export folders too", async () => {
  const name = ".x.json.12345678-1234-4123-8123-123456789abc.tmp";
  const places = [
    ["Score recovery"],
    ["Score recovery", "some-piece"],
    ["Score recovery", "removed"],
    ["Settings snapshots"],
    ["..", "Exports"],
  ];
  const s = await serve(async (dataDir) => {
    for (const p of places) {
      await fs.mkdir(path.join(dataDir, ...p), { recursive: true });
      await fs.writeFile(path.join(dataDir, ...p, name), "half");
      await fs.writeFile(path.join(dataDir, ...p, "keep.json"), "{}");
    }
  });
  try {
    for (const p of places) {
      assert.deepEqual(
        await fs
          .readdir(path.join(s.dataDir, ...p))
          .then((n) =>
            n.filter((x) => x.endsWith(".tmp") || x === "keep.json"),
          ),
        ["keep.json"],
        p.join("/"),
      );
    }
  } finally {
    await s.close();
  }
});
