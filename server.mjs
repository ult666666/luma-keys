import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseMusicXML, parseMIDI, unpackXML } from "./src/music.mjs";
import { numberedSheet, validatePractice } from "./src/export.mjs";
import { readPreferences, validatePreferences } from "./src/preferences.mjs";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
export async function startServer({
  port = 5189,
  dataDir = process.env.LUMA_DATA_DIR || path.join(ROOT, "Library"),
  engine = process.env.LUMA_ENGINE ||
    path.join(ROOT, "engines/Audiveris.app/Contents/MacOS/Audiveris"),
  tessdata = process.env.LUMA_TESSDATA || path.join(ROOT, "engines/tessdata"),
} = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(path.join(dataDir, "imports"), { recursive: true });
  const app = express();
  let actualPort = port;
  const jobs = new Map();
  let activeJob = null;
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
  app.use(express.json({ limit: "30mb" }));
  const validId = (id) => /^[a-zA-Z0-9-]{1,80}$/.test(id);
  const scorePath = (id) => path.join(dataDir, id + ".json");
  const save = async (s) => {
    const dest = scorePath(s.id);
    const tmp = dest + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(s));
    await fs.rename(tmp, dest);
  };
  app.get("/api/health", (_, r) =>
    r.json({ ok: true, omr: existsSync(engine), dataDir }),
  );
  const readLibrary = async () => {
    const files = (await fs.readdir(dataDir)).filter(
      (f) => f.endsWith(".json") && f !== "preferences.json",
    );
    const scores = [],
      issues = [];
    for (const file of files) {
      try {
        const s = validatePractice(
          JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8")),
        );
        if (!validId(s.id) || file !== s.id + ".json")
          throw Error("The saved score ID does not match its filename.");
        scores.push(s);
      } catch (e) {
        issues.push({
          file,
          reason:
            e instanceof SyntaxError
              ? "This file is incomplete or is not valid JSON."
              : e.message,
        });
      }
    }
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
  app.delete("/api/scores/:id", async (req, res) => {
    if (!validId(req.params.id)) return res.sendStatus(400);
    await fs.rm(scorePath(req.params.id), { force: true });
    res.json({ ok: true });
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
  let preferenceWrites = Promise.resolve();
  app.put("/api/preferences", async (req, res) => {
    const preferences = validatePreferences(req.body);
    // Keep complete writes in order, and preserve damaged bytes before repair.
    const write = preferenceWrites.then(async () => {
      const previous = await readSettings();
      let recoveryFile;
      if (previous.issues.length && previous.raw !== undefined) {
        const recoveryDir = path.join(dataDir, "Settings recovery");
        await fs.mkdir(recoveryDir, { recursive: true });
        recoveryFile = path.join(
          recoveryDir,
          "preferences-" + crypto.randomUUID() + ".json.bak",
        );
        await fs.writeFile(recoveryFile, previous.raw, { flag: "wx" });
      }
      const tmp = preferencesPath + "." + crypto.randomUUID() + ".tmp";
      try {
        await fs.writeFile(tmp, JSON.stringify(preferences));
        await fs.rename(tmp, preferencesPath);
      } finally {
        await fs.rm(tmp, { force: true });
      }
      return { ok: true, ...(recoveryFile ? { recoveryFile } : {}) };
    });
    preferenceWrites = write.catch(() => {});
    res.json(await write);
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
  });
  const walk = async (dir) => {
    let list = [];
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) list.push(...(await walk(p)));
      else list.push(p);
    }
    return list;
  };
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
      if (!existsSync(engine))
        return res.status(503).json({
          error:
            "The local recognition engine is missing. Reinstall the desktop app, or import a MusicXML/MIDI export.",
        });
      if (activeJob)
        return res.status(409).json({
          error:
            "A score is already being recognized. Please let it finish first.",
        });
      const id = crypto.randomUUID();
      const input = path.join(dataDir, "imports", id + ".pdf");
      const out = path.join(dataDir, "imports", id);
      await fs.writeFile(input, req.file.buffer);
      await fs.mkdir(out, { recursive: true });
      const job = {
        id,
        status: "processing",
        progress: "Opening your sheet music…",
        startedAt: Date.now(),
      };
      jobs.set(id, job);
      activeJob = id;
      res.json({ jobId: id });
      const log = [];
      const child = spawn(
        engine,
        ["-batch", "-transcribe", "-export", "-output", out, "--", input],
        {
          env: { ...process.env, TESSDATA_PREFIX: tessdata },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let terminated = false;
      const timer = setTimeout(
        () => {
          terminated = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (child.exitCode === null) child.kill("SIGKILL");
          }, 3000).unref();
        },
        10 * 60 * 1000,
      );
      const capture = (d) => {
        const text = d.toString();
        log.push(text);
        if (log.length > 500) log.shift();
        const steps = [
          ["LOAD", "Reading pages"],
          ["GRID", "Finding the staves"],
          ["HEADERS", "Reading clefs and key signatures"],
          ["HEADS", "Finding note heads"],
          ["STEMS", "Connecting stems"],
          ["RHYTHMS", "Understanding the rhythm"],
          ["PAGE", "Putting the music together"],
          ["Export", "Preparing your practice score"],
        ];
        for (const [key, label] of steps)
          if (text.includes(key)) job.progress = label + "…";
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      child.on("error", (e) => {
        job.status = "error";
        job.error = "Recognition could not start: " + e.message;
        clearTimeout(timer);
        activeJob = null;
      });
      child.on("close", async (code) => {
        clearTimeout(timer);
        try {
          await fs.writeFile(path.join(out, "recognition.log"), log.join(""));
          if (terminated)
            throw Error(
              "This score took too long to read. Try importing fewer pages or a clearer scan.",
            );
          const files = (await walk(out)).filter((f) => /\.mxl$/i.test(f));
          if (!files.length)
            throw Error(
              "No readable music was found. Try a clean, straight scan (300 dpi), or export MusicXML from your notation app.",
            );
          const scores = [];
          for (const file of files) {
            const s = parseMusicXML(
              unpackXML(await fs.readFile(file)),
              req.file.originalname,
            );
            s.source = "PDF";
            s.originalId = id;
            s.title =
              req.file.originalname.replace(/\.pdf$/i, "") +
              (files.length > 1 ? " · " + (scores.length + 1) : "");
            s.warnings.unshift(
              "Read from a PDF. Compare the recognized notes with your original sheet before practicing.",
            );
            if (
              code !== 0 ||
              /Error visiting|Exception|Could not transcribe/.test(log.join(""))
            )
              s.warnings.push(
                "Some passages could not be fully read. Compare every bar with your original sheet; notes or markings may be missing.",
              );
            const validated = validatePractice(s);
            await save(validated);
            scores.push(validated);
          }
          job.status = "done";
          job.scores = scores;
          job.progress = "Ready to review";
        } catch (e) {
          job.status = "error";
          job.error = e.message;
        } finally {
          activeJob = null;
          setTimeout(() => jobs.delete(id), 3600000).unref();
        }
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/export", async (req, res) => {
    const s = validatePractice(req.body.score);
    const tonic = Number(req.body.tonic) || 0;
    if (!Number.isInteger(tonic) || tonic < 0 || tonic > 11)
      return res.sendStatus(400);
    const dir = path.join(dataDir, "..", "Exports");
    await fs.mkdir(dir, { recursive: true });
    const base =
      String(s.title || "Practice")
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .slice(0, 90) || "Practice";
    const html = path.join(dir, base + " - numbered practice.html");
    const backup = path.join(dir, base + " - practice.json");
    await fs.writeFile(html, numberedSheet(s, tonic));
    await fs.writeFile(backup, JSON.stringify(s, null, 2));
    res.json({ ok: true, folder: dir, html, backup });
  });
  app.get("/api/jobs/:id", (req, res) => {
    const j = jobs.get(req.params.id);
    if (!j)
      return res.status(404).json({
        error:
          "Recognition job not found. Check your library for the finished score.",
      });
    res.json(j);
  });
  app.use(express.static(path.join(ROOT, "dist")));
  app.use((err, req, res, next) => {
    console.error(err.message);
    res.status(400).json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "Please use a file smaller than 30 MB."
          : err.message || "Something went wrong.",
    });
  });
  return new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => {
      actualPort = server.address().port;
      console.log("Luma Keys listening on " + actualPort);
      resolve({ server, port: actualPort });
    });
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startServer();
