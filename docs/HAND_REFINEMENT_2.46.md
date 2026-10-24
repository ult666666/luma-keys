# Hand refinement 2.46

The live hands previously lost the prepared skin map's dry/smooth variation: the material took the maximum of the map and a higher global roughness, then imposed another dorsal floor. The updated shader preserves the map's variation around the chosen skin base. Broad highlights now vary across finger shafts and joints without adding per-frame texture work.

The surface relief follows each finger's own bind direction and width. Shallow dorsal planes distinguish the finger shafts from the rounded joints. These edits preserve skeletons, bone lengths, weights, palm-facing surfaces and playing pads. MCP folds are a little wider; PIP folds are wider but shallower to avoid stamped dark lines. The 1024px maps were rebaked against surface revision 4, bake version 9.

The camera moves from 78° to 76°. A more oblique 74° experiment added two discontinuities in the existing passage fixture; it was rejected. The 76° version retains the existing contact and continuity tolerances with no motion-solver change. The wrist fade begins farther down the forearm, while still ending before the mesh cut and honoring the screen boundary.

The isolated hand lab also had a presentation bug: it scaled the renderer's spare framebuffer rows into the visible image. It now crops the visible viewport before composition, preserving proportions and key alignment. This lab correction is separate from the production rendering changes.

## Validation

All 147 tests in the nine-file hand suite pass. Surface checks cover 42,624 nondegenerate triangles per hand without collapse/inversion, mirrored relief within one micrometre, and unchanged contact pads. Real WebGL shadow lifecycle checks pass at both half and full resolution.

Native-app results and installation evidence are recorded in `evidence/hand-refinement-2.46-verification.json` after validation.

## Remaining limits

This is a measured refinement of the live rig. Its broad palm and playing silhouette still differ from the generated prototype, and the forearm still fades out where the teaching overlay ends. A lower camera alone does not resolve that difference and must not introduce extra movement jumps.

## Native results and installation

Nine native test groups passed with no renderer errors. Five matched before/after poses were independently reviewed; joint definition and wrist edges improved modestly at app size, with readable cues and intact contacts. Warm 2.46 timing: median 16.7 ms, p95 32.4 ms, one interval over 50 ms. A sequential 2.45 baseline produced warm p95 17.6 ms, while its initial pass had 17 intervals over 50 ms versus one in 2.46. These variable measurements do not establish a speedup or constant frame rate. Both raw reports are retained.

The candidate reuses an APFS clone of the verified 2.45 Electron runtime and engines because disk space was constrained during packaging. Its complete ASAR was rebuilt from current sources/dist and the unchanged dependencies: all 537 application entries match current files, all 5,749 dependency files match 2.45, and native startup reports 2.46.0. The ASAR integrity header and app version were updated. All 3,035 bundle entries match the installed and release copies. All 110 personal practice/settings files are preserved; the prior app and a backup without chat remain in the run folder.
