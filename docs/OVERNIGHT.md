# Overnight work

The Codex heartbeat `luma-keys-overnight-build-polish` is attached to this task and scheduled hourly until **2026-09-25 08:00 America/New_York**. It may not run if Codex is closed, the Mac is asleep, or the account is unable to run tasks. Idle sleep is temporarily held with a bounded caffeinate process until that deadline; the display can still sleep. Keep the Mac plugged in and its lid open.

Continue from STATUS.md. Run focused tests after any changes; do not introduce speculative large refactors simply to fill time. Preserve the user's Library and Exports. When a validated change is ready, use scripts/package-desktop.sh. Do not close an actively used practice app to install updates. Notify only meaningful changes, final completion, or an actionable failure. Do not extend the schedule beyond this morning.

Useful checks:
- npm test
- npm run build
- node scripts/browser-qa.mjs (requires npm run dev; imports test data)
- node scripts/extended-qa.mjs
- node scripts/audio-qa.mjs
- node scripts/midi-qa.mjs (simulated MIDI, not physical hardware)
- node scripts/pdf-qa.mjs (real optical recognition)
- node scripts/review-qa.mjs
- npm run pack; node scripts/native-qa.mjs (actual packaged app)

Test scripts currently use the Desktop Library, so any future run must preserve existing user files and remove or archive only its own newly created test imports. All starter source PDFs and MusicXML are in tests/ and Practice Sheets/.
