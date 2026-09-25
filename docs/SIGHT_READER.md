# Sight-reading workspace

The user's correction was the design constraint: read music and locate notes, with fewer things competing for attention. The former greeting, sidebar, pet/progress panels and standalone legend no longer appear in the reading workspace.

## Main flow
- A large, light numbered score shows a few bars from left to right. Right and left hands have aligned rows; selecting a single hand hides the unpracticed row.
- Each pitch retains its physical octave (C4, C5…), quarter-note duration and chord grouping. Silent hand intervals are marked as rests. A held note continuing into another passage shows its remaining duration.
- Previous/next passage, a bar jump and note clicking all seek the same transport. Manual previous/next-note controls let an acoustic-piano player advance without MIDI or microphone input; they do not award fake correct-note counts.
- The onscreen piano keeps a fixed 42-pixel white-key width and scrolls across all 88 keys. A small overview indicates location; octave arrows and explicit offscreen-note buttons make the entire range reachable. Automatic movement avoids sliding keys under an active pointer.
- Original staff notation and falling notes are secondary views. Original notation is identified separately because note corrections affect the numbered score and playback, not the source XML. Staff cursor mapping uses actual measure boundaries, including normalized pickups.
- Label/tonic, count-in, metronome, pets, themes, progress and lesson tips are in Settings. Settings pauses practice. Import, library, connection and transport remain easy to reach.

## Material and motion — 1.1.1
The user asked for richer animation and a less plastic interface. The workspace uses warm graphite, lightly grained ivory paper, serif score typography, restrained sage accents, near-square surfaces and matte piano keys. It keeps the same concise reading hierarchy.

Only a key's inner cap moves; the actual button, pointer capture and 42-pixel geometry stay fixed. Playback event IDs let contiguous repeated notes start fresh resonance strokes without recreating their button. Upcoming notes receive quiet guidance, while real playback or held input produces the short response. The numbered score has a brief ink accent and a finite passage entrance; held continuations stay steady, and the reading cursor follows the transport without added easing delay.

System reduced-motion preferences disable decorative page, key and interface effects, including a preference changed during an animation. Pitch, active-note color, input and navigation remain available. Animations are finite; the reader has no continuous decorative particles or idle motion.

`node scripts/material-qa.mjs` and `node scripts/native-material-qa.mjs` verify seven groups: pointer geometry/release, black-key layering/gutter, passage navigation during motion, keyboard focus/quiet targets, repeated-note identity, live reduced-motion changes and mobile layout. The desktop transport must fit below 800px. A silent demonstration is saved at `evidence/material-motion-preview.webm`.

## Held notes and chords — 1.1.2
In Wait mode, notes already held from an earlier beat have a quiet **hold** annotation. The current accent identifies the new onset to play. Full chord stacks and both hands expand the page naturally; complex passages may need ordinary vertical scrolling to reach the keyboard and controls. Pitch labels retain their size.

Listen mode can start or resume inside a sustained note, including a phrase that begins midway through a tied note. It reattacks the piano sample for the remaining written duration, clipped to the selected phrase, using the existing articulation and release tail. It does not reconstruct the original sound's envelope or infer pedal. A carry-only phrase displays **HOLD**. Wait mode continues to ask only for new written onsets.

A new audio attack advances the key's resonance generation. Ending one of several overlapping voices does not create a false attack. A new playback/loop epoch permits a real restart even when the same written note spans the whole loop. Physical input owners remain independent.

The resume-audio, overlap-motion and chord-reading QA harnesses exercise these behaviors in the browser; `scripts/native-continuity-qa.mjs` runs the same 10 groups in the packaged app. Audio tests observe real sample-source start/stop scheduling with their output muted. The old 1.1.1 package's silent-resume behavior is preserved in `evidence/resume-audio-baseline.json`.

## Reading limits
The numbered layout is a beginner aid, not a replacement for every symbol in a printed edition. Durations are stated in quarter-note beats; no fingering is inferred. Source warnings still describe simplified repeats, pedal, ornaments or tempo changes. PDF recognition needs review. Physical MIDI hardware has not been tested on this Mac.

## Verification
`node scripts/reader-qa.mjs` and `node scripts/native-reader-qa.mjs` exercise the default layout, navigation, octave/tonic labels, wait mode, staff cursor, full-range chords, pointer versus held-key follow, mobile layout, long-score reading, numbered export and actual PDF recognition. `scripts/input-qa.mjs`, `scripts/native-input-qa.mjs` and `scripts/close-qa.mjs` retain audio-input and save/quit regressions. Test data is isolated from the personal Library and Exports folders.

## Focused phrase practice — 1.2.0
**Repeat these bars** selects the actual bars in the visible numbered passage. In dense passages, it repeats the named complete bars, not just the displayed subdivision. A click on a bar number establishes an anchor; Shift-click another bar to select an inclusive range in either direction. The player also retains numeric start/end controls for touch and keyboard users. A muted band and bar-line marks show the active range; the manuscript's repeat label includes a stop control.

Selecting or editing a repeat moves to its first bar. Start over, changing hand/mode and saving reviewed notes retain that phrase context. Previous/Next note wraps only through its new onsets, supporting acoustic-piano practice without awarding fake hits or sessions. A carry-only phrase stays at its start when stepped. Clicking a note, bar, passage or timeline position outside the range stops repeating and explores the whole piece. Within-range seeking retains the phrase. This practice repeat is separate from interpreting printed repeat signs, which remains a known limitation.

Close onsets use a one-millionth-quarter-note tolerance for navigation and Wait matching, instead of a tolerance large enough to skip a 128th note. The position slider preserves the actual fractional beat. Sound scheduling retains its own audio-clock look-ahead; precise navigation does not imply perfect scan recognition or rhythm assessment.

Rests show their quarter-note length directly. Silence is divided at real bar boundaries (including pickups and meter changes) and given readable spacing. Two-line labels fit short silent intervals without confusing adaptive spacing with musical duration.

**Hide keyboard guide** folds its controls into a compact strip. All 88 key nodes remain mounted but hidden, inert, disabled and outside Tab order. Hiding releases only onscreen pointer/button owners; computer and MIDI input remain available. The choice survives Library/Lessons navigation during this app session, while Falling notes temporarily reveals the guide. It is not yet a persisted preference across quitting the app.

New acceptance entry points are `scripts/phrase-practice-qa.mjs` and `scripts/native-phrase-practice-qa.mjs`. Claude could not review this pass because its installed CLI was signed out; see `docs/CLAUDE_PHRASE_REVIEW.md` for the exact recorded limitation.

## Generated exercises and timed reading — 1.3.0
The user asked for a tool that actually improves sight reading and practice efficiency. Sight reading needs unseen music at a chosen difficulty and a way to read at a steady pulse, so this pass adds both.

`src/exercise.mjs` engraves original exercises as MusicXML from a seeded random generator, then parses them with the same importer as any file, so number score, staff view, playback and exports share one model. Twelve levels each add one idea (position, hand, skips, both hands, keys, eighths, hands together, leaps and dotted rhythms, block chords, broken chords, accidentals and 6/8, sixteenths with an independent bass). Rhythm is built from beat cells so bars are always complete and beams stay inside beats; melody is a constrained walk (mostly steps, recoil after leaps, chord tones on strong beats, a budgeted approach so the final note is the tonic); chord progressions are shared by both hands; hands keep separate registers so no unison is merged by the importer. Flat keys are spelled with flats throughout the app.

**Play in time** runs the transport on the audio clock with a count-in and click while the player performs. Input onsets are timed against that clock and graded by `src/performance.mjs`: pitch within four tenths of a beat (≥250 ms) counts, a tenth of a beat (≥100 ms) is on time, closest pairs match first so repeated pitches resolve correctly, wrong pitches are extras, and bars are summarised with the weakest range offered as a phrase loop. Runs are appended to a bounded practice history in the settings file; three clean complete runs at a level (≥90% pitch, ≥60% on time) recommend the next level.

Reading settings (labels, tonic, tonic-follows-key, count-in, metronome, hidden keyboard, view, speed, mode, hand, exercise choices) and the last piece or exact exercise seed are saved and restored. The settings recovery model is unchanged: each new field falls back independently and damaged history entries are dropped with a notice.

Limits: exercises are major-key only, one chord per bar, and follow method-book conventions rather than a particular repertoire. Timing is measured from the moment a key event reaches the app; a MIDI keyboard's own latency is not compensated. Grading needs a MIDI, onscreen or computer key input; the app still does not listen through a microphone. `scripts/sight-reading-qa.mjs` and `scripts/native-sight-reading-qa.mjs` are the acceptance entry points.
