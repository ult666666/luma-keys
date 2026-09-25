# Claude review: music import correctness

Date: 2026-09-24. Scope: `src/music.mjs` (MusicXML/MXL and MIDI import) and `tests/music.test.mjs`. This is step 7 of `PLAN.md`, "Claude pass after working implementation". This report describes the code as it is now. Nothing was changed while writing it.

## Validation status

- An earlier Claude pass made the changes below and added regression tests. It hit its turn limit before writing this report.
- The primary agent then ran `npm test` on its own and reported **24/24 tests passing**. That run covers `tests/music.test.mjs` (23 tests) and `tests/server.test.mjs`. I did not rerun the suite for this report.
- One test uses the fixture `tests/fixtures/pickup-two-parts.musicxml`. The regression section in the test file points to this document.
- All tests use synthetic scores. There are no tests against real exports from MuseScore, Finale, Sibelius or Dorico, and none against Audiveris output from real PDFs. See the limitations section.

## Improvements in the code

### Bar alignment and pickups
- **Shared bar starts across parts.** Each bar has one `measureStarts` entry shared by every part. The bar's length is the largest nominal length and played length across all parts. A miscounted bar in one part therefore cannot shift the other parts. Rounding to 1e-6 beats (`round`) keeps triplets that different parts write with different `<divisions>` in the same chord. The fixture test checks this, including its assertion that group 1 has four notes.
- **Pickup bars.** A bar with `implicit="yes"` lasts only as long as its played notes. A whole-bar rest (`<rest measure="yes"/>`) on another staff does not make the pickup longer. Those rests are tracked separately in `restExtent` and only count when the bar has no other content. If the first bar is shorter than its time signature and `implicit` is missing, it is still treated as a pickup, with a warning. `pickup` is returned as a number of beats.
- **Bars split at a repeat.** A short bar followed by an implicit bar that completes it is treated as one bar. No silence is inserted between the two halves.
- **Short and long bars.** Other short bars are padded with silence so later bars stay aligned. Both short and long bars get a warning that lists the bar numbers.
- **Voices moved before the bar start.** If a `<backup>` would move a voice before the start of the bar, the voice is moved back to beat 0 and a warning names the bar.

### Chords and ties
- **Chord onsets.** A `<chord/>` note starts at the same time as the previous non-chord note in the same voice. This holds after a `<backup>` and after rests. If a chord note has no duration, it takes the previous note's duration.
- **Ties.** Tied notes are joined by part and pitch, only when the notes touch in time (within 0.001 beats). A note on the same staff and voice is preferred.
  - Chains through `continue` or `stop` plus `start` across several bars become one held note.
  - A tie-stop that does not touch the earlier note is not merged.
  - Ties still work when the voice number changes between bars.
  - If the playback `<tie>` element is missing, the visual `<tied>` element is used instead.
- **Unison notes.** Notes of the same pitch starting at the same time are merged into one (`dedupe`), keeping the longer length and the louder velocity. This prevents a note shared by two voices from sounding twice.

### Rhythm fallbacks
- **Missing `<duration>`.** The length is worked out from `<type>`, dots and the `<time-modification>` tuplet ratio, with a warning naming the bar. A note with no usable rhythm is left out, with a warning, rather than guessed.
- **Missing `<divisions>`.** Quarter notes are assumed and a warning is shown. `<divisions>` of zero or less, or a non-number, is a hard error.
- **Unusual time signatures.** Compound time signatures such as `3+2/8` are added up. Senza-misura and other unreadable time signatures fall back to 4/4 with a warning.
- **Tempo.** Tempo comes from `<sound tempo>` or from `<metronome>`, converted to quarter notes per minute, including dotted beat units. Values outside 10–500 BPM are ignored.

### Pitch, transposition and keys
- **Transposing parts.** `<transpose>` is read before `<key>` in each `<attributes>` block. In MusicXML, `<transpose>` comes after `<key>`, so reading them in file order would take the written key as concert pitch. Notes are converted to sounding pitch (chromatic plus octave-change), with a warning.
- **Key signature and tonic.** The reported `keySignature` is converted to concert pitch and written with at most six sharps or flats. The tonic comes from the earliest key signature, preferring the first part.
- **Accidentals.**
  - `<alter>` always decides which key sounds.
  - A printed `<accidental>` is used only when `<alter>` is missing, with a warning.
  - If they disagree, the `<alter>` pitch is played and a warning asks the user to compare with the sheet.
- **Key signature ignored by the exporter.** A warning lists the bars involved. It only fires when no note in the part ever carries the key's sharps or flats, which avoids false alarms on scores that are otherwise correct.
- **Microtones and range.** Microtonal pitches are rounded to the nearest piano key. Pitches outside the 88-key range are left out. Both cases produce a warning.

### Warnings
- Warnings about specific notes collect their bar numbers and end with "See bar …". Long lists are cut off after six bars.
- There are plain-language warnings for:
  - grace notes and cue notes (left out)
  - ornaments, tremolo, fermatas, arpeggios and glissandos (played as written)
  - pedal marks and swing (not applied)
  - chord symbols (shown on the sheet, not added as notes)
  - percussion (left out)
  - repeat-the-bar signs with no written notes
  - repeats and D.C./D.S./Coda/Fine marks (played once, in written order)
  - changes of key, time signature or tempo
  - scores with more than two parts, and parts with different numbers of bars
- Clear errors are raised for: timewise scores, no parts, damaged or empty MXL archives, archives with no score, and files over 30 MB.

### MIDI
- **Humanized chords.** Notes that start within 0.04 beats of a chord's first note are moved to the chord's start. Their end times stay where they were, so the note gets longer, e.g. to 1.025 beats in the test. A warning is shown.
- **Hands.** With two tracks, the higher-sounding track is the right hand. Otherwise the hands are split at middle C. Drum tracks (percussion or channel 10) are removed.
- **Bar numbers.** Bar numbers follow the file's time-signature events, or 4/4 if there are none.
- **Tempo and key.** The opening tempo is used, with a warning if the tempo changes. The key signature sets the "number 1" note. A minor key uses its relative major; the test checks C minor → E♭. The test for this uses hand-built bytes because the `@tonejs/midi` encoder writes key signatures incorrectly.
- **Other cases.**
  - Notes with zero length get 0.125 beats, with a warning.
  - Out-of-range notes are counted in a warning.
  - Unreadable files and files with no timing fail with clear messages.

## Remaining limitations and concerns

1. **Real-world coverage.** The tests are hand-made, minimal scores. Real exports and Audiveris output may use combinations the tests don't cover, such as multiple rests, cross-staff beams or nested tuplets. Recognition errors in PDF imports are not checked for musical sense beyond these warnings.
2. **Repeats and navigation are not expanded.** The score plays once in written order, with a warning. Using the phrase loop is the workaround.
3. **Only the first tempo is used.** Tempo changes, fermatas, swing and pedal are not applied during playback.
4. **Minor keys use the relative-major "1".** This applies to MusicXML (`fifths` is used, not `mode`) and to MIDI. It matches fixed-Do labeling, but a student in A minor will see A labelled "6". The mode is returned in `keySignature` but not used for labels.
5. **MIDI pickups.** MIDI has no concept of a pickup, so an upbeat bar makes all later bar numbers one too high. The 0.04-beat chord window is measured in beats, not milliseconds, so it covers more real time at slow tempos (about 40 ms at 60 BPM). A real fast grace or ornament could be merged into a chord.
6. **Hand assignment is a guess** for single-staff and multi-part scores. The first part that isn't in bass clef becomes the right hand and every other part becomes the left hand. Merged unison notes keep the hand of whichever note was processed first. There are warnings, but the user has to review hands.
7. **Ties only join notes that touch.** If a short bar was padded with silence, a tie across that gap is kept as two notes on purpose. This is safe, but the held note will look shorter than the sheet shows.
8. **Parts with different bar counts.** Bars are aligned by position, not by `number`. A part missing a bar in the middle will be out of line from that point on. There is a warning, but it is not corrected.
9. **Bar labels.** When parts disagree, bar labels (`bar.number`) come from the first part.

No blocking correctness defects were found in this read-through. Items 5–8 are the most likely to confuse a beginner and deserve targeted fixtures in a future pass.

## Integration verification by the primary agent

The scope above covers the parser unit tests. Separate integration tests **did** exercise real PDF recognition with Audiveris: an official Schubert sample produced 277 notes, and a generated 16-note starter PDF round-tripped with all pitches and quarter-note durations matching. The PDF workflow was also tested inside the actual packaged Mac app. Evidence: `evidence/pdf-roundtrip.json`, `evidence/pdf-ui-qa.json`, `evidence/native-qa.json`, and `scripts/pdf-qa.mjs` / `scripts/native-qa.mjs`. This does not establish accuracy for arbitrary scores or notation exports.

The app defaults to **C = 1 regardless of imported key metadata**. The user may choose a different tonic manually. The discussion of relative-major tonic above describes importer metadata, not an automatic change to the app's fixed-Do labels.


## Primary-agent overnight integration follow-up — 1.0.1

This follow-up was implemented and tested by Codex after the Claude pass. MIDI imports now store explicit bar starts and lengths, including meter changes, silent bars, and notes held across bar lines. MusicXML stores the final bar length too. Review, phrase loops, metronome accents on quarter-note boundaries, and numbered exports use the same map. Nearby MIDI onsets on opposite sides of a bar line remain separate. Looped practice and visual hints stay within the selected phrase, and empty selected-hand phrases give guidance. Six additional core regressions plus an end-to-end changing-meter MIDI scenario cover these changes. Earlier MIDI imports must be re-imported to gain the new map; no user scores were silently rewritten.

## Primary-agent overnight rhythm follow-up — 1.0.2

Codex preserved numerator/denominator and explicit pulse groups for imported meters, added audio-clock metronome scheduling and click cancellation, and verified fractional-bar loop accents and pickup count-ins. The UI now labels quarter-note tempo with `♩ =` and shows the current pulse count. Cross-staff voices retain their pitches/timing and receive a hand-review warning; hand colors remain staff-based. Eight new core tests and a browser audio-timing scenario cover the changes. See docs/RESEARCH.md for the primary notation sources and evidence/rhythm-qa.json for measured scheduling intervals. Existing imported files need re-importing to add pulse metadata; their data is preserved.
