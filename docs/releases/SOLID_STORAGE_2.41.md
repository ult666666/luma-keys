# Solid storage · 2.41

Luma Keys keeps everything as plain files in `Desktop / Luma Keys / Library`: each score as JSON, the settings file with the practice journal, imported PDFs with their receipts, and accompaniment audio. This update makes those files harder to lose and the app easier to diagnose, without changing what is stored or how practice works.

## Writes that cannot half-land

Every settings write, score save, import receipt, original PDF and export now goes through one routine (`src/atomic-file.mjs`): the bytes are written to a unique temporary name beside the destination, flushed to disk, and only then renamed into place. A reader never sees a partial file, two overlapping saves of the same score never share a temporary file (the last complete write wins), and a failed write, from a full disk or a permissions problem, leaves nothing behind. Temporary files from an earlier crash are swept when the app starts.

## Recovery copies

- **Score versions.** Before a score is overwritten with different content (saving a review, editing notes, marking it reviewed), its current bytes are kept under `Library / Score recovery / <score id> / <time>.json`. The newest five versions stay; an identical save keeps nothing.
- **Removed scores.** Removing a piece from the Library moves its file to `Library / Score recovery / removed / <id>-<time>.json`. The newest ten stay.
- **Settings snapshots.** The settings file holds the practice journal. Before its first write on any day, the healthy file as it stood is kept under `Library / Settings snapshots / preferences-<day>.json`, the newest fourteen days. A damaged settings file still goes to `Settings recovery / preferences-<id>.json.bak` as before.

Every recovery file is ordinary Luma Keys JSON: **Import a score** restores a score version or a removed piece; a settings snapshot can be copied back over `preferences.json` while the app is closed. Recovery folders are not part of the Library listing. A lost recovery copy never blocks the save itself; it is logged instead.

## A library that is read once

The Library listing used to read and validate every score file on every request; with the Appassionata's 3.4 MB that is real work. Parsed scores are now reused while their file is unchanged (size, modification time and inode), so a listing costs one `stat` per file. Saves and removals through the app invalidate the entry at once, and a file edited by hand or damaged is picked up on the next listing; damage is reported per file and heals when the file does.

## Diagnostics

A bounded log beside the library, `Desktop / Luma Keys / Logs / luma-keys.log` (one rotation at 1 MB), records what happened, never what was played, written or said: the server start with its timing, a library that cannot be written, stale temporary files swept, failed requests (method, path and status), recognition starts and finishes (job id, attempt, status, number of saved parts), recovery copies kept or not kept, and faults the page reports (an error's message and location, a rejected promise, the moment the app became usable). Reports from the page are limited to a few event names, flat short values, 2 KB and thirty a minute, so a crash loop cannot fill the file.

The desktop shell logs a page that crashes or stops responding and brings a crashed page back (up to three times in a session, so a crash loop cannot spin), and logs faults in its own process with the same error dialog as before.

`/api/health` now reports the app version, whether the Library folder is writable (checked with a probe file at startup), startup timings (process start to server ready and to the window loaded) and the log path. If the Library cannot be written, the app says so in a notice instead of silently losing changes.

## Startup, measured

The "cold-start delay" recorded since 2.32 was never explained. Two warm launches of the packaged 2.40 app measured 0.5–1.1 s to the window and 1.1–2.2 s to the Play button; the freshly installed Desktop app took about 17 s to bring its server up on its first launch, and the same build launches in a second or two afterwards. The delay is a first-launch effect of a newly installed 6 GB unsigned bundle (macOS inspects it once), not app code. The startup timings in the health report and the `server-ready` and `app-ready` log events let every future run show this directly.

## Verification

`tests/storage.test.mjs` covers atomic writes (whole files, twenty concurrent writers, cleanup on failure, sweeping stale temporaries), the diagnostics log (ordering, truncation, depth, rotation, unwritable locations), health fields and timings, score versions (kept, pruned, identical saves), removed scores (kept, pruned, re-imported), settings snapshots (once a day, before the first change, pruned, damaged files to the recovery copy), the library cache (API and by-hand changes, damage and healing, removal) and the renderer report route (limits, rate limit). Existing server, recognition, backup and packaging tests pass unchanged, with the receipt and original-PDF writes now atomic. `node scripts/native-storage-qa.mjs` checks the exact packaged app on its own data root: the health report's version, writability and startup timings; an edit keeping its earlier version; a removal keeping the removed score; the day's settings snapshot; and the log recording those events plus a fault the page reports, without music. The trouble-spots story (twice) and the chord-reading story pass in the browser on the new server code, and the trouble-spots story passes in the packaged app.

## Limits

An atomic rename is as durable as the file system beneath it; `fsync` asks the disk to flush but a power cut mid-flush is beyond the app. Recovery copies are bounded by count, not size. The diagnostics log is local and never sent anywhere. Startup conclusions rest on this Mac's measurements.
