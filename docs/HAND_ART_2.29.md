# Pianist hands · 2.29

The hand reference was generated first, then used to refine the live articulated hands. The full reference is saved in [public/art/hands/pianist-study-2.29.png](../public/art/hands/pianist-study-2.29.png). Its design brief and source location are recorded in `.qa-runs/hand-atelier-2.29/art-reference.json`.

## Appearance and posture

- Light peach skin, softer illumination and less pronounced surface detail replace the brown, heavily shaded finish. Short satin nails stay close to the fingertip rather than projecting as white spikes.
- Resting fingers curve gently and can hover over black keys. Their knuckles no longer pull them into the hooked silhouette seen in the screenshot.
- The palm tapers into a complete wrist, finished with a small ivory knitted cuff. Its seam follows the actual left/right teaching colours. Fine ribs use pixel derivatives to limit shimmer.
- The camera and physical-depth mapping now follow compact keys. Hands are compressed with the keyboard in depth instead of projecting a large palm below a short key bed. The rail gives the wrist enough room without changing when the GPU model loads.
- Mixed black/white octave chords now permit the small wrist turn needed to keep their held thumb and index on the keys. Joint limits and rigid bones remain intact. A coda regression checks the production-prepared mesh at three key sizes.
- If the wrist's usual correction leaves a held contact displaced, a bounded refinement measures how the constrained finger bends as the wrist moves. It retains the best pose and gives held keys priority over anticipation. Four additional coda regression poses keep their playing contacts within 0.5 mm.
- More subdivision smooths the silhouette. The same sculpting, subdivision and colours are passed through worker preparation and the direct renderer; previews and packaged preparation now agree.

## Teaching behaviour

The reference is not a picture pasted over the keys. Both hands still use the existing articulated rig, pose solver, exact contact correction, overlap handling, finger numbers and release/landing transitions. Palm shaping transforms the bind positions and mesh together during preparation; it does not stretch bones during playback. Cuffs attach to the wrist bone and share the renderer's opacity, theme updates, clipping and disposal.

The keyboard continues to show suggested fingering. It cannot observe the user's physical hands, and suggestions are not an authoritative fingering edition. Hands can be hidden with the **Hands** control. The existing 2-D fallback remains available when WebGL fails. Reduce Motion removes anticipation and breathing from resting fingers while keeping placed/playing contacts aligned.

## Verification

The full bounded-concurrency unit/API run passes **777 tests**, including **27 hand renderer/rig tests**. Those checks cover key projection, sub-millimetre contacts in ordinary poses, difficult held notes and thumb crossings, joint limits, rigid bones, deterministic motion, nails, cuff topology, worker/direct preparation, reduced fallback and GPU-context recovery.

The exact packaged app passes six native groups: the screenshot pose, responsive layouts, reduced motion, showing/hiding hands, colour choices, five-second jumps, representative Beethoven passages, live playback and persisted settings. A six-second Appassionata run recorded 362 animation frames, a 17.6 ms frame p95, a 2.4 ms hand-render CPU p95 and a maximum 0.38 mm contact error across 59 sampled held fingers. These are measurements on this Apple M1, not guarantees for every device or passage.

Package results, performance measurements and installation status are linked from `STATUS.md` and `evidence/hand-atelier-2.29-verification.json`. Failed and diagnostic attempts remain separately saved under `.qa-runs/hand-atelier-2.29/`.

The native checks mute the output and do not test physical sound quality, microphones, a connected MIDI piano or concurrent language-model generation. Very narrow windows retain vertical/horizontal scrolling; desktop practice controls fit the tested windows. These are stylized teaching hands, not scanned hands or a physical technique assessment.
