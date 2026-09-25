# Luma Keys — September 24–25, 2026

## Product
An offline-first macOS desktop piano teacher: import a score, understand each note, hear it, and practice slowly on a physical or onscreen keyboard. Calm futuristic observatory styling: midnight ink, mint and lavender light, expressive moon-cat companion, beautiful typography. All source, assets, documentation and QA evidence stay on the Desktop.

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
