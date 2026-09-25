# Overnight work

The Codex heartbeat `luma-keys-overnight-build-polish` is attached to this task and scheduled hourly until **2026-09-25 08:00 America/New_York**. It may not run if Codex is closed, the Mac is asleep, or the account is unable to run tasks. Idle sleep is temporarily held with a bounded caffeinate process until that deadline; the display can still sleep. Keep the Mac plugged in and its lid open.

Continue from STATUS.md. Run focused tests after any changes; do not introduce speculative large refactors simply to fill time. Preserve the user's Library and Exports. When a validated change is ready, use scripts/package-desktop.sh. Do not close an actively used practice app to install updates. Notify only meaningful changes, final completion, or an actionable failure. Do not extend the schedule beyond this morning.

Useful checks:
- npm test
- npm run build
- Start a separate test library: `LUMA_DATA_DIR="$PWD/.qa-runs/ui/Library" npm run dev`
- node scripts/browser-qa.mjs (requires the isolated development server)
- node scripts/rhythm-qa.mjs (6/8, 5/8, audio-clock timing and click cancellation)
- node scripts/bar-map-qa.mjs (changing-meter MIDI, loops, wait mode, exports)
- node scripts/extended-qa.mjs
- node scripts/audio-qa.mjs
- node scripts/midi-qa.mjs (simulated MIDI, not physical hardware)
- node scripts/pdf-qa.mjs (real optical recognition)
- node scripts/review-qa.mjs
- npm run pack; node scripts/native-qa.mjs (actual packaged app)

UI test scripts now refuse to use the personal Desktop Library. Set LUMA_DATA_DIR to an absolute path under this project's `.qa-runs/` folder when starting the development server. Run scripts sequentially because they restore preferences in their shared test library. The native test creates its own unique `.qa-runs/native-*` directory and sets `LUMA_QA_ROOT`, which separates the library, exports, preferences, and Electron instance lock. It can run alongside the user's open app and removes only its own temporary directory afterward. Never run the old capture-preview script against an open personal app; use the isolated native harness. All starter source PDFs and MusicXML are in tests/ and Practice Sheets/.
