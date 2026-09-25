# Claude follow-up: PDF lifecycle

September 25, 2026. The user requested a Claude enhancement pass. The installed Claude CLI reviewed the initial 1.0.7 candidate with all tools and MCP connections disabled. It did not edit files or run tests. Raw response: `evidence/claude-pdf-lifecycle-review-1.0.7.json`.

# Review: PDF recognition lifecycle changes

## Findings

**1. Medium: `dismiss` replaces the live job object, so it can clobber a concurrent retry.** `src/recognition.mjs`, `dismiss()`

`dismiss` builds `updated = { ...job, dismissed: true }` and calls `await persist(updated)` before `jobs.set(id, updated)`. Suppose `retry(id)` runs during that await (a second click or tab, or a stale Retry button). Then:
- `begin()` mutates the original `job` to `processing` and bumps `attempt`.
- `jobs.set` then swaps in the stale snapshot, still marked `error`/`interrupted` with the old `attempt`.

Effects:
- The UI stops seeing an active import, even though the engine is still running.
- When `finish` completes, it updates the orphaned object. `/jobs` never shows `done`, so the library refresh and review never fire until the app restarts.
- On disk, the dismiss `rename` can land after the retry's `processing` receipt.

Fix: mutate `job` in place and persist that same object. Alternatively, serialize actions per job id and re-check the status after the await.

**2. Medium: if the child never emits `close`, the job stays stuck and quit hangs.** `src/recognition.mjs` in the `fork(...)` handlers, `recognition-runner.cjs` in `child.on("error")`, and `electron.cjs` in `quitAfterSaving`

`finish()` and `resolveDone()` are only reached through `child.on("close")`. Node documents that `exit`/`close` may not follow an `error` event (for example on spawn resource errors like EAGAIN/EMFILE). The runner has the same dependency on its engine child. If `close` never fires:
- `active` is never cleared, so every later import gets a 409.
- `shutdown()` waits forever, and `quitAfterSaving` awaits it with no bound. The app can only be force-quit.

Fix: call `finish` from the `error` handler too, guarded so it runs once. Also add a bounded `Promise.race` around `shutdownRecognition()` in `quitAfterSaving`, since the runner's disconnect handling covers the kill if Electron exits anyway.

**3. Medium: the packaged fork path is untested and fails in a misleading way.** `src/recognition.mjs` at `fork(runner, …, { env: { …, ELECTRON_RUN_AS_NODE: "1" } })`

In the packaged app, `fork` starts the Electron app binary and runs `recognition-runner.cjs` from inside `app.asar`. The 4 tests run under plain Node, so none of this is exercised.

If the `RunAsNode` fuse is disabled in the build config, the fork starts a second copy of Luma Keys instead of the runner. That copy loses the single-instance lock and exits 0. `finish` then reports "No readable music was found…", which reads as a scan-quality problem rather than a packaging bug.

Fix:
- Confirm `RunAsNode` is enabled (and not flipped by any fuses step) in the electron-builder config.
- Add a packaged smoke test that imports a PDF and checks that the runner PID's command line is the runner.

**4. Medium: the force-quit (IPC disconnect) path has no test.** `tests/recognition.test.mjs`

All four tests stop the runner with SIGTERM, through cancel, shutdown or the timeout. None covers the actual regression: the parent dying without cleanup.

Fix: add a test that forks a small harness which calls `createRecognition().start(...)`, waits for `engine.pid`, SIGKILLs the harness, and asserts the engine PID is gone within about 4s. The SIGTERM-ignoring stub engine already exercises the SIGKILL fallback.

**5. Low: `process.exit` in the runner can drop the end of the engine log.** `recognition-runner.cjs`, `child.on("close", …)`

`process.exit()` runs right after the engine closes. Writes piped to `process.stdout`/`stderr` may still be queued, and pipe writes are asynchronous on macOS. The end of the log is where Audiveris reports `Exception` and `Could not transcribe`, so losing it can:
- suppress the "Some passages could not be fully read" warning, and
- truncate `recognition.log`.

Fix: set `process.exitCode = …` and let the event loop drain.

**6. Low: a crash during `finish` leaves a receipt that retry turns into duplicate scores.** `src/recognition.mjs`, `finish` save loop

Scores are written with `save()`, but `scoreIds` only reaches disk in the final `persist(job)`. A force-quit between those two steps leaves a `processing` receipt with empty `scoreIds`. On restart this becomes `interrupted`, and Retry creates duplicates of scores that are already in the library, unlinked from the import.

Fix: persist after each `save()`, or persist the planned IDs before saving.

A similar gap exists earlier: a crash after the original PDF is written but before the first `persist` leaves an `imports/<id>.pdf` that no receipt points to. Startup skips it silently on ENOENT, so the user cannot see or retry it.

## Summary

The core design holds up:
- The engine slot is reserved synchronously.
- There is no await between the `context.stop` check and `fork`.
- Each retry gets a fresh `attempt-N` directory.
- Receipts are written atomically and loaded tolerantly.
- The runner kills the engine with SIGTERM, then SIGKILL, on disconnect, SIGTERM or EPIPE.

Remaining risks, most important first:
1. The `dismiss`/`retry` race, which corrupts in-memory state.
2. The unbounded dependence on `close`, which can hang quit.
3. The untested packaged `ELECTRON_RUN_AS_NODE` and asar fork path, plus the missing disconnect test. The claimed fix, no orphaned Audiveris after quit or force-quit in the packaged app, is not yet demonstrated by the current tests.

## Primary-agent follow-up

Codex corrected the concurrent dismiss/retry mutation and ordered receipt writes; added a runner startup handshake, idempotent spawn-failure cleanup and a bounded native shutdown wait; allowed final log output to drain; and journaled planned score IDs before saving, so restart can recover existing parts without duplicate transcription. Receipts are written before the original PDF is atomically installed, preventing a new original from being stranded without a receipt. A partial multi-part save reports how many parts were recovered.

Added a deterministic force-kill test against a SIGTERM-ignoring fixture and packaged tests for normal quit, window close, force quit, relaunch and retry. These are Codex changes and validation after this review; Claude did not review the final corrections. Final outcomes are recorded in STATUS.md.
