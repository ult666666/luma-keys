# Isolated Browser QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a maintained isolated build-to-browser sight-reading verification command.

**Architecture:** A controller owns the build process group, Chromium BrowserServer and one Worker thread. The Worker reuses the existing ephemeral API/static server and five sight-reading stories. Evidence persists separately from a disposable library.

**Tech Stack:** Node 24 built-ins, existing Playwright, Vite and Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-25-isolated-browser-qa.md`

## Global Constraints

- No new dependencies or application behavior changes.
- macOS and Linux; Node 24; default work deadline 180 seconds, range 1–600 seconds.
- New explicit output destinations only; inherited library and all unrelated listeners remain untouched.
- No optional engines, starter preparation, external services, browser connection tokens or user data.
- Preserve existing screenshot defaults and macOS CI; merge only reviewed green exact heads.

## Review Focus

- A command/Worker that reports success then stays alive must time out and release sockets (Task 1).
- Process descendants that ignore TERM must be killed in the owned group (Task 1).
- Malformed flags, existing destinations and symlinks must cause no overwrite (Task 2).
- Deadlines during startup/story/shutdown must leave no owned server, browser or library (Tasks 1–2).
- Missing Chromium and external requests must retain useful failure evidence (Task 2).

### Task 1: Owned resource primitives

**Files:** Create `scripts/qa-lifecycle.mjs`, `tests/qa-lifecycle.test.mjs`, `tests/fixtures/qa-worker.mjs`.

**Interfaces:** `runOwnedCommand(command,args,{cwd,signal,onOutput})` resolves on exit 0 or rejects with a useful error; abort terminates its POSIX group. `runWorkerTask(script,workerData,{signal,onMessage,onOutput})` resolves with the posted result only after clean exit; abort terminates the thread.

- [ ] Write real command/Worker tests for success, failure, missing result, result then hang, CPU hang, descendant socket cleanup and unrelated listener survival.
- [ ] Run `node --test tests/qa-lifecycle.test.mjs`; observe missing-module RED.
- [ ] Implement bounded capture and owned cleanup, TERM/KILL escalation and thread termination.
- [ ] Run the focused suite until every lifecycle assertion passes; commit the primitives and tests.

### Task 2: Maintained command and browser story

**Files:** Create `scripts/qa-browser.mjs`, `scripts/qa-browser-worker.mjs`, `tests/qa-browser.test.mjs`; modify `scripts/sight-reading-checks.mjs`, `package.json`, `.github/workflows/test.yml`, `README.md`; create `docs/BROWSER_QA.md`.

**Interfaces:** CLI `--output-dir PATH`, `--timeout-seconds INTEGER`, `--help`; `verifySightReading(page,prefix,{evidenceDir="evidence"}={})` preserves two-argument callers. Worker posts phase/listening messages and a final result with five checks. Controller writes `qa-report.json`, logs and screenshots, and reports cleanup independently from story success.

- [ ] Write argument/destination tests, observe RED before the controller exists.
- [ ] Implement CLI/controller, worker and backwards-compatible screenshot destination. Bound build/startup/work and cleanup; explicitly disable optional engines and external requests.
- [ ] Run focused CLI/lifecycle tests; run the real full command and an actual story deadline failure, inspect receipts and verify cleanup.
- [ ] Add a Linux CI job and operator guide, preserving existing macOS tests.
- [ ] Run formatting, full `npm test`, build and independent whole-branch review; repair justified findings test-first. Commit, attach PR, verify exact-head CI, merge and verify public source.

## Self-review

Both tasks map to every spec requirement; the command has no test-only knobs or duplicated sight-reading assertions. Real socket tests prove ownership, and real browser runs cover the integration. Normal cancellation and finite cleanup are exercised at the shared resource boundaries. Native recognition and optional engines remain explicitly outside scope.
