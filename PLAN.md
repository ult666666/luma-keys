# Luma Keys — September 24–25, 2026

## Product
An offline-first macOS sight-reading tool: import a score, read a few clear bars, understand pitch and octave, and practice at a chosen pace on a physical or onscreen keyboard. The main workspace is concise: numbered score, current-note cue, readable keyboard window and transport. Staff notation and falling notes are alternate views; companions, themes, progress and advanced controls live behind Settings. All source, assets, documentation and QA evidence stay on the Desktop.

## Research and decisions
- Audiveris 5.11.0 arm64 macOS distribution includes Java; run its batch transcribe/export workflow locally. https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/ and https://github.com/Audiveris/audiveris/releases/tag/5.11.0
- Optical music recognition is fallible. Always surface review status and permit correction; never invent notes if recognition fails. Original PDF remains available.
- MusicXML controls independent voice cursors with backup/forward, chord onsets and ties. Parse these explicitly. https://www.w3.org/2021/06/musicxml40/
- Web MIDI supplies note-on/off and sustain. Only request input on explicit connect click. No system-exclusive access. https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API
- Local Salamander Grand Piano samples by Alexander Holm via Tone.js; preserve attribution and license. https://github.com/Tonejs/audio and https://github.com/sfzinstruments/SalamanderGrandPiano
- Fixed Do/C=1 is default; number labels describe pitch, not finger choice. Octave is shown explicitly. Optional movable Do allows tonic selection without transposing pitch.

## Build order and acceptance
1. Music core: import MusicXML/MXL/MIDI, correct timing, pitch/numbers, ties/chords, conservative warnings for repeats, saved library. Tests for known score fixtures.
2. Local PDF recognition: install app-local engine, asynchronous jobs with progress, failure states, original PDF and review, real PDF integration test.
3. Practice studio: falling-note visualization aligned exactly to keyboard; accurate audio; play/pause/seek/speed, count-in/metronome, hand selection, phrase loop, wait-for-note mode, keyboard input.
4. Helpful interface: library, lesson sequence, number legend, note review, import states, companion and themes, practice totals and progress, local export.
5. Native packaging: double-clickable Desktop .app with self-contained runtime, no terminal or server setup needed. Check packaged app startup.
6. Verification: core tests, production build, browser interactions/screenshots, actual PDF import, synthesized MIDI input test, sound buffers and scheduling. Physical MIDI hardware testing requires connected hardware; report that honestly.
7. Claude pass after working implementation: focused code review/enhancements with bounded file ownership. Re-test and repackage.
8. Hourly overnight follow-up through 8 AM Eastern Sep 25. Keep Mac awake if user leaves it plugged in; do not claim scheduled tasks run while computer is asleep.

## Limits to communicate
Recognition quality depends on source; complex notation/repeats may need review. No microphone polyphonic transcription promised. No paid services or cloud uploads. Not a claim of universal perfect sight reading.


## Completed interruption follow-up — 1.0.7
Reproduced and repaired lost PDF jobs and orphaned Audiveris after closing. Added durable import receipts, reload discovery, cancel/retry/dismiss, owned-process shutdown on native quit or IPC disconnect, and interrupted-score recovery. Claude reviewed the candidate; the final package was tested for normal quit, window close, force quit, relaunch, retry, settings-save regression and main practice flows. See STATUS.md for measured results and limits. Keep the original overnight deadline; do not extend it.

## Completed piano-input follow-up — 1.0.8
Reproduced ignored computer keys, uncancelled audio startup and delayed notes after blur/disconnect in the previous package. Added input ownership per source/channel, independent sustain pedals, cancellable note/transport startup, computer keys from buttons/sliders and Command-key recovery. Claude's read-only review led to preserving live keys across listen loops and letting wait mode's final note ring until release. Final verification: 63 unit/API tests, 12 input scenarios in browser and native app, 28 native core checks including actual PDF recognition, 3 save/quit scenarios, and sample/rhythm regressions. Installed the matching package and verified all 39 personal files unchanged. Physical MIDI is still untested. Keep the original 8 AM Eastern deadline.

## User-directed sight-reading redesign — 1.1.0
The user clarified that the product should be a concise sight-reading tool. This supersedes the dashboard-led layout: default to a large numbered passage, keep each key readable in a scrolling 88-key viewport, and move pets/progress/advanced settings out of the main workspace. Preserve actual PDF imports, audio, MIDI and all personal files. Include manual note stepping for acoustic-piano practice, optional original staff/falling views and accurate bar/pickup/hand handling. Validate the reading flow in browser and packaged app before installing. This direct user request is separate from the bounded overnight schedule; do not extend that schedule.

Completed 1.1.0: installed/opened the concise sight reader after71 unit/API tests,9 browser/native reading groups,12 browser/native input groups,3 native quit/save scenarios,3 staff-cursor groups and6 notation review groups passed. Personal39 files remain unchanged. See STATUS.md and docs/SIGHT_READER.md. Future work must preserve the user's latest concise reading direction.
