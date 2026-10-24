// Recovery in the app (2.44). Since 2.41 the server keeps the earlier
// versions of an edited score (Score recovery/<id>/<time>.json) and the
// scores removed from the Library (Score recovery/removed/<id>-<time>.json),
// but the only way back was Import, which gives the piece a new id and
// leaves its practice journal behind. These routes list those copies and put
// one back under its own id, so its practice history reconnects.
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { validatePractice } from "./export.mjs";
import { describeFailure } from "./failures.mjs";

const STAMP = "\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z";
const REMOVED_NAME = new RegExp(`^([a-zA-Z0-9-]{1,80})-(${STAMP})\\.json$`);
const VERSION_NAME = new RegExp(`^(${STAMP})\\.json$`);
// The folder of removed scores sits beside the per-score version folders.
export const REMOVED_FOLDER = "removed";

// "2026-10-07T12-00-00-000Z" (a file-name stamp) → ISO time.
export const stampToISO = (stamp) =>
  stamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
export function parseRemovedName(name) {
  const m = REMOVED_NAME.exec(String(name));
  return m ? { id: m[1], at: stampToISO(m[2]) } : null;
}
export function parseVersionName(name) {
  const m = VERSION_NAME.exec(String(name));
  return m ? { at: stampToISO(m[1]) } : null;
}
// What the lists show of a score: never its notes.
export const scoreSummary = (s) => ({
  title: s.title,
  composer: s.composer || "",
  measures: s.measures,
  notes: s.notes.length,
  bpm: s.bpm,
});
async function readScore(file) {
  return validatePractice(JSON.parse(await fs.readFile(file, "utf8")));
}
// Put `src` at `dest` only if nothing is there, then remove `src`. A hard
// link is exclusive and atomic; a disk without hard links gets an exclusive
// copy instead.
async function moveExclusive(src, dest) {
  try {
    await fs.link(src, dest);
  } catch (e) {
    if (!["EPERM", "ENOTSUP", "EXDEV", "EINVAL", "ENOSYS"].includes(e.code))
      throw e;
    await fs.copyFile(src, dest, constants.COPYFILE_EXCL);
  }
  await fs.unlink(src);
}
const fail = (status, message) => Object.assign(new Error(message), { status });

export function registerRecoveryRoutes(
  app,
  {
    recoveryRoot,
    scorePath,
    validId,
    save,
    invalidate,
    log,
    lockScore = (_id, task) => task(),
  },
) {
  const removedDir = path.join(recoveryRoot, REMOVED_FOLDER);
  const names = (dir) => fs.readdir(dir).catch(() => []);
  const route = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      const failure = describeFailure(e);
      res.status(failure.status).json({ error: failure.error });
    }
  };
  const exists = (file) =>
    fs.access(file).then(
      () => true,
      () => false,
    );
  // What a kept copy is (its id and summary, or that it is damaged), reused
  // while the file is unchanged: a removed Appassionata is 3.4 MB, and the
  // Library asks each time it opens. Bounded to the copies seen last time.
  const summaries = new Map();
  async function summaryOf(file) {
    const stat = await fs.stat(file);
    const key = `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
    const cached = summaries.get(file);
    if (cached?.key === key) return cached.value;
    let value;
    try {
      const s = await readScore(file);
      value = { id: s.id, summary: scoreSummary(s) };
    } catch {
      value = { damaged: true };
    }
    summaries.set(file, { key, value });
    return value;
  }
  const forgetOthers = (keep) => {
    for (const file of summaries.keys())
      if (!keep.has(file)) summaries.delete(file);
  };

  // Removed scores (newest first) and how many earlier versions each score
  // has, for the Library.
  app.get(
    "/api/recovery",
    route(async (_req, res) => {
      const removed = [];
      const seen = new Set();
      // (Newest first by the time in the name: the name begins with the
      // piece's id, so a plain sort would order by id.)
      const byTime = (await names(removedDir))
        .map((name) => ({ name, parsed: parseRemovedName(name) }))
        .filter((x) => x.parsed)
        .sort((a, b) =>
          a.parsed.at < b.parsed.at ? 1 : a.parsed.at > b.parsed.at ? -1 : 0,
        );
      for (const { name, parsed } of byTime) {
        const entry = { file: name, id: parsed.id, removedAt: parsed.at };
        const file = path.join(removedDir, name);
        seen.add(file);
        const kept = await summaryOf(file).catch(() => ({ damaged: true }));
        if (kept.damaged || kept.id !== parsed.id) entry.damaged = true;
        else
          Object.assign(entry, kept.summary, {
            inLibrary: await exists(scorePath(parsed.id)),
          });
        removed.push(entry);
      }
      const versions = {};
      for (const entry of await fs
        .readdir(recoveryRoot, { withFileTypes: true })
        .catch(() => [])) {
        if (
          !entry.isDirectory() ||
          entry.name === REMOVED_FOLDER ||
          !validId(entry.name)
        )
          continue;
        const count = (await names(path.join(recoveryRoot, entry.name))).filter(
          (n) => parseVersionName(n),
        ).length;
        if (count) versions[entry.name] = count;
      }
      // (Removed copies that have gone are forgotten here, versions with
      // their piece's listing, so the map follows the copies on disk.)
      forgetOthers(
        new Set([
          ...seen,
          ...[...summaries.keys()].filter(
            (f) => !f.startsWith(removedDir + path.sep),
          ),
        ]),
      );
      res.json({ removed, versions });
    }),
  );

  // A removed score goes back under its own id, exactly as it was removed.
  app.post(
    "/api/recovery/removed/:file/restore",
    route(async (req, res) => {
      const parsed = parseRemovedName(req.params.file);
      if (!parsed || !validId(parsed.id))
        throw fail(400, "Unknown removed piece.");
      const src = path.join(removedDir, req.params.file);
      let s;
      try {
        s = await readScore(src);
      } catch (e) {
        if (e.code === "ENOENT")
          throw fail(404, "That removed piece is no longer kept.");
        throw fail(
          422,
          "That removed piece is damaged and cannot be restored.",
        );
      }
      if (s.id !== parsed.id)
        throw fail(
          422,
          "That removed piece is damaged and cannot be restored.",
        );
      // (In the piece's own queue: never between a save and a removal.)
      await lockScore(parsed.id, async () => {
        try {
          await moveExclusive(src, scorePath(parsed.id));
        } catch (e) {
          if (e.code === "EEXIST")
            throw fail(409, "This piece is already in your library.");
          if (e.code === "ENOENT")
            throw fail(404, "That removed piece is no longer kept.");
          throw e;
        }
        invalidate(parsed.id);
      });
      log.record("score-restored", { id: parsed.id, from: "removed" });
      res.json({ score: s });
    }),
  );

  // Earlier versions of one score, newest first. A version's time is when
  // it was replaced.
  app.get(
    "/api/scores/:id/versions",
    route(async (req, res) => {
      const { id } = req.params;
      if (!validId(id) || id === REMOVED_FOLDER)
        throw fail(400, "Invalid score ID.");
      const dir = path.join(recoveryRoot, id);
      const versions = [];
      for (const name of (await names(dir)).sort().reverse()) {
        const parsed = parseVersionName(name);
        if (!parsed) continue;
        const entry = { file: name, replacedAt: parsed.at };
        const kept = await summaryOf(path.join(dir, name)).catch(() => ({
          damaged: true,
        }));
        if (kept.damaged || kept.id !== id) entry.damaged = true;
        else Object.assign(entry, kept.summary);
        versions.push(entry);
      }
      // (Versions pruned since are forgotten with the listing.)
      const present = new Set(versions.map((v) => path.join(dir, v.file)));
      for (const file of [...summaries.keys()])
        if (file.startsWith(dir + path.sep) && !present.has(file))
          summaries.delete(file);
      res.json({ versions });
    }),
  );

  // Restoring a version is an ordinary save: the version being replaced is
  // kept in turn, so a restore can itself be undone from the same list.
  app.post(
    "/api/scores/:id/versions/:file/restore",
    route(async (req, res) => {
      const { id, file } = req.params;
      if (!validId(id) || id === REMOVED_FOLDER || !parseVersionName(file))
        throw fail(400, "Unknown version.");
      let s;
      try {
        s = await readScore(path.join(recoveryRoot, id, file));
      } catch (e) {
        if (e.code === "ENOENT")
          throw fail(404, "That version is no longer kept.");
        throw fail(422, "That version is damaged and cannot be restored.");
      }
      if (s.id !== id)
        throw fail(422, "That version is damaged and cannot be restored.");
      await save(s);
      invalidate(id);
      log.record("score-restored", { id, from: "version" });
      res.json({ score: s });
    }),
  );
}
