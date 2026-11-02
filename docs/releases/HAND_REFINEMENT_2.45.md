# Hand refinement 2.45

This revision improves the live articulated hands. It uses the existing pianist reference in `docs/design/pianist-study-2.36.png`; the reference itself is not displayed over the keyboard.

## Changes

- An unoccupied thumb rests farther outward and slightly toward the player, opening the thumb–index web. The offset fades away while aiming, releasing, or passing under another finger. Exact playing contacts retain the existing solver.
- Dorsal knuckle crowns and inter-joint waists give the fingers more definition. The palm-facing skin, bind joints, weights, and contact pads remain unchanged. Camera angle, bone lengths, and playing comfort settings are preserved.
- Nail plates now fit continuous triangle intersections instead of nearby-vertex maxima. Rounded cuticles/corners and constrained two-direction smoothing remove raised cap edges; free edges remain short.
- Softer daylight fill, warmer skin, lighter crease shading, and a shorter forearm fade improve the presentation on the keyboard. Texture maps were rebaked at 1024 square with bake version 8 and geometry surface revision 3.
- Finger-number separation respects the other hand's silhouette after spacing badges. Key columns, held/upcoming meaning, and leader lines remain intact.
- Pose and opacity updates share one shadow-geometry rebuild immediately before drawing. Unchanged redraws reuse it. Warm-up, full-resolution shadows, visibility cleanup, and retry after a failed build are covered.

## Validation

The main eight-file hand suite passes 143 tests; three additional thumb-rest tests pass. These cover contacts, joint limits, motion continuity, crossings, nail fit, unchanged playing pads, mirrored surfaces, texture derivation, and crowded badge layouts. The real WebGL renderer passes ten shadow lifecycle checks at both half and full resolution.

Nine exact-package native groups passed: the real Sunny Day and Appassionata scores, melody/rest/chord/crossing/coda poses, 1440/1280/800/390/short layouts, reduced motion, hand hiding/restoration, four palettes, five-second seeks, repeated-note guidance, live contact accuracy, audio cleanup on Pause, and reload. Screenshots were captured separately from timing.

Initial six-second playback: 336 frames, median 16.7 ms, p95 17.6 ms, maximum 182.4 ms (two intervals above 50 ms). Warm six-second playback: 360 frames, median 16.7 ms, p95 17.6 ms, maximum 33.3 ms (none above 50 ms). Warm hand update/render CPU: mean 2.0 ms, p95 3.1 ms. These measurements are specific to this run; they do not prove universal responsiveness or remove the initial stalls.

Independent review of 12 native frames found no new desktop visual blocker. A contact marker remains clipped at the horizontal edge in the narrow 390px view; this is an existing compact-layout limitation. Installation evidence is recorded in `evidence/hand-refinement-2.45-verification.json`.

## Visual limits

The resting silhouette and nail fit improve, but the runtime mesh remains less anatomically detailed than the generated reference. This is not a claim of photorealistic parity or constant 60 fps. Native frame intervals are reported without dropping stalls.

## Installation

Installed Desktop Luma Keys 2.45.0 and synchronized the release bundle. All 3,035 bundle entries match the tested candidate; ASAR `32e9b8ebadf27126655753fe0253e52a7a3475ba5921e09f45dba862a480c6cc`. All 110 musical/settings files match the post-quit baseline. Normal shutdown only rolled the daily counters/date and companion last-seen date forward and created the usual settings snapshot; all musical history and practice settings were preserved. The previous 2.44 app and a fresh backup without chat remain in the run folder.

The installed 2.45.0 app was reopened and visually verified: Sunny Day paused, Resume bar 48, Listen, Both hands, 50% speed, Ocean palette, Lang Lang, and Falling notes. The app is left open.
