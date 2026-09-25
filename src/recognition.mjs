import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import { parseMusicXML, unpackXML } from "./music.mjs";
import { validatePractice } from "./export.mjs";

const validId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(id);
const statuses = new Set([
  "processing",
  "done",
  "error",
  "cancelled",
  "interrupted",
]);
const runner = fileURLToPath(
  new URL("../recognition-runner.cjs", import.meta.url),
);
const walk = async (dir) => {
  const list = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) list.push(...(await walk(file)));
    else if (entry.isFile()) list.push(file);
  }
  return list.sort();
};
const failure = (message, status = 400) =>
  Object.assign(Error(message), { status });

export async function createRecognition({
  dataDir,
  engine,
  tessdata,
  save,
  timeoutMs = 600000,
}) {
  const root = path.join(dataDir, "imports");
  const jobs = new Map();
  const issues = [];
  let active = null,
    shuttingDown = false;
  const folder = (id) => path.join(root, id);
  const original = (id) => path.join(root, id + ".pdf");
  const receiptWrites = new Map();
  const persist = (job) => {
    const snapshot = JSON.stringify(job);
    const previous = receiptWrites.get(job.id) || Promise.resolve();
    const write = previous
      .catch(() => {})
      .then(async () => {
        const dest = path.join(folder(job.id), "job.json");
        const tmp = dest + "." + crypto.randomUUID() + ".tmp";
        try {
          await fs.writeFile(tmp, snapshot);
          await fs.rename(tmp, dest);
        } finally {
          await fs.rm(tmp, { force: true });
        }
      });
    receiptWrites.set(job.id, write);
    return write.finally(() => {
      if (receiptWrites.get(job.id) === write) receiptWrites.delete(job.id);
    });
  };
  // Read each receipt independently. Older imports have no receipt and stay intact.
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !validId(entry.name)) continue;
    try {
      const raw = JSON.parse(
        await fs.readFile(path.join(folder(entry.name), "job.json"), "utf8"),
      );
      if (
        raw.id !== entry.name ||
        !statuses.has(raw.status) ||
        typeof raw.name !== "string" ||
        !Number.isFinite(raw.startedAt) ||
        !Number.isInteger(raw.attempt) ||
        raw.attempt < 1 ||
        !Array.isArray(raw.scoreIds) ||
        raw.scoreIds.some((id) => !validId(id)) ||
        (raw.plannedScoreIds !== undefined &&
          (!Array.isArray(raw.plannedScoreIds) ||
            raw.plannedScoreIds.some((id) => !validId(id))))
      )
        throw Error("Invalid import receipt");
      const job = {
        id: raw.id,
        name: raw.name.slice(0, 255),
        status: raw.status,
        startedAt: raw.startedAt,
        updatedAt: Number(raw.updatedAt) || raw.startedAt,
        attempt: raw.attempt,
        scoreIds: raw.scoreIds,
        ...(raw.plannedScoreIds
          ? { plannedScoreIds: raw.plannedScoreIds }
          : {}),
        dismissed: raw.dismissed === true,
        progress: typeof raw.progress === "string" ? raw.progress : "",
        ...(typeof raw.error === "string" ? { error: raw.error } : {}),
      };
      if (job.status === "processing") {
        job.status = "interrupted";
        job.progress = "Import interrupted";
        job.error =
          "The app closed before recognition finished. Your original PDF is kept; retry when you are ready.";
        job.dismissed = false;
        if (job.plannedScoreIds?.length) {
          const recovered = [];
          for (const id of job.plannedScoreIds) {
            try {
              const score = validatePractice(
                JSON.parse(
                  await fs.readFile(path.join(dataDir, id + ".json"), "utf8"),
                ),
              );
              if (score.originalId === job.id) recovered.push(id);
            } catch {
              /* Missing files were not committed before the interruption. */
            }
          }
          if (recovered.length) {
            job.status = "done";
            job.progress = "Ready to review";
            job.scoreIds = recovered;
            if (recovered.length === job.plannedScoreIds.length)
              delete job.error;
            else
              job.error = `The app closed while saving. ${recovered.length} of ${job.plannedScoreIds.length} recognized parts were recovered. Review these parts and import the remaining pages again.`;
            delete job.plannedScoreIds;
          }
        }
        // Persist on the next deliberate action. Startup must tolerate a read-only receipt.
      }
      jobs.set(job.id, job);
    } catch (e) {
      if (e.code !== "ENOENT")
        issues.push({
          file: entry.name + "/job.json",
          reason:
            "Import status could not be read. Your original PDF has not been changed.",
        });
    }
  }
  const publicJob = (job) => ({
    ...job,
    hasOriginal: existsSync(original(job.id)),
  });
  const get = (id) => {
    const job = jobs.get(id);
    if (!job)
      throw failure(
        "Recognition job not found. Check your library for the finished score.",
        404,
      );
    return job;
  };
  function begin(job, buffer) {
    if (shuttingDown)
      throw failure(
        "Luma Keys is closing. Reopen the app to import a score.",
        503,
      );
    if (active)
      throw failure(
        "A score is already being recognized. Let it finish or cancel it first.",
        409,
      );
    if (!existsSync(engine))
      throw failure(
        "The local recognition engine is missing. Reinstall the desktop app, or import MusicXML/MIDI.",
        503,
      );
    // Reserve the only engine slot before the first filesystem await.
    let resolveDone;
    const context = {
      job,
      child: null,
      stop: null,
      finishing: false,
      done: new Promise((r) => {
        resolveDone = r;
      }),
    };
    active = context;
    job.status = "processing";
    job.progress = "Opening your sheet music…";
    job.updatedAt = Date.now();
    job.dismissed = false;
    job.attempt++;
    delete job.error;
    delete job.persistenceError;
    delete job.plannedScoreIds;
    jobs.set(job.id, job);
    const out = path.join(folder(job.id), "attempt-" + job.attempt);
    const finish = async (code, log = [], launchError) => {
      if (context.finishing) return;
      context.finishing = true;
      // A terminal public status promises that Retry/another import can begin.
      // Keep the shared job processing until both its engine ownership and
      // final receipt write are settled; publish this snapshot atomically with
      // releasing the slot below.
      const result = { ...job, scoreIds: [...job.scoreIds] };
      try {
        if (context.stop) {
          result.status = context.stop;
          result.progress =
            context.stop === "interrupted"
              ? "Import interrupted"
              : "Recognition cancelled";
          result.error =
            context.stop === "interrupted"
              ? "The app closed before recognition finished. Your original PDF is kept; retry when you are ready."
              : "Recognition stopped. Your original PDF is kept, so you can retry at any time.";
        } else {
          if (launchError) throw launchError;
          await fs.writeFile(path.join(out, "recognition.log"), log.join(""));
          const files = (await walk(out)).filter((f) => /\.mxl$/i.test(f));
          if (!files.length)
            throw Error(
              "No readable music was found. Try a clean, straight scan (300 dpi), or export MusicXML from your notation app.",
            );
          const scores = [];
          for (const file of files) {
            const score = parseMusicXML(
              unpackXML(await fs.readFile(file)),
              job.name,
            );
            score.source = "PDF";
            score.originalId = job.id;
            score.title =
              job.name.replace(/\.pdf$/i, "") +
              (files.length > 1 ? " · " + (scores.length + 1) : "");
            score.warnings.unshift(
              "Read from a PDF. Compare the recognized notes with your original sheet before practicing.",
            );
            if (
              code !== 0 ||
              /Error visiting|Exception|Could not transcribe/.test(log.join(""))
            )
              score.warnings.push(
                "Some passages could not be fully read. Compare every bar with your original sheet; notes or markings may be missing.",
              );
            scores.push(validatePractice(score));
          }
          job.progress = result.progress = "Saving your practice score…";
          // Journal the intended files first; a restart can recover committed parts
          // without transcribing and duplicating music that is already saved.
          result.plannedScoreIds = scores.map((score) => score.id);
          await persist(result);
          for (const score of scores) {
            await save(score);
            result.scoreIds.push(score.id);
          }
          result.status = "done";
          result.progress = "Ready to review";
          delete result.plannedScoreIds;
        }
      } catch (e) {
        result.status = result.scoreIds.length ? "done" : "error";
        result.progress = result.scoreIds.length
          ? "Saved parts are ready to review"
          : "Recognition needs your help";
        result.error = result.scoreIds.length
          ? "Only some recognized parts could be saved. Review the saved music, then import the remaining pages again. " +
            e.message
          : e.message;
      }
      result.updatedAt = Date.now();
      try {
        await persist(result);
      } catch (e) {
        result.persistenceError =
          "Import status could not be saved. Keep this window open; completed scores are still in your library.";
      } finally {
        Object.assign(job, result);
        if (active === context) active = null;
        resolveDone();
      }
    };
    return (async () => {
      try {
        await fs.mkdir(out, { recursive: true });
        await persist(job);
        if (buffer) {
          const tmp = original(job.id) + ".tmp";
          await fs.writeFile(tmp, buffer, { flag: "wx" });
          await fs.rename(tmp, original(job.id));
        } else if (!existsSync(original(job.id)))
          throw Error(
            "The original PDF is missing. Choose the file again to import it.",
          );
        if (context.stop) {
          await finish();
          return { jobId: job.id };
        }
        const log = [];
        const child = fork(runner, [engine, tessdata, out, original(job.id)], {
          cwd: dataDir,
          execArgv: [],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        context.child = child;
        let launchError,
          engineStarted = false;
        child.on("message", (message) => {
          if (message?.type === "engine-started") engineStarted = true;
        });
        const timer = setTimeout(() => {
          launchError = Error(
            "This score took too long to read. Try importing fewer pages or a clearer scan.",
          );
          child.kill("SIGTERM");
        }, timeoutMs);
        const capture = (chunk) => {
          const text = chunk.toString();
          log.push(text);
          if (log.length > 500) log.shift();
          if (context.stop) return;
          for (const [key, label] of [
            ["LOAD", "Reading pages"],
            ["GRID", "Finding the staves"],
            ["HEADERS", "Reading clefs and key signatures"],
            ["HEADS", "Finding note heads"],
            ["STEMS", "Connecting stems"],
            ["RHYTHMS", "Understanding the rhythm"],
            ["PAGE", "Putting the music together"],
            ["Export", "Preparing your practice score"],
          ])
            if (text.includes(key)) job.progress = label + "…";
        };
        child.stdout.on("data", capture);
        child.stderr.on("data", capture);
        child.on("error", (e) => {
          launchError = Error("Recognition could not start: " + e.message);
          if (!child.pid) {
            clearTimeout(timer);
            void finish(null, log, launchError);
          }
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          context.child = null;
          if (!engineStarted && !launchError && !context.stop)
            launchError = Error(
              "The local recognition engine could not start. Reopen Luma Keys, or reinstall the desktop app.",
            );
          void finish(code, log, launchError);
        });
        return { jobId: job.id };
      } catch (e) {
        await finish(null, [], e);
        throw e;
      }
    })();
  }
  async function stop(reason) {
    const context = active;
    if (!context) return;
    if (!context.finishing && !context.stop) {
      context.stop = reason;
      context.job.progress = "Stopping recognition…";
      context.child?.kill("SIGTERM");
    }
    await context.done;
  }
  return {
    list: () => ({
      jobs: [...jobs.values()]
        .map(publicJob)
        .sort((a, b) => b.updatedAt - a.updatedAt),
      issues,
    }),
    async detail(id) {
      const job = get(id),
        scores = [];
      for (const scoreId of job.scoreIds) {
        try {
          scores.push(
            validatePractice(
              JSON.parse(
                await fs.readFile(
                  path.join(dataDir, scoreId + ".json"),
                  "utf8",
                ),
              ),
            ),
          );
        } catch {
          /* Deleted or damaged scores are handled by the library recovery UI. */
        }
      }
      return { ...publicJob(job), scores };
    },
    start: (name, buffer) =>
      begin(
        {
          id: crypto.randomUUID(),
          name,
          status: "processing",
          startedAt: Date.now(),
          attempt: 0,
          scoreIds: [],
        },
        buffer,
      ),
    retry(id) {
      const job = get(id);
      if (!["interrupted", "cancelled", "error"].includes(job.status))
        throw failure("Only a stopped or failed import can be retried.", 409);
      return begin(job);
    },
    async cancel(id) {
      const job = get(id);
      if (active?.job.id === id) await stop("cancelled");
      return publicJob(job);
    },
    async dismiss(id) {
      const job = get(id);
      if (job.status === "processing")
        throw failure(
          "Wait for recognition or cancel it before dismissing.",
          409,
        );
      const attempt = job.attempt;
      job.dismissed = true;
      try {
        await persist(job);
      } catch (e) {
        if (job.attempt === attempt) job.dismissed = false;
        throw e;
      }
      return publicJob(job);
    },
    async shutdown() {
      shuttingDown = true;
      await stop("interrupted");
    },
  };
}
