import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { validateCompanionHistory } from "./companion-conversation.mjs";

export const MAX_COMPANION_HISTORY_BYTES = 200 * 1024;
const failure = (status, code, message) =>
  Object.assign(new Error(message), { status, code });
const unsafe = () =>
  failure(
    409,
    "HISTORY_UNSAFE_PATH",
    "Old chat history could not be removed because its folder or file is not a regular local path.",
  );
const changed = () =>
  failure(409, "HISTORY_CHANGED", "The old chat folder changed during cleanup. Try again.");
const sameFile = (a, b) => !!a && !!b && a.dev === b.dev && a.ino === b.ino;
const legacyName = (name) => name === "conversation.json" ||
  /^\.conversation-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp$/i.test(name);

/** Delete only the previous chat store and its known atomic-write remnants.
 * Never read, copy, rename or restore transcript contents. Do not recurse into
 * folders or follow symlink folders; scores and preferences are out of scope.
 * io is injectable only for deterministic migration tests, never request data.
 */
export async function removeLegacyCompanionHistory(dataDir, { io = fs } = {}) {
  const parent = path.resolve(dataDir);
  const directory = path.join(parent, "companion");
  async function directoryStat(location) {
    try {
      const stat = await io.lstat(location);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw unsafe();
      return stat;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  const parentStat = await directoryStat(parent);
  if (!parentStat) return { removed: 0 };
  const owned = await directoryStat(directory);
  if (!owned) return { removed: 0 };
  const names = (await io.readdir(directory)).filter(legacyName);
  let removed = 0;
  for (const name of names) {
    if (!sameFile(parentStat, await directoryStat(parent)) ||
        !sameFile(owned, await directoryStat(directory))) throw changed();
    const file = path.join(directory, name);
    let stat;
    try { stat = await io.lstat(file); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    // Unlinking this known file's symlink removes only the link, never its target.
    if (!stat.isFile() && !stat.isSymbolicLink()) throw unsafe();
    if (!sameFile(parentStat, await directoryStat(parent)) ||
        !sameFile(owned, await directoryStat(directory))) throw changed();
    try { await io.unlink(file); removed++; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return { removed };
}

/** Chat now belongs only to the renderer's current session. These legacy API
 * routes never retain a transcript, even in backend RAM. A valid old client PUT
 * is acknowledged then discarded so an older open renderer cannot recreate the
 * disk file. Register before a broader JSON parser to preserve the 200KB limit.
 */
export function registerCompanionStoreRoutes(app, { dataDir, io = fs }) {
  let pending = Promise.resolve();
  let cleanup = { ok: false, code: "HISTORY_CLEANUP_PENDING" };
  const enqueue = (operation) => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  const clean = () => enqueue(async () => {
    try {
      const result = await removeLegacyCompanionHistory(dataDir, { io });
      cleanup = { ok: true, removed: (cleanup.removed || 0) + result.removed };
      return cleanup;
    } catch (error) {
      cleanup = {
        ok: false,
        code: error.status ? error.code : "HISTORY_CLEANUP_FAILED",
        error: error.status ? error.message : "Old chat history could not be removed. Check access to Library/companion and retry.",
      };
      throw failure(error.status || 500, cleanup.code, cleanup.error);
    }
  });
  // Migration starts on app launch, including when the user never opens chat.
  // Failure is observable without preventing unrelated piano practice opening.
  const ready = clean().catch(() => cleanup);
  const empty = () => ({ messages: [], storage: "temporary" });
  const noCache = (res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  };
  const sendError = (res, error) => {
    if (res.destroyed || res.headersSent) return;
    res.status(error.status || 500).json({
      error: error.status ? error.message : "Chat cleanup failed. Try again.",
      code: error.status ? error.code : "HISTORY_CLEANUP_FAILED",
    });
  };
  const clear = async (_req, res) => {
    noCache(res);
    try {
      await clean();
      if (!res.destroyed) res.json(empty());
    } catch (error) { sendError(res, error); }
  };
  app.get("/api/companion/history", clear);
  app.delete("/api/companion/history", clear);
  app.put("/api/companion/history", (req, res) => {
    noCache(res);
    express.json({ limit: MAX_COMPANION_HISTORY_BYTES, strict: true })(req, res, async (parseError) => {
      if (parseError) return sendError(res, failure(
        parseError.status === 413 ? 413 : 400,
        parseError.status === 413 ? "HISTORY_TOO_LARGE" : "HISTORY_INVALID",
        parseError.status === 413 ? "Conversation history must be no larger than 200 KB." : "Send valid conversation JSON.",
      ));
      try {
        const body = req.body;
        if (!body || Array.isArray(body) || typeof body !== "object" ||
            Object.keys(body).length !== 1 || !Object.hasOwn(body, "messages"))
          throw failure(400, "HISTORY_INVALID", "Send a messages array.");
        if (Number(req.headers["content-length"] || 0) > MAX_COMPANION_HISTORY_BYTES ||
            Buffer.byteLength(JSON.stringify(body)) > MAX_COMPANION_HISTORY_BYTES)
          throw failure(413, "HISTORY_TOO_LARGE", "Conversation history must be no larger than 200 KB.");
        try { validateCompanionHistory(body.messages); }
        catch { throw failure(400, "HISTORY_INVALID", "Conversation messages or actions are invalid. Nothing was saved."); }
        await clean();
        if (!res.destroyed) res.json(empty());
      } catch (error) { sendError(res, error); }
    });
  });
  return { ready, flush: () => pending, cleanupStatus: () => ({ ...cleanup }) };
}
