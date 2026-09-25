# Luma Keys — installed and verified

Updated September 24, 2026, 10:44 PM America/New_York.

## Delivered
- Standalone Apple Silicon macOS app: **/Users/prince/Desktop/Luma Keys.app** (about 590 MB; includes Electron, Java/Audiveris, piano samples and PDF rendering resources).
- Complete source, assets, practice sheets and documentation: **/Users/prince/Desktop/Luma Keys/**.
- Default first-run experience: Twinkle, Little Star; 4 built-in lessons; one verified C-major starter PDF score; mint theme with Luma; fresh practice counters.
- Local PDF recognition with progress and review, MusicXML/MXL/MIDI/JSON import, editable notes (add/remove/pitch/rhythm/hand), original PDF page rendering and engraved MusicXML.
- Accurate number/solfege/octave labels, falling notes, sampled grand piano, listen mode, wait-for-note mode, hand selection, speed/count-in/metronome, phrase loops, computer keys and USB MIDI input/sustain.
- Companions (cat/bunny), 3 moods, local progress, printable numbered HTML and JSON export to Desktop/Luma Keys/Exports.
- Claude enhancement pass implemented and independently validated; report: docs/CLAUDE_REVIEW.md.

## Verification actually completed
- **24/24 unit and API regression tests pass.** See evidence/unit-tests-final.txt.
- Production build and Apple Silicon packaging pass. Desktop copy tested with the development server stopped.
- Browser flow coverage passes: playback/pause/seek, 30 samples decoded, correct/wrong note handling, loop wrapping, labels/ranges, saved themes, import/engraving/review/library/search, and 390px responsive layout.
- All 30 samples contain non-silent audio; on-screen keys support pointer and Enter/Space input.
- Actual starter PDF → Audiveris → MusicXML round trip matched all **16 pitches and durations**. Original PDF is visibly rendered as a canvas. A more complex official Schubert example produced 277 notes and exposed recognition warnings.
- Native app test passes: launch, local library, numbered export, audio playback, PDF recognition, original PDF display. See evidence/native-qa.json and native screenshots.
- Simulated MIDI note-on/off and CC64 sustain pass. **No physical MIDI keyboard was connected/tested.**
- npm audit reports **0 vulnerabilities** (evidence/dependency-audit-final.json).
- On laptop-size windows Play and Connect piano are visible without scrolling.

## Overnight follow-up
The heartbeat `luma-keys-overnight-build-polish` is scheduled hourly through **2026-09-25 08:00 Eastern**. A temporary caffeinate process prevents idle sleep until that deadline; keep the Mac plugged in, lid open and Codex running. Do not extend the schedule. See docs/OVERNIGHT.md.

Useful next checks: independent real MusicXML exports, cross-staff notation, time-signature changes in MIDI loop ranges, and large-score responsiveness. Improve only where new evidence justifies a change. Keep the app usable and repackage validated changes with scripts/package-desktop.sh. Preserve all user Library and Exports data. **Never rerun scripts/prepare-starter-library.mjs**; it is guarded as an initial-delivery-only cleanup.

## Known limits
PDF recognition is not perfect; every imported scan requires review. Repeats/navigation play once in written order. Later tempo changes and score pedal/ornament markings are simplified with warnings. MIDI hand assignments and humanized-chord grouping are estimates. Fixed Do remains C=1 by default; imported tonic metadata does not change labels automatically. The app does not listen to acoustic pianos through a microphone or infer fingerings. This is a local personal Mac build, not an App Store release.

## Development state
The development server and the temporary agent-browser test session were stopped after verification. The installed app starts its own loopback server and does not depend on them. Source uses local Git checkpoints. Runtime state lives in Library; build files can be replaced without deleting practice data.
