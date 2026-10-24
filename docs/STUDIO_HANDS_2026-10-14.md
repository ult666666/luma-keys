# Piano studio refinement · 14 October 2026

Implemented in `/Users/prince/Desktop/Luma Keys` on MacBook-Pro-2.local, Mac17,9 / Apple M5 Pro, macOS26.6. The installed application and personal Library were not changed. The work uses the existing React19, Vite7, Three.js0.186.1 and Electron44.4.5 stack. A source/diff/hash baseline preserves the978 pre-existing changed or untracked entries; changes from this pass are listed separately in `.qa-runs/studio-2026-10-14/changed-files.json`.

## Hands and contact

The existing locally stored, MIT-licensed MRTK skinned hands remain the foundation. No new third-party mesh, service, inference system or paid asset was introduced. Provenance and license are in `public/models/hands/PROVENANCE.json` and `LICENSE-MRTK.md`.

The bind-space sculpt now articulates the palm and thumb web, narrows the outer palm profile by16.9%, and tapers finger shafts by5.9–7.1%. Joint cross-sections, actual pad vertices, skeleton lengths, bone weights and UVs remain fixed. Both maps were rebaked from the modified surface; skin surface revision5 invalidates stale prepared assets. Regression tests protect the contact anchors, mirrored normals, and triangle orientation in posed hands. This is stylized anatomy, not anatomical or pedagogical validation.

Hand scale continues to derive from the physical keyboard geometry. The DOM keyboard and Three.js orthographic projection use the existing shared key mapping and pad targets, including raised black-key surfaces and distinct thumb contact. The mesh never stretches to reach a score event. The shorter apron clips the wrist cleanly at the instrument boundary; the local and screen-space dark wrist fades are disabled.

The existing worker computes deterministic phrase fingering and motion plans outside the render loop. The musical transport remains authoritative. Playback, pause, seeking, looping and speed changes still use the existing audio/visual clock mapping. No audio scheduling or sound rendering was retimed.

Reproduced logic defects fixed:

- MusicXML finger annotations and valid explicit overrides now reach the planner and survive Luma JSON backup round trips. Optional and mid-note substitution annotations are not misread as mandatory onset assignments. Imported suggestions remain revisable; explicit overrides still win. Staff provenance is retained; complex cross-staff hand inference remains unsupported.
- Oversized chords and conflicting assignments retain every written key. They produce accurate contact guidance and a short reason, without dropped notes or invented arpeggiation. Unknown fingers stay unassigned.
- Impossible held-note transitions use guidance instead of stretching. Hidden fallback hands no longer collide with the visible hand; collision influence enters/exits smoothly rather than snapping.
- Wait poses no longer replay old attacks on a wall clock. Paused hands have a bounded300ms settling phase for inactive fingers, then stop; held targets remain fixed.
- Recorded scale playback exposed a5.48mm miss caused by an added40ms outgoing-thumb overlap. That extra hold is now omitted where the crossover cannot support it; written onset/release times are preserved.

## Practice and supporting pages

One native **Hands** select persists Natural / Focus / Off. Focus uses exact key/contact badges, with `f1`–`f5` distinct from numbered-note notation. Asset or WebGL failure uses the same readable markers. Off preserves normal note guidance. Fingering is presented as a suggestion, not tracking or grading the player's real fingers.

The piece title wraps without shrinking or ellipsis. The header and transport retain the dark-shell/light-workspace language, illustrated covers and blue/amber teaching cues. Companion entry is consolidated in the shell; sparse microphone encouragement uses the existing instruction strip, and minimizing chat returns to the shell entry.

Exercises now show the exact resolved Auto settings passed to Start. Library distinguishes10 saved scores from4 starter pieces in the reviewed fixture, deduplicates identities and labels filtered results explicitly. Progress separates recorded time, visited bars, saved position and assessed performance; generated and removed-score history is preserved. See [supporting-page notes](STUDIO_SUPPORTING_UI_2026-10-14.md).

## Verification

| Check | Result |
| --- | --- |
| Full regression suite | **989/989 pass**, `node --test --test-concurrency=2 tests/*.test.mjs` |
| Build | `npm run build` passes |
| Desktop test build | Isolated Electron44.4.5 / Chromium152 / Node24.21.0 smoke test passes; no page errors |
| Actual Appassionata opening | Score confirms B♭2/G3 and E4/D♭5 at beat0, each1.5beats; natural contacts, Focus badges, and Off checked |
| Viewports | Matched before/after Practice, Exercises, Library and Progress at1280×800,1440×900,1728×1117 |
| DPR / reflow | Natural contacts sampled at DPR1/2;720×450 CSS at DPR2 checks effective200% layout without document overflow |
| Interaction | Hand-mode persistence/reload, native keyboard selection, ±5second seek, live play/pause, Wait holding without input, route changes, menus/Escape/focus, Chinese search, exact exercise preview and final-bar Continue pass |
| Reduced motion / failure | Reduced-motion state verified; blocked model loading and unavailable WebGL retain exact markers and working transport |
| Resource cycles | Three Practice→Library→Practice cycles retain17geometries,9textures,11programs; no growth in that sample |
| Targeted accessibility |24 Practice controls have dark visible focus rings at13.34–15.51:1 against sampled pale surfaces. Hands76×32px, search and Resume minimum height24px. Sampled neutral text contrast≥5.08:1 |

There is no configured TypeScript or standalone lint task. Vite compilation and the repository's actual tests were run; no checks are claimed that the project does not provide. Geometry lint retains guards for visible feasible poses and verifies all keys/times in hidden fallback intervals.

The initial default-concurrency baseline had962/963 passing, with a timing-sensitive companion process-fixture failure. The first integrated run found and fixed two genuine regressions (annotation backup loss and visible collision-boundary snaps), alongside four companion process-fixture timeouts under load. Both companion suites pass85/85 in isolation, and the entire final suite passes at concurrency2 without changing their timeout assertions. Interim logs are retained.

## Recorded movement and performance

Four real GPU-rendered clips cover two-hand scales, held chords and position changes at0.5×/1×. They were recorded and reviewed through consecutive extracted frames, including the corrected crossover. The renderer reports ANGLE Metal / Apple M5 Pro,1156×264 canvas,34px white keys,166px key depth,DPR1.

- RAF interval p95:16.7–16.8ms. Normal recordings reached308frames in5.1s, with a maximum16.8ms interval.
- Draw p95:7.6–11.5ms. Slow recordings contained isolated50–66.6ms gaps, so this is not a claim of zero lag.
- Maximum solved scale contact error:0.547mm; held-chord error:0.022mm. Target drift was effectively zero; residual visible held-pad movement peaked at0.72px during scales.
- The focused crossover test requires≤0.5mm around that event at two sizes and both speeds. The broader recorded scale's0.55mm residual is explicitly retained in the report.

[Detailed playback report](../.qa-runs/studio-2026-10-14/playback-review.md) includes timing, geometry tolerances, per-frame measurements and limitations. Lab recordings contain no audio. Actual app playback was exercised, but audible synchronization, microphone recognition and physical MIDI hardware were not validated in this pass.

The effective200% test uses the corresponding CSS viewport/DPR, not the native browser zoom menu. Sampled accessibility checks are not a complete WCAG conformance audit across every theme, dialog and canvas state. The constrained model still uses key guidance for some difficult passages, and complex fingering substitutions are not supported.

## Preview and evidence

Current isolated development preview: **http://127.0.0.1:5188**.

```sh
cd '/Users/prince/Desktop/Luma Keys'
LUMA_DATA_DIR="$PWD/.qa-runs/studio-2026-10-14/Library" npm run dev
```

The preview writes only to its own Library/Logs. For the isolated built-desktop smoke test, the `native-smoke.mjs` script sets its own `LUMA_QA_ROOT`; it does not launch the installed production app. The Electron dependency runtime was missing initially and was installed locally in this checkout to execute that test.

- [Visual review gallery](../.qa-runs/studio-2026-10-14/review.html)
- [Natural hands,1440px](../.qa-runs/studio-2026-10-14/after/practice-1440.png)
- [Focus mode](../.qa-runs/studio-2026-10-14/after/practice-focus.png)
- [Desktop capture](../.qa-runs/studio-2026-10-14/native/practice-native.png)
- [Slow scale recording](../.qa-runs/studio-2026-10-14/playback-scale-0.5x.mp4)
- [Chords and position changes](../.qa-runs/studio-2026-10-14/playback-chords-position-1x.mp4)
- [Accessibility review](../.qa-runs/studio-2026-10-14/accessibility/review.md)

References consulted: [ForElise](https://pei-xu.github.io/ForElise), [Three.js SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html), [Web Audio output timing](https://www.w3.org/TR/webaudio/#dom-audiocontext-getoutputtimestamp), [reduced motion](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria), [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), and [target sizing](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). These informed the checks, not additional dependencies or licensing claims.
