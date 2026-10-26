import { lstat, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The only places .qa-runs keeps an app copy, newest one each (see AGENTS.md).
const KEPT = ["rollback", "staged"];
// Run folders nest app copies a few levels down at most (build/mac-arm64/…).
const MAX_DEPTH = 6;

async function appBundles(directory, depth = 0) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.name.endsWith(".app")) return [full];
        return depth < MAX_DEPTH ? appBundles(full, depth + 1) : [];
      }),
  );
  return nested.flat();
}

async function diskBytes(target) {
  const info = await lstat(target);
  if (!info.isDirectory()) return info.blocks * 512;
  const sizes = await Promise.all(
    (await readdir(target)).map((name) => diskBytes(path.join(target, name))),
  );
  return sizes.reduce((sum, size) => sum + size, info.blocks * 512);
}

export async function pruneQaRuns({
  dir = path.join(ROOT, ".qa-runs"),
  olderThanHours = 0,
  dryRun = false,
  now = Date.now(),
} = {}) {
  if (!(olderThanHours >= 0)) {
    throw new RangeError("--older-than-hours must be a number, 0 or more");
  }
  const bundles = await Promise.all(
    (await appBundles(dir)).map(async (bundle) => ({
      bundle,
      // ctime, not mtime: ditto and cp -p give a fresh copy the original's mtime.
      changed: (await lstat(bundle)).ctimeMs,
    })),
  );
  bundles.sort((a, b) => b.changed - a.changed);
  const keep = new Set(
    KEPT.map((name) =>
      bundles.find(({ bundle }) =>
        bundle.startsWith(path.join(dir, name) + path.sep),
      ),
    ),
  );
  const removed = [],
    left = [];
  for (const entry of bundles) {
    if (keep.has(entry) || now - entry.changed < olderThanHours * 3600e3) {
      left.push(entry.bundle);
      continue;
    }
    const bytes = await diskBytes(entry.bundle);
    if (!dryRun) await rm(entry.bundle, { recursive: true, force: true });
    removed.push({ bundle: entry.bundle, bytes });
  }
  return { removed, left };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  // Strict parsing: a mistyped --dry-run must fail, not delete.
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      dir: { type: "string" },
      "older-than-hours": { type: "string", default: "0" },
    },
  });
  const dryRun = values["dry-run"];
  const { removed, left } = await pruneQaRuns({
    dir: values.dir && path.resolve(values.dir),
    olderThanHours: Number(values["older-than-hours"]),
    dryRun,
  });
  const gb = (bytes) => `${(bytes / 1e9).toFixed(1)} GB`;
  for (const { bundle, bytes } of removed) {
    console.log(
      `${dryRun ? "would delete" : "deleted"} ${gb(bytes)}  ${path.relative(process.cwd(), bundle)}`,
    );
  }
  const total = removed.reduce((sum, { bytes }) => sum + bytes, 0);
  console.log(
    `qa:prune: ${dryRun ? "would free" : "freed"} ${gb(total)} from ${removed.length} app copies; ${left.length} left in .qa-runs`,
  );
}
