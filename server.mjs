import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRecognition } from "./src/recognition.mjs";
import { registerBackingRoutes } from "./src/backing-store.mjs";
import { registerCompanionStoreRoutes } from "./src/companion-store.mjs";
import { registerCompanionModelRoutes } from "./src/companion-model.mjs";
import { createCompanionSession } from "./src/companion-session.mjs";
import { buildCompanionPrompt } from "./src/companion-prompt.mjs";
import { parseMusicXML, parseMIDI, unpackXML } from "./src/music.mjs";
import { numberedSheet, validatePractice } from "./src/export.mjs";
import {
  readPreferences,
  validatePreferences,
  mergeUnknownPreferences,
} from "./src/preferences.mjs";
import { writeFileAtomic, removeStaleTemps } from "./src/atomic-file.mjs";
import { describeFailure } from "./src/failures.mjs";
import {
  registerRecoveryRoutes,
  REMOVED_FOLDER,
  parseRemovedName,
} from "./src/recovery.mjs";
import { createDiagnosticsLog } from "./src/diagnostics-log.mjs";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"))
      .version;
  } catch {
    return null;
  }
})();
// What the library keeps for recovery: earlier versions of an edited score,
// scores removed from the Library, and one snapshot of the settings file (the
// practice journal lives there) per day it was written. All are plain JSON a
// reader can import again; the oldest are pruned past these counts.
export const SCORE_VERSIONS = 5;
export const REMOVED_SCORES = 10;
export const SETTINGS_SNAPSHOTS = 14;
const localDay = () => new Date().toLocaleDateString("en-CA");
// File-name times, unique within this process: two saves in the same
// millisecond must not share a version or removed-copy name (2.44).
let lastStamp = 0;
const stamp = () => {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString().replace(/[:.]/g, "-");
};
// The Library folder cannot be created or opened at all (a file in its
// place, a denied permission, a read-only disk). The desktop app explains
// this and offers Try Again instead of failing with a stack trace.
export class LibraryUnavailableError extends Error {
  constructor(dir, cause) {
    super(
      `The Library folder cannot be opened: ${dir} (${cause?.code || cause?.message || "unknown"})`,
    );
    this.name = "LibraryUnavailableError";
    this.dir = dir;
    this.code = cause?.code || "";
  }
}
export async function startServer({
  port = 5189,
  dataDir = process.env.LUMA_DATA_DIR || path.join(ROOT, "Library"),
  // The diagnostics log lives beside the library, never inside it.
  logDir = path.join(path.dirname(path.resolve(dataDir)), "Logs"),
  // When the desktop app started, for the startup timings in /api/health.
  launchedAt = null,
  engine = process.env.LUMA_ENGINE ||
    path.join(ROOT, "engines/Audiveris.app/Contents/MacOS/Audiveris"),
  tessdata = process.env.LUMA_TESSDATA || path.join(ROOT, "engines/tessdata"),
  companionHelper = path.join(ROOT, "engines/companion-model"),
  companionEngineDir = path.join(ROOT, "engines/companion-llm"),
  companionRuntime = path.join(ROOT, "src/companion-local-runtime.mjs"),
} = {}) {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    if (!(await fs.stat(dataDir)).isDirectory())
      throw Object.assign(Error("not a folder"), { code: "ENOTDIR" });
    await fs.readdir(dataDir);
  } catch (e) {
    throw new LibraryUnavailableError(path.resolve(dataDir), e);
  }
  const log = createDiagnosticsLog({ dir: logDir });
  // A library that can be read but not written still opens (read-only,
  // reported below); only importing needs this folder.
  try {
    await fs.mkdir(path.join(dataDir, "imports"), { recursive: true });
  } catch (e) {
    log.record("imports-folder-unavailable", { code: e.code });
  }
  const startup = { marks: {} };
  const markStartup = (label) => {
    if (launchedAt && typeof label === "string")
      startup.marks[label.slice(0, 40)] = Date.now() - launchedAt;
  };
  // Another Luma Keys server already using this Library (a development
  // server beside the app, say) is noted beside the Library, outside it.
  // Two servers would each keep their own settings queue and could undo
  // each other's saves, and one's startup sweep could delete the other's
  // file in the middle of a write: the second one skips its sweeps and the
  // app says so (2.44).
  const marker = path.join(logDir, "server.json");
  // (Alive, and the same process that wrote the marker: a crashed server
  // leaves its marker behind, and its number may since belong to another
  // program, so the process must have started by the time it was written.)
  const sameServer = async (pid, writtenAt) => {
    try {
      process.kill(pid, 0);
    } catch (e) {
      if (e.code !== "EPERM") return false;
    }
    const started = await new Promise((resolve) =>
      execFile("/bin/ps", ["-o", "lstart=", "-p", String(pid)], (err, out) =>
        resolve(err ? NaN : Date.parse(String(out).trim())),
      ),
    );
    const written = Date.parse(writtenAt);
    return (
      Number.isFinite(started) &&
      Number.isFinite(written) &&
      started <= written + 60_000
    );
  };
  let sharedWith = null;
  try {
    const other = JSON.parse(await fs.readFile(marker, "utf8"));
    if (
      Number.isInteger(other.pid) &&
      other.pid !== process.pid &&
      other.dataDir === path.resolve(dataDir) &&
      (await sameServer(other.pid, other.startedAt))
    )
      sharedWith = { pid: other.pid, startedAt: other.startedAt ?? null };
  } catch {
    /* No other server: the usual case. */
  }
  if (sharedWith) log.record("library-shared", { pid: sharedWith.pid });
  else
    await fs
      .mkdir(logDir, { recursive: true })
      .then(() =>
        writeFileAtomic(
          marker,
          JSON.stringify({
            pid: process.pid,
            startedAt: new Date().toISOString(),
            dataDir: path.resolve(dataDir),
          }),
        ),
      )
      .catch(() => {});
  // (The Library itself and the folders beside and inside it that are
  // written the same way: recovery copies, snapshots and exports.)
  const sweepFolders = async () => {
    let count = await removeStaleTemps(dataDir);
    const recovery = path.join(dataDir, "Score recovery");
    const inside = await fs
      .readdir(recovery, { withFileTypes: true })
      .catch(() => []);
    for (const dir of [
      recovery,
      ...inside
        .filter((d) => d.isDirectory())
        .map((d) => path.join(recovery, d.name)),
      path.join(dataDir, "Settings snapshots"),
      path.join(dataDir, "..", "Exports"),
    ])
      count += await removeStaleTemps(dir);
    return count;
  };
  const staleTemps = sharedWith ? 0 : await sweepFolders();
  if (staleTemps) log.record("stale-temps-removed", { count: staleTemps });
  // A library that cannot be written is reported, not discovered at the
  // first lost save.
  let writable = true;
  try {
    const probe = path.join(dataDir, ".write-check");
    await writeFileAtomic(probe, "ok\n");
    await fs.rm(probe, { force: true });
  } catch (e) {
    writable = false;
    log.record("library-not-writable", { code: e.code });
  }
  const app = express();
  let actualPort = port;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.headers.host || "";
    if (!/^127\.0\.0\.1:\d+$/.test(host) && !/^localhost:\d+$/.test(host))
      return res.status(403).json({ error: "Local connections only." });
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        "http://127.0.0.1:" + actualPort,
        "http://localhost:" + actualPort,
        "http://127.0.0.1:5188",
        "http://localhost:5188",
      ].includes(origin)
    )
      return res.status(403).json({ error: "Origin not allowed." });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).end();
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  const companionStore = registerCompanionStoreRoutes(app, { dataDir });
  await companionStore.ready;
  const localModel =
    process.platform === "darwin" &&
    process.arch === "arm64" &&
    existsSync(path.join(companionEngineDir, "Qwen3.5-9B-Q4_K_M.gguf")) &&
    existsSync(companionRuntime);
  const companionModel = registerCompanionModelRoutes(app, {
    helperPath: localModel ? process.execPath : companionHelper,
    ...(localModel
      ? {
          helperArgs: [companionRuntime, "--engine", companionEngineDir],
          helperEnv: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          ownedProcessGroup: true,
          killGraceMs: 1500,
          modelName: "Qwen3.5 9B",
          session: createCompanionSession({
            runtimePath: companionRuntime,
            engineDir: companionEngineDir,
          }),
        }
      : {}),
    buildPrompt: (body) => buildCompanionPrompt(body, { compact: !localModel }),
  });
  app.use(express.json({ limit: "30mb" }));
  await registerBackingRoutes(app, { dataDir, log, sweep: !sharedWith });
  const validId = (id) => /^[a-zA-Z0-9-]{1,80}$/.test(id);
  const scorePath = (id) => path.join(dataDir, id + ".json");
  const recoveryRoot = path.join(dataDir, "Score recovery");
  // Keep the newest `keep` matching files in a folder; remove the rest.
  // (`timeOf` gives a name's time when the name does not sort by it: a
  // removed piece's file begins with its id, so sorting by name kept the
  // wrong ten and deleted a piece just removed — fixed in 2.44.)
  async function pruneFolder(dir, keep, matches, timeOf = (name) => name) {
    let names;
    try {
      names = (await fs.readdir(dir))
        .filter(matches)
        .map((name) => ({ name, at: timeOf(name) }))
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
        .map((x) => x.name);
    } catch {
      return;
    }
    for (const name of names.slice(0, Math.max(0, names.length - keep)))
      await fs.rm(path.join(dir, name), { force: true }).catch(() => {});
  }
  const isJson = (name) => name.endsWith(".json");
  // Before a score is overwritten with different content, its current bytes
  // are kept under Score recovery/<id>/<time>.json (the newest few).
  async function keepPreviousVersion(id, next) {
    // (The removed scores' folder shares this level; no score may use it.)
    if (id === REMOVED_FOLDER) return false;
    let previous;
    try {
      previous = await fs.readFile(scorePath(id));
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
    if (previous.equals(next)) return false;
    const dir = path.join(recoveryRoot, id);
    await fs.mkdir(dir, { recursive: true });
    await writeFileAtomic(path.join(dir, stamp() + ".json"), previous);
    await pruneFolder(dir, SCORE_VERSIONS, isJson);
    return true;
  }
  // Parsed, validated scores by file, reused while the file is unchanged.
  const libraryCache = new Map();
  // One write at a time per score (2.44): saves, removal and restores of the
  // same piece run in the order they arrive. Before, twenty saves arriving
  // together all kept the same "previous" version and the last to finish
  // won, and a save racing a removal left either outcome.
  const scoreQueues = new Map();
  const lockScore = (id, task) => {
    const run = (scoreQueues.get(id) || Promise.resolve()).then(task);
    const tail = run.catch(() => {});
    scoreQueues.set(id, tail);
    tail.then(() => {
      if (scoreQueues.get(id) === tail) scoreQueues.delete(id);
    });
    return run;
  };
  const save = (s) => lockScore(s.id, () => saveNow(s));
  const saveNow = async (s) => {
    const bytes = Buffer.from(JSON.stringify(s));
    // A lost recovery copy must never block saving the music itself.
    const kept = await keepPreviousVersion(s.id, bytes).catch((e) => {
      log.record("score-version-not-kept", { code: e.code });
      return false;
    });
    await writeFileAtomic(scorePath(s.id), bytes);
    libraryCache.delete(s.id + ".json");
    if (kept) log.record("score-version-kept", { id: s.id });
  };
  app.get("/api/health", (_, r) =>
    r.json({
      ok: true,
      version: VERSION,
      omr: existsSync(engine),
      dataDir,
      writable,
      sharedWith,
      startup: launchedAt
        ? { serverReadyMs: startup.serverReadyMs ?? null, ...startup.marks }
        : null,
      log: log.path,
      companionHistory: {
        storage: "temporary",
        cleanup: companionStore.cleanupStatus(),
      },
    }),
  );
  const readLibrary = async () => {
    // (Hidden files are never scores.)
    const files = (await fs.readdir(dataDir)).filter(
      (f) =>
        f.endsWith(".json") && f !== "preferences.json" && !f.startsWith("."),
    );
    const scores = [],
      issues = [];
    const seen = new Set(files);
    for (const file of files) {
      try {
        const full = path.join(dataDir, file);
        const stat = await fs.stat(full);
        const key = `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
        const cached = libraryCache.get(file);
        if (cached?.key === key) {
          scores.push(cached.score);
          continue;
        }
        const s = validatePractice(JSON.parse(await fs.readFile(full, "utf8")));
        if (!validId(s.id) || file !== s.id + ".json")
          throw Error("The saved score ID does not match its filename.");
        libraryCache.set(file, { key, score: s });
        scores.push(s);
      } catch (e) {
        libraryCache.delete(file);
        issues.push({
          file,
          reason:
            e instanceof SyntaxError
              ? "This file is incomplete or is not valid JSON."
              : e.message,
        });
      }
    }
    for (const file of libraryCache.keys())
      if (!seen.has(file)) libraryCache.delete(file);
    scores.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return { scores, issues };
  };
  app.get("/api/scores", async (_, r) => r.json((await readLibrary()).scores));
  app.get("/api/library", async (_, r) => r.json(await readLibrary()));
  app.put("/api/scores/:id", async (req, res) => {
    if (!validId(req.params.id) || req.body?.id !== req.params.id)
      return res.status(400).json({ error: "Invalid score ID." });
    const s = validatePractice(req.body);
    await save(s);
    res.json({ ok: true, score: s });
  });
  // Removing a score moves it to Score recovery/removed (the newest few are
  // kept), so a wrong click can be undone by importing the file again.
  app.delete("/api/scores/:id", async (req, res) => {
    if (!validId(req.params.id)) return res.sendStatus(400);
    const id = req.params.id;
    const removedDir = path.join(recoveryRoot, "removed");
    // (Whether a recovery copy was kept: the reader is told when not.)
    let kept = false;
    await lockScore(id, async () => {
      // (Nothing on disk to remove: nothing to keep or warn about.)
      try {
        await fs.access(scorePath(id));
      } catch {
        kept = null;
        libraryCache.delete(id + ".json");
        return;
      }
      try {
        await fs.mkdir(removedDir, { recursive: true });
        await fs.rename(
          scorePath(id),
          path.join(removedDir, `${id}-${stamp()}.json`),
        );
        await pruneFolder(
          removedDir,
          REMOVED_SCORES,
          (name) => !!parseRemovedName(name),
          (name) => parseRemovedName(name).at,
        );
        kept = true;
        log.record("score-removed", { id, kept: true });
      } catch (e) {
        if (e.code === "ENOENT") kept = null;
        else {
          // The reader asked for the score to go; a recovery copy is a bonus.
          await fs.rm(scorePath(id), { force: true });
          log.record("score-removed", { id, kept: false, code: e.code });
        }
      }
      libraryCache.delete(id + ".json");
    });
    res.json({ ok: true, kept });
  });
  registerRecoveryRoutes(app, {
    recoveryRoot,
    scorePath,
    validId,
    save,
    lockScore,
    invalidate: (id) => libraryCache.delete(id + ".json"),
    log,
  });
  const preferencesPath = path.join(dataDir, "preferences.json");
  const readSettings = async () => {
    let raw;
    try {
      raw = await fs.readFile(preferencesPath);
    } catch (e) {
      if (e.code === "ENOENT") return readPreferences({});
      throw e;
    }
    try {
      return { ...readPreferences(JSON.parse(raw)), raw };
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      return {
        ...readPreferences(null),
        issues: ["Incomplete settings file"],
        raw,
      };
    }
  };
  app.get("/api/preferences", async (_, res) =>
    res.json((await readSettings()).preferences),
  );
  app.get("/api/settings", async (_, res) => {
    const { preferences, issues } = await readSettings();
    res.json({ preferences, issues });
  });
  // The settings file holds the practice journal. Before the first write of
  // a day, the healthy file as it stood is kept under Settings snapshots/
  // preferences-<day>.json, the newest fortnight of them.
  const snapshotDir = path.join(dataDir, "Settings snapshots");
  const isSnapshot = (name) =>
    /^preferences-\d{4}-\d{2}-\d{2}\.json$/.test(name);
  async function snapshotSettings(raw) {
    const file = path.join(snapshotDir, `preferences-${localDay()}.json`);
    try {
      await fs.access(file);
      return false;
    } catch {
      /* No snapshot yet today. */
    }
    await fs.mkdir(snapshotDir, { recursive: true });
    await writeFileAtomic(file, raw);
    await pruneFolder(snapshotDir, SETTINGS_SNAPSHOTS, isSnapshot);
    return true;
  }
  let preferenceWrites = Promise.resolve();
  app.put("/api/preferences", async (req, res) => {
    const preferences = validatePreferences(req.body);
    // Keep complete writes in order, and preserve damaged bytes before repair.
    const write = preferenceWrites.then(async () => {
      const previous = await readSettings();
      let recoveryFile;
      if (previous.raw !== undefined) {
        if (previous.issues.length) {
          const recoveryDir = path.join(dataDir, "Settings recovery");
          await fs.mkdir(recoveryDir, { recursive: true });
          recoveryFile = path.join(
            recoveryDir,
            "preferences-" + crypto.randomUUID() + ".json.bak",
          );
          await fs.writeFile(recoveryFile, previous.raw, { flag: "wx" });
          log.record("settings-recovered", { issues: previous.issues });
        } else {
          // A lost snapshot must never block saving today's practice.
          const kept = await snapshotSettings(previous.raw).catch((e) => {
            log.record("settings-snapshot-not-kept", { code: e.code });
            return false;
          });
          if (kept) log.record("settings-snapshot-kept", { day: localDay() });
        }
      }
      // Fields a newer version stored, which this one does not read, are
      // carried forward rather than erased (healthy files only; a damaged one
      // was kept whole in Settings recovery above).
      let carried = preferences;
      if (previous.raw !== undefined && !previous.issues.length) {
        try {
          carried = mergeUnknownPreferences(
            JSON.parse(previous.raw),
            preferences,
          );
        } catch {
          carried = preferences;
        }
      }
      await writeFileAtomic(preferencesPath, JSON.stringify(carried));
      return { ok: true, ...(recoveryFile ? { recoveryFile } : {}) };
    });
    preferenceWrites = write.catch(() => {});
    res.json(await write);
  });
  // Settings history (2.44): the daily snapshots, and the copies kept just
  // before a restore, can be put back from Settings. A restore keeps the
  // file it replaces first, so it can be undone from the same list.
  const isBeforeRestore = (name) =>
    /^before-restore-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/.test(
      name,
    );
  const BEFORE_RESTORE_KEPT = 5;
  const snapshotSummary = (raw) => {
    const { preferences: p, issues } = readPreferences(JSON.parse(raw));
    return {
      sessions: p.stats.sessions,
      minutes: Math.round(p.stats.minutes),
      pieces: Object.keys(p.journal.pieces).length,
      days: Object.keys(p.journal.days).length,
      issues: issues.length,
    };
  };
  app.get("/api/settings/snapshots", async (_req, res) => {
    const names = await fs.readdir(snapshotDir).catch(() => []);
    const snapshots = [];
    for (const name of names
      .filter((n) => isSnapshot(n) || isBeforeRestore(n))
      .sort()
      .reverse()) {
      const entry = isSnapshot(name)
        ? { file: name, kind: "day", day: name.slice(12, 22) }
        : {
            file: name,
            kind: "before-restore",
            at: name
              .slice(15, -5)
              .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z"),
          };
      try {
        Object.assign(
          entry,
          snapshotSummary(
            await fs.readFile(path.join(snapshotDir, name), "utf8"),
          ),
        );
      } catch {
        entry.damaged = true;
      }
      snapshots.push(entry);
    }
    // Days first (newest first), then the copies kept before restores.
    snapshots.sort(
      (a, b) =>
        (a.kind === "day" ? 0 : 1) - (b.kind === "day" ? 0 : 1) ||
        b.file.localeCompare(a.file),
    );
    res.json({ snapshots });
  });
  app.post("/api/settings/snapshots/:file/restore", async (req, res) => {
    const { file } = req.params;
    if (!isSnapshot(file) && !isBeforeRestore(file))
      return res.status(400).json({ error: "Unknown settings snapshot." });
    const write = preferenceWrites.then(async () => {
      let raw;
      try {
        raw = await fs.readFile(path.join(snapshotDir, file), "utf8");
        if (snapshotSummary(raw).issues) throw Error("issues");
      } catch (e) {
        throw Object.assign(
          new Error(
            e.code === "ENOENT"
              ? "That snapshot is no longer kept."
              : "That snapshot is damaged and cannot be restored.",
          ),
          { status: e.code === "ENOENT" ? 404 : 422 },
        );
      }
      // Keep what is being replaced, whatever its state.
      const current = await fs.readFile(preferencesPath).catch((e) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
      if (current) {
        await fs.mkdir(snapshotDir, { recursive: true });
        await writeFileAtomic(
          path.join(snapshotDir, `before-restore-${stamp()}.json`),
          current,
        );
        await pruneFolder(snapshotDir, BEFORE_RESTORE_KEPT, isBeforeRestore);
      }
      await writeFileAtomic(preferencesPath, raw);
      log.record("settings-restored", { from: file.slice(0, 40) });
      return {
        ok: true,
        preferences: readPreferences(JSON.parse(raw)).preferences,
      };
    });
    preferenceWrites = write.catch(() => {});
    try {
      res.json(await write);
    } catch (e) {
      const failure = describeFailure(e);
      res.status(failure.status).json({ error: failure.error });
    }
  });
  app.get("/api/original/:id", async (req, res) => {
    if (!validId(req.params.id)) return res.sendStatus(400);
    res.sendFile(req.params.id + ".pdf", {
      root: path.join(dataDir, "imports"),
    });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024, files: 1 },
    // (Browsers send file names as UTF-8; Multer's default read them as
    // Latin-1, so 月光.pdf became a garbled title — 2.44.)
    defParamCharset: "utf8",
  });
  const recognition = await createRecognition({
    dataDir,
    engine,
    tessdata,
    save,
    diagnostics: log,
    sweep: !sharedWith,
  });
  app.get("/api/jobs", (_, res) => res.json(recognition.list()));
  app.get("/api/jobs/:id", async (req, res) =>
    res.json(await recognition.detail(req.params.id)),
  );
  for (const action of ["cancel", "retry", "dismiss"]) {
    app.post("/api/jobs/:id/" + action, async (req, res) =>
      res.json(await recognition[action](req.params.id)),
    );
  }
  app.post("/api/import", upload.single("score"), async (req, res) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ error: "Choose a PDF, MusicXML, MXL, or MIDI file." });
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext === ".json") {
        const s = validatePractice(
          JSON.parse(req.file.buffer.toString("utf8")),
        );
        s.id = crypto.randomUUID();
        delete s.originalId;
        s.createdAt = new Date().toISOString();
        s.source = "Practice backup";
        await save(s);
        return res.json({ score: s });
      }
      if ([".xml", ".musicxml", ".mxl", ".mid", ".midi"].includes(ext)) {
        const s = validatePractice(
          [".mid", ".midi"].includes(ext)
            ? parseMIDI(req.file.buffer, req.file.originalname)
            : parseMusicXML(unpackXML(req.file.buffer), req.file.originalname),
        );
        await save(s);
        return res.json({ score: s });
      }
      if (
        ext !== ".pdf" ||
        !req.file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
      )
        return res.status(400).json({
          error: "Use a valid PDF, MusicXML (.xml/.mxl), or MIDI file.",
        });
      res.json(await recognition.start(req.file.originalname, req.file.buffer));
    } catch (e) {
      const failure = describeFailure(e);
      if (failure.status >= 500)
        log.record("request-failed", {
          method: "POST",
          path: "/api/import",
          status: failure.status,
          code: e.code,
        });
      res.status(failure.status).json({ error: failure.error });
    }
  });
  app.post("/api/export", async (req, res) => {
    const s = validatePractice(req.body.score);
    const tonic = Number(req.body.tonic) || 0;
    if (!Number.isInteger(tonic) || tonic < 0 || tonic > 11)
      return res.sendStatus(400);
    const dir = path.join(dataDir, "..", "Exports");
    await fs.mkdir(dir, { recursive: true });
    // Keep every character a file name may hold (Chinese titles included);
    // drop only path separators, reserved characters and controls. The score
    // id keeps two pieces with similar titles from overwriting each other.
    const title =
      String(s.title || "Practice")
        .normalize("NFC")
        .replace(/[\/\\:*?"<>|\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^\.+/, "")
        .slice(0, 90)
        .trim() || "Practice";
    const id = String(s.id || "")
      .replace(/[^a-zA-Z0-9-]/g, "")
      .slice(0, 12);
    const base = id ? `${title} (${id})` : title;
    const html = path.join(dir, base + " - numbered practice.html");
    const backup = path.join(dir, base + " - practice.json");
    await writeFileAtomic(html, numberedSheet(s, tonic));
    await writeFileAtomic(backup, JSON.stringify(s, null, 2));
    res.json({ ok: true, folder: dir, html, backup });
  });
  // The renderer may report an event (an error's message and location, or a
  // startup mark) into the same log: a few known event names, flat short
  // values, a small body, and no more than a burst's worth a minute, so a
  // crash loop cannot fill the file.
  const REPORTABLE = new Set([
    "renderer-error",
    "renderer-rejection",
    "app-ready",
    "audio-failed",
    "worker-failed",
  ]);
  const reportWindow = { start: 0, count: 0 };
  app.post(
    "/api/diagnostics",
    express.json({ limit: 2048, strict: true, inflate: false }),
    (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const body = req.body;
      const flat = (v) =>
        v === null || ["string", "number", "boolean"].includes(typeof v);
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        !REPORTABLE.has(body.event) ||
        Object.keys(body).length > 8 ||
        !Object.values(body).every(flat)
      )
        return res.status(400).json({ error: "Not a reportable event." });
      // The app-wide JSON parser runs first, so the size is checked here too.
      if (Buffer.byteLength(JSON.stringify(body)) > 2048)
        return res.status(413).json({ error: "Report too large." });
      const now = Date.now();
      if (now - reportWindow.start > 60_000) {
        reportWindow.start = now;
        reportWindow.count = 0;
      }
      if (++reportWindow.count > 30)
        return res.status(429).json({ error: "Too many reports." });
      const { event, ...data } = body;
      log.record(event, data);
      res.status(202).json({ ok: true });
    },
  );
  app.use(express.static(path.join(ROOT, "dist")));
  app.use((err, req, res, next) => {
    const failure = describeFailure(err);
    console.error(err.message);
    log.record("request-failed", {
      method: req.method,
      path: req.path,
      status: failure.status,
      code: err.code,
    });
    res.status(failure.status).json({ error: failure.error });
  });
  return new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => {
      actualPort = server.address().port;
      console.log("Luma Keys listening on " + actualPort);
      if (launchedAt) startup.serverReadyMs = Date.now() - launchedAt;
      log.record("server-ready", {
        version: VERSION,
        writable,
        serverReadyMs: startup.serverReadyMs ?? null,
      });
      resolve({
        server,
        port: actualPort,
        markStartup,
        log,
        shutdown: async () => {
          // (Writes already under way finish first: a score saved or removed
          // a moment before quitting, and the settings queue — 2.44.)
          await Promise.allSettled([...scoreQueues.values(), preferenceWrites]);
          await Promise.allSettled([
            recognition.shutdown(),
            companionModel.shutdown(),
            companionStore.flush(),
          ]);
          // (The marker goes with the server that wrote it.)
          if (!sharedWith)
            await fs
              .readFile(marker, "utf8")
              .then((raw) =>
                JSON.parse(raw).pid === process.pid ? fs.rm(marker) : null,
              )
              .catch(() => {});
          log.record("server-shutdown");
          await log.flush();
        },
      });
    });
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startServer({
    launchedAt: Date.now() - Math.round(process.uptime() * 1000),
  }).then(({ server, shutdown }) => {
    const close = async () => {
      await shutdown();
      server.close(() => process.exit(0));
    };
    process.once("SIGTERM", close);
    process.once("SIGINT", close);
  });
