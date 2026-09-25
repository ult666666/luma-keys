# Luma Keys — installed and verified

Updated September 25, 2026, 2:38 AM America/New_York.

## Latest overnight improvement — version 1.0.4
- Installed and verified the new Desktop app. The personal app stayed open; reopen when convenient to load the update.
- Long scores now display in passages of up to 16 bars, with Previous/Next and a **Review from bar** jump shared by the note table and engraved sheet. Review opens at the current practice bar. The displayed bar range stays in a loading state until that actual passage is drawn, preventing a stale score image after a jump.
- Narrow windows scroll the notation sideways instead of compressing notes together. The renderer keeps the complete score context for clefs, keys and ties, and cleans up its resize observer when closed.
- Fixed valid MusicXML without an XML declaration failing to engrave. The preview reads a local XML Document rather than allowing the rendering library to guess whether a string is a URL. Invalid embedded notation shows a clear fallback; notes remain editable and subsequent valid scores still render.
- New MusicXML/PDF imports retain explicit closing rests and rest-only final bars; reviewing/saving no longer trims them. Short final bars are not padded with invented silence. The key-change warning now correctly explains that labels keep the selected tonic. Older saved imports are preserved; re-import them to obtain corrected ending durations.
- **44/44 unit/API tests pass.** Independent Bach/Joplin exports verify sustained voices, ending chord/rests, key-change passages and direct review navigation. A 256-bar / 4,352-note synthetic book reaches middle and final passages. Existing note-editing and Für Elise regressions pass.
- On this Mac's headless browser test, the initial Joplin passage used 2,266 DOM nodes versus 12,636 for the former whole-score view, and about 1,939 pixels of sheet height versus 8,812. This is a bounded rendering improvement, not a claim about every book, scan or machine.
- Packaged 1.0.4 passed native playback, export, actual 16-note PDF recognition/original viewing, lesson practice, long-score navigation, closing-rest playback, and invalid-notation recovery with the dev server stopped. Installed archive matches the tested release; all 39 personal Library/Exports files remain unchanged.
- Evidence: evidence/overnight-unit-tests-1.0.4.txt, evidence/notation-qa.json, evidence/notation-baseline.json, evidence/overnight-native-1.0.4.log, evidence/native-qa.json, evidence/data-preservation-1.0.4.json and native-notation screenshots. Independent fixtures and hashes are in tests/fixtures/README.md. The resolved no-header rendering failure is preserved in evidence/resolved-notation-header-failure.*.
- Development watching now excludes QA data, personal Library/Exports and build/evidence folders, so writing an exported HTML sheet does not reload a running UI test.

## Previous overnight improvement — version 1.0.3
- Installed and verified the new Desktop app. The personal app process was left open; reopen when convenient to load this version.
- Corrected the built-in Für Elise opening against the public-domain Mutopia/Breitkopf & Härtel score. It now contains 53 notes across both hands, the two-sixteenth pickup, 3/8 meter, correct bass octaves and rests, and a short first ending. The former demo incorrectly flattened the rhythm and placed bass notes in the right-hand melody.
- Added engraved two-staff notation and a three-step practice path. The pickup is app bar 1; bass enters in app bar 3. Corrected MusicXML, printable HTML, and a visually checked two-page numbered PDF are saved in Practice Sheets. This is a short excerpt played once; pedal and expressive interpretation remain simplified.
- Fixed overlapping short falling notes. Fast passages now use a closer preview; blocks retain proportional duration and separation. Repeated E5 notes were checked for overlap in both browser and packaged app. Very small blocks suppress text while the next-note panel and keyboard retain labels.
- **41/41 unit/API tests pass.** Lesson engraving, left-hand wait mode, numbered export, existing loop/keyboard regressions, and a synthetic 50,000-note import/review/seek/playback test pass. In the measured headless Chrome run, large-score import took about 0.67 s and review save about 0.36 s. Frame timing is recorded; this is not a guarantee of smooth full-book engraving or all hardware.
- The packaged app passed audio, export, lesson practice and actual 16-note PDF recognition with the dev server stopped. Installed archive matches the tested release, and all 39 personal Library/Exports files remain byte-for-byte unchanged.
- Evidence: evidence/overnight-unit-tests-1.0.3.txt, evidence/lessons-qa.json, evidence/large-score-qa.json, evidence/overnight-native-1.0.3.log, evidence/data-preservation-1.0.3.json, and native-elise screenshots. Source and interpretation details: docs/RESEARCH.md and docs/sources/fur-elise-mutopia.ly.

## Previous overnight improvement — version 1.0.2
- Installed new Desktop app; personal app remained open. Reopen when convenient to load the update.
- Imported MusicXML and MIDI now preserve written pulse groups: 6/8 and 9/8 dotted beats, 5/8 fractional bar accents, cut time, and explicit additive groups. Metronome/count-in use the audio clock with look-ahead scheduling; Pause, Stop, and loop reset cancel queued click oscillators.
- Pickup count-ins lead into the pickup's place in the bar. A compact meter hint shows pulses per bar. Tempo is labeled `♩ =` to distinguish quarter-note tempo from the audible compound pulse.
- Cross-staff voices preserve pitch/timing and receive a hand-review warning. Hand choice still follows written staves until edited; it is not inferred as certain.
- **38/38 unit/API tests pass.** Browser audio measurements confirm 6/8 clicks every 0.75 seconds at quarter-note tempo 120, correct 5/8 loop accents, and click cancellation. Changing-meter practice, all 30 piano samples, and simulated MIDI/sustain still pass.
- Packaged 1.0.2 passed playback, export, actual 16-note PDF recognition, and original-PDF viewing with the dev server stopped. Installed archive matches tested release; all 39 Library/Exports files remain unchanged.
- Evidence: evidence/overnight-unit-tests-1.0.2.txt, evidence/rhythm-qa.json, evidence/overnight-native-1.0.2.log, evidence/native-qa.json, evidence/data-preservation-1.0.2.json. Research references and interpretation limits are in docs/RESEARCH.md.
- Older imported scores retain their existing timing. Re-import them to gain pulse metadata. Ungrouped odd meters use their written subdivision; a performer's preferred grouping is not inferred.

## Previous overnight improvement — version 1.0.1
- Installed and verified new Desktop app. The existing personal app process was left running; quit and reopen when convenient to load this version.
- MIDI meter changes now produce explicit bar boundaries shared by practice loops, bar labels, review and printable exports. Held notes preserve every bar they span. MusicXML final bars also retain their actual length.
- Wait mode stays inside the selected phrase. Empty selected-hand phrases give useful guidance; falling notes and next-note hints show only the chosen phrase.
- New MIDI notes across a bar line are no longer snapped into the same chord. Quarter-note metronome accents follow the bar map.
- UI and native tests now use isolated libraries. Native tests have a separate Electron instance lock and can coexist with the personal app. Fixed serving original PDFs from libraries inside hidden parent folders, discovered by this isolation check.
- **30/30 unit/API tests pass**, plus the new changing-meter browser flow and review/extended regressions. Latest packaged build passed sampled audio, actual 16-note PDF recognition, and original-PDF rendering with the dev server stopped.
- Confirmed Library and Exports remain byte-for-byte unchanged (39 files); installed app archive matches the tested release. See evidence/overnight-data-preservation.json.
- Evidence: evidence/overnight-unit-tests-1.0.1.txt, evidence/bar-map-qa.json, evidence/native-qa.json, evidence/overnight-package-1.0.1.log. The resolved hidden-folder preview failure is preserved as evidence/overnight-hidden-folder-failure.*.
- Earlier MIDI imports need re-importing to gain the new meter map. Existing user scores were not rewritten.

## Delivered
- Standalone Apple Silicon macOS app: **/Users/prince/Desktop/Luma Keys.app** (about 590 MB; includes Electron, Java/Audiveris, piano samples and PDF rendering resources).
- Complete source, assets, practice sheets and documentation: **/Users/prince/Desktop/Luma Keys/**.
- Default first-run experience: Twinkle, Little Star; 4 built-in lessons; one verified C-major starter PDF score; mint theme with Luma; fresh practice counters.
- Local PDF recognition with progress and review, MusicXML/MXL/MIDI/JSON import, editable notes (add/remove/pitch/rhythm/hand), original PDF page rendering and engraved MusicXML.
- Accurate number/solfege/octave labels, falling notes, sampled grand piano, listen mode, wait-for-note mode, hand selection, speed/count-in/metronome, phrase loops, computer keys and USB MIDI input/sustain.
- Companions (cat/bunny), 3 moods, local progress, printable numbered HTML and JSON export to Desktop/Luma Keys/Exports.
- Claude enhancement pass implemented and independently validated; report: docs/CLAUDE_REVIEW.md.

## Verification actually completed
- **44/44 unit and API regression tests pass.** See evidence/overnight-unit-tests-1.0.4.txt (earlier delivery results are preserved).
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

Useful next checks: malformed backup metadata handling, note-review ergonomics in smaller laptop windows, and dense-passage frame pacing in a visible native window. Independent real MusicXML exports, 256-bar notation navigation, the 50,000-note JSON timeline and the Für Elise opening have been verified; arbitrary scanned full-book recognition remains unproven. Changing-meter MIDI loops, compound/odd-meter clicks, and a constructed cross-staff fixture also pass. Improve only where new evidence justifies a change. Keep the app usable and repackage validated changes with scripts/package-desktop.sh. Preserve all user Library and Exports data. **Never rerun scripts/prepare-starter-library.mjs**; it is guarded as an initial-delivery-only cleanup. `scripts/update-elise-assets.mjs` safely refreshes only the shipped Für Elise files in Practice Sheets.

## Known limits
PDF recognition is not perfect; every imported scan requires review. Repeats/navigation play once in written order. Later tempo changes and score pedal/ornament markings are simplified with warnings. MIDI hand assignments and humanized-chord grouping are estimates. Fixed Do remains C=1 by default; imported tonic metadata does not change labels automatically. The app does not listen to acoustic pianos through a microphone or infer fingerings. This is a local personal Mac build, not an App Store release.

## Development state
The development server and temporary agent-browser test sessions were stopped after verification. Native tests run in project-local .qa-runs directories and clean up their own data; the personal app was not closed. The installed app starts its own loopback server and does not depend on them. Source uses local Git checkpoints. Runtime state lives in Library; build files can be replaced without deleting practice data.
