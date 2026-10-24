# Hand guidance follow-through · 2.37

The 2.36 anatomical model, skin treatment and proportions stay in place. This pass refines the information around the moving hands and removes unnecessary solver work.

## Guidance

- Filled finger badges mean the guide is in contact with a key, including exact Wait-mode placements. A number briefly retained after release now uses an outline.
- When collision handling moves a badge more than 1.5 badge radii, a quiet line connects it to its original position along the same key column. Lines use the existing GPU cue batch; no new DOM updates or draw calls are introduced.
- An exactly repeated chord shows each pitch/finger once and “Next: repeat.” Its accessible label still names every note, finger and the new attack. Partial repeats, changed fingering, missing suggestions and different notes retain explicit next-note lists.

## Solver

Finite-difference contact measurements solve only the held fingers whose residuals are used. The final visible hand still solves every digit, with the same iteration limits and deterministic seeking. The bounded comparison before the separate crossing correction matched all 786 poses exactly. Reduced solve counts are deterministic; timing measurements remain subject to system noise and do not establish a constant frame rate.

## Transition correction

Appassionata bar 267 exposed an unreachable artificial overlap: the thumb’s C♯5 ended at beat 532, but the motion planner pinned it for another 40 ms while the ring finger crossed onto F5. A narrow reach guard now declines that extra overlap for an unreachable black-key-thumb crossing. Real written durations, audio and ordinary thumb-under movement stay unchanged. The former 29.315 mm miss is effectively zero at the transition; the nearby sampled maximum is 0.664 mm. All 360 sampled coda motions remain unchanged.

## Validation

- 103 hand tests passed. A final scope review restored the original no-thumb crossover shortcut; eight focused checks then passed on the exact final source, including explicit no-thumb preservation.
- 37 cue, coaching, keyboard and five-second-seek checks passed.
- 657 production input hashes match the build; 531 packaged source/assets and the native helper match. The final ASAR is `abee16cce0d3a9a8aeee238bc2a8525e287cbb6bbe38575713dce0f093986719`.
- The earlier broad overlap guard failed the existing Tornado regression and was rejected. Its log is retained.

All seven exact-package native groups pass: five layouts, four palette choices, reduced motion, hide/show, five-second seeking, repeat guidance, held contacts, live playback, pause cancellation and reload. Independent visual review accepted opening, coda, bar 267, narrow layout and repeat guidance.

The six-second coda sample delivered 333 frames, with frame intervals p50 16.7 ms, p95 33 ms and maximum 66.9 ms. Hand update/render CPU mean was 2.478 ms and p95 4.3 ms. This is one sample, not a guarantee of 60 fps. Eighty-four sampled frames included released badges and passed the contact-style assertion. No badge reached the leader-displacement threshold in these real-score samples; that rare path is covered by helper tests and code review, not visual motion evidence.

The first native run incorrectly expected the repeat cue at beat zero at 60% speed, when the next attack was 1.04 seconds away. The corrected harness checks that it is absent there and present inside the existing one-second window. No production change was needed. Physical piano/audio and companion-model inference were outside this hand-only pass.

Full bounded solver measurements: `.qa-runs/hand-flow-2.37/README.md`. Native evidence: `evidence/hand-guide-2.37-verification.json`.


## Installation

Installed the exact verified 2.37.0 bundle at `/Users/prince/Desktop/Luma Keys.app`. All 3,035 bundle entries match the frozen candidate, and all 107 non-chat musical/personal files remain byte-for-byte unchanged. The previous 2.36.0 app and a fresh musical-data backup remain recoverable in the QA folder. The existing temporary-chat behavior is preserved; no chat transcript was read or copied.

The actual Desktop app reopened and was checked through native accessibility and pixels: paused Appassionata, Falling notes, Ocean/Lang Lang, Perform/Both/100%, Resume bar 31, the accepted 3-D hands and both compact repeat cues. Initial native inspection timed out during startup; a subsequent inspection succeeded without force quitting. Startup delay is not claimed fixed.
