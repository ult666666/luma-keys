// A small, bounded diagnostics log beside the library (…/Logs/luma-keys.log):
// one JSON line per event, so a problem the app met last week can still be
// read. It records what happened, never what was played, written or said:
// callers pass short labels, codes, counts and timings only. Writes are
// queued in order, the file rotates once at its size cap, and nothing here
// can throw into the app; failures are counted instead.
import fs from "node:fs/promises";
import path from "node:path";

export const LOG_MAX_BYTES = 1_000_000;
const MAX_STRING = 300;

function clean(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.slice(0, MAX_STRING);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value))
    return depth < 2
      ? value.slice(0, 20).map((v) => clean(v, depth + 1))
      : null;
  if (typeof value === "object" && depth < 2) {
    const out = {};
    for (const [key, v] of Object.entries(value).slice(0, 20))
      out[key.slice(0, 40)] = clean(v, depth + 1);
    return out;
  }
  return null;
}

export function createDiagnosticsLog({
  dir,
  file = "luma-keys.log",
  maxBytes = LOG_MAX_BYTES,
  now = () => new Date(),
} = {}) {
  const target = dir ? path.join(dir, file) : null;
  let queue = Promise.resolve();
  let ready = null;
  let failures = 0;
  let size = null;
  const prepare = async () => {
    await fs.mkdir(dir, { recursive: true });
    try {
      size = (await fs.stat(target)).size;
    } catch {
      size = 0;
    }
  };
  async function append(line) {
    if (!ready) ready = prepare();
    try {
      await ready;
    } catch (e) {
      // (A folder that could not be made is tried again next time, so the
      // log resumes once it can be written — 2.44.)
      ready = null;
      throw e;
    }
    const bytes = Buffer.byteLength(line);
    if (size + bytes > maxBytes && size > 0) {
      // (If the old log cannot be moved aside, it is emptied instead: one
      // failed rotation must not silence every later entry — 2.44.)
      try {
        await fs.rename(target, target + ".1");
      } catch {
        await fs.truncate(target, 0).catch(() => {});
      }
      size = 0;
    }
    await fs.appendFile(target, line, { mode: 0o600 });
    size += bytes;
  }
  return {
    path: target,
    // record("event-name", { code, ms, count }) → never throws, never waits.
    record(event, data = {}) {
      if (!target || typeof event !== "string") return;
      const entry = {
        at: now().toISOString(),
        event: event.slice(0, 60),
        ...(clean(data) || {}),
      };
      const line = JSON.stringify(entry) + "\n";
      queue = queue
        .then(() => append(line))
        .catch(() => {
          failures++;
        });
    },
    flush: () => queue,
    get failures() {
      return failures;
    },
  };
}
