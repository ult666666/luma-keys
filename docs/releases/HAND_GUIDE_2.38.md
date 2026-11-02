# Hand anatomy and posing · 2.38

The approved image is an anatomy reference, not the geometry displayed in the app. The runtime uses an articulated MRTK mesh with procedural shaping and an inverse-kinematics pose. Earlier work verified key contact but did not reproduce the reference's appearance. In particular, added dorsal volume obscured individual knuckles, and multiple idle-curl adjustments accumulated into a nearly clenched hand. The user's October 4 rejection supersedes the earlier internal visual acceptance.

## Runtime changes

- Reduced the added dorsal mound and separated the metacarpal knuckles. Tendons use surface-plane distance, short unequal relief and restrained shading instead of long parallel ribs. Bind joints, skin weights and playing surfaces are preserved.
- Ordinary melodies use a lower, longer arch. Wider held chords smoothly adopt a supported arch over four to six white-key spacings; thumb crossings also retain that support. Endpoint poses are cached. Geometry is not rebuilt during playback.
- Removed compounded idle curl, lowered the resting lift and opened the free thumb. The thumb keeps its exact target while held. The camera remains unchanged after an oblique-camera comparison hid too much of the curved fingers.
- Preserved more joint relief during bending, softened the matte material, and rebaked filtered skin detail. Fixed a normal-map error where derivative samples omitted a height term present in their base sample. Nail surfaces are excluded from skin grain.
- Contact refinement may use up to 16 iterations only while held error exceeds 0.5 mm. The existing ordinary/difficult contact tolerances, rigid bones and key clearance remain in force.
- Disabled the hidden-thumb surface overlay after actual-stage review exposed a blue wedge through the palm in Appassionata's crossing. Finger numbers, ghost markers and key targets remain available; the overlay is still inspectable in the development lab.

The two skin maps per hand remain 1024 pixels square. Geometry metadata includes a surface revision; the bake version is 7. No additional per-frame texture generation is introduced.

## Verification

The four-file hand, motion, planner and fingering suite passed 141 tests. Another 41 tests cover surface preservation, skin height/derivative consistency, guidance, keyboard stage and seeking. After the final relief/material bake, all 40 hand-renderer/surface/baker checks passed again. New regressions check a relaxed hand beside a melody, supported wide chords, unchanged palmar surfaces and skin-bake derivatives. An older aesthetic assertion demanding at least 60 degrees of idle curl was replaced; functional contact tolerances were not weakened.

The bounded pose benchmark measured 0.266 ms mean and 0.659 ms p95, compared with 0.288/0.663 ms for the prior pose. This excludes rendering and does not establish full-app frame rate. Isolated native verification and actual-stage visual evidence are retained under `.qa-runs/hand-art-2.38/`; installation and native timing results are recorded in the final verification report.

The reference image remains in `docs/design/pianist-study-2.36.png`. Runtime screenshots, rather than generated images, are used to review this implementation. The result is an articulated teaching guide; it is not a pixel-identical reproduction of the reference image.

## Installed result

Installed and visibly reopened Desktop Luma Keys 2.38.0, ASAR `8d24bb385c7e589f21a77bae105ded4e3ca7084a90e5a23c68fe0d8ed6aa4805`. All 657 production inputs, 531 packaged files/helper checks and 3,035 installed bundle entries match the verified candidate. All 107 non-chat musical/settings files remained byte-identical through normal quit, backup, install and reopen. Appassionata remains paused, Resume bar 45, Perform/Both/100%, Ocean/Lang Lang and Falling notes. No personal playback or chat was started.

Nine exact-package native groups passed, including live coda contact, colours, responsive layouts, hand toggling, reduced motion, five-second seeking, pause cleanup and reload. The initial six-second sample produced 265 frames (median 16.7 ms, p95 34.3 ms, max 816.7 ms); the separate warm sample produced 336 frames (median 16.7 ms, p95 33.3 ms, max 66.9 ms). Warm hand update/render CPU measured mean 2.548 ms, p95 3.5 ms. These samples include all observed intervals and do not establish constant 60 fps. Initial stalls remain. First actual-app inspection timed out, then recovered normally; startup delay remains unclaimed.

The first native candidate passed functional checks but was rejected visually because its blue thumb overlay crossed the palm. The installed candidate disables that overlay. Root and independent review found no major distortion in the final melody/rest, crossing, chord and live coda captures; skin and nails remain less natural than the reference. Final evidence: `evidence/hand-guide-2.38-verification.json`. The previous 2.37 app and a fresh non-chat musical backup remain recoverable in the run folder.
