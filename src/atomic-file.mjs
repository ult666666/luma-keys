// Durable file writes for the library: every settings file, score and import
// receipt is written to a unique temporary name beside its destination,
// flushed to disk, then renamed into place. A reader never sees a partial
// file, two writers of the same destination never share a temporary file,
// and nothing is left behind when a write fails (disk full, permissions).
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function writeFileAtomic(dest, data, { mode = 0o644 } = {}) {
  const tmp = path.join(
    path.dirname(dest),
    `.${path.basename(dest)}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(tmp, "wx", mode);
    await handle.writeFile(data);
    // Flush the bytes before the name points at them, so a crash right after
    // the rename cannot leave an empty or truncated file behind.
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tmp, dest);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

// Temporary files this module may have left behind if the process died
// between opening one and renaming it. Only our own naming pattern is
// touched, never a user's file.
export const isAtomicTemp = (name) =>
  /^\..+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i.test(
    name,
  );
export async function removeStaleTemps(dir) {
  let removed = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return removed;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !isAtomicTemp(entry.name)) continue;
    try {
      await fs.rm(path.join(dir, entry.name), { force: true });
      removed++;
    } catch {
      /* A file we cannot remove is left for the next start. */
    }
  }
  return removed;
}
