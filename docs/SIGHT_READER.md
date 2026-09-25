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

## Reading limits
The numbered layout is a beginner aid, not a replacement for every symbol in a printed edition. Durations are stated in quarter-note beats; no fingering is inferred. Source warnings still describe simplified repeats, pedal, ornaments or tempo changes. PDF recognition needs review. Physical MIDI hardware has not been tested on this Mac.

## Verification
`node scripts/reader-qa.mjs` and `node scripts/native-reader-qa.mjs` exercise the default layout, navigation, octave/tonic labels, wait mode, staff cursor, full-range chords, pointer versus held-key follow, mobile layout, long-score reading, numbered export and actual PDF recognition. `scripts/input-qa.mjs`, `scripts/native-input-qa.mjs` and `scripts/close-qa.mjs` retain audio-input and save/quit regressions. Test data is isolated from the personal Library and Exports folders.
