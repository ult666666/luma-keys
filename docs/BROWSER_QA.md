# Reproduce the sight-reading browser journey

This command builds the current checkout and runs the existing five sight-reading stories against that build. It is useful for reviewing the practice experience without packaging the desktop app or installing the optional recognition and companion engines.

Use Node 24 or newer on macOS or Linux:

```bash
npm ci --ignore-scripts
npx playwright install chromium --only-shell
npm run qa:browser -- --output-dir .qa-runs/browser-review
```

On a fresh Linux host, use `npx playwright install --with-deps chromium --only-shell` to install browser system dependencies too. The repository's Linux CI job uses these same commands. The existing macOS unit/API job remains separate.

The output destination must be new, including when it is empty. Omit `--output-dir` to create a unique `.qa-runs/browser-*` directory. Paths containing spaces work. `--timeout-seconds 240` changes the default 180-second build/startup/story deadline; integers from 1 through 600 are accepted. Cleanup gets a separate bounded grace period. `--help` lists options without starting a run.

## What the stories verify

- Generate a level-three exercise, change its seed and switch notation views.
- Play a known seeded exercise in time and check note accuracy and timing.
- Deliberately miss/play wrong notes, inspect the result and repeat the same exercise.
- Reload and confirm remembered exercise, practice mode, speed and history.
- Explore all twelve levels, left-hand practice, F-major spelling, progress and the Library's current-piece card.

The performances use the application's audio clock and computer-key input. They do not certify a physical MIDI keyboard, microphone recognition, native Electron packaging, PDF recognition or companion chat. Starter content and generated exercises are public/synthetic; no copyrighted private score preparation is needed.

## Artifacts and outcomes

`qa-report.json` records the outcome, phases, five checks, attempted external request count, owned ephemeral port, screenshots and cleanup status. `build.log` and `worker.log` retain the most recent 128 KiB each. `screenshots/` shows the welcome, score, clean/flawed results, levels, progress and Library. A failed or timed-out run retains its evidence too; elapsed time is a diagnostic, not a performance benchmark.

Exit 0 requires the stories and cleanup to pass. Exit 1 means verification/deadline/cleanup failure; 2 means invalid options/destination or unsupported host/runtime. Interruptions return 130 for SIGINT or 143 for SIGTERM after cleanup. Missing Chromium produces a failed receipt; run the installation command above and choose a new destination to retry. Existing output is never reused.

## Isolation

The command creates its own temporary Library and Logs directory, overriding inherited `LUMA_DATA_DIR`. Optional engine paths explicitly point to nonexistent locations under that temporary root. It never runs `prepare-starter-library.mjs`. The existing server binds `127.0.0.1` on port 0 and serves the built renderer and API on one origin; fixed development ports 5188/5189 and other listeners are untouched. Browser requests outside the owned origin are blocked and fail verification. This QA workflow also rejects all HTTP redirects and WebSockets, including same-origin ones: the practice stories need direct local responses only. The receipt records these blocks even when the story fails.

A controller owns the Vite build process group, Chromium BrowserServer and a Worker thread running the server/story. Deadlines terminate only those owned resources; the temporary library is removed after the Worker stops. A result is accepted only after normal thread exit, so a story that returns and then hangs cannot pass. Cleanup status distinguishes stopping the Worker, closing Chromium and removing temporary data. Build output in `dist/` is refreshed normally; use a dedicated checkout if another process is also building that directory.

The broader `qa:native` suite remains the packaged-app workflow. This portable command reuses `scripts/sight-reading-checks.mjs` with an explicit screenshot destination; older QA callers retain their default `evidence/` paths.

To rerun the browser policy and actual CLI failure regressions after installing Chromium:

```bash
node --test tests/qa-network.integration.mjs tests/qa-browser.integration.mjs
```

These exercise real redirect/WebSocket blocking, a missing browser, build/story deadlines and SIGINT/SIGTERM. The CLI tests preserve a separate canary library and unrelated HTTP listener, check that the owned socket closes, and retain new failure evidence under `.qa-runs`. CI runs them before the full successful journey.
