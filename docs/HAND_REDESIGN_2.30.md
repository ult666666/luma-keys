# Natural pianist hands · 2.30

The user rejected the 2.29 silhouette. This redesign corrects its short hooked fingers, broad padded palms, conspicuous cuffs and detached wrist endings. A new generated reference was made first: `public/art/hands/pianist-study-2.30.png`. Its exact prompt and provenance are in `.qa-runs/hand-redesign-2.30/art-reference.json`. The reference guides the proportions and finish; the app uses a live articulated model rather than a pasted image, and its rendering remains simpler than the concept artwork.

## What changed

- A consistent 78° teaching camera and less depth compression preserve finger length across compact and wider keyboard layouts. A slimmer palm and varied resting curves replace the claw-like resting silhouette.
- Cuffs are removed. Only skin behind the wrist continues into a gently tapered forearm, so the coda no longer shows detached hands floating above the frame. The change preserves palm/finger vertices, skeleton, weights and playing contacts.
- Softer light, quieter surface detail and short satin nails refine the skin. Fingertip numbers and separate left/right teaching colours remain readable.
- The keyboard chooses a compact, stable key width and reserves its hand rail before the renderer loads. Hands, hide/show, colour choices and reduced motion continue to work across tested window sizes.
- Relaxed fingers stay clear of black keys throughout motion and final settling. The clearance solver checks the key below the moving pad, including crossings; held fingers retain priority and the existing bounded contact correction.

## Verification

All **780 unit/API checks pass**, including 30 hand tests and the new forearm-preservation and free-finger clearance regressions. The forearm test asserts unchanged bind joints, skin weights, pads and all skin ahead of the wrist. Existing strict settling and difficult mixed-key contact checks remain intact.

The exact packaged 2.30 app passes **six native groups** with copied real scores and isolated practice data: Sunny Day opening/crossing at 1440, 1280, 800 and 390 pixels plus a short laptop window; reduced motion and hide/show; Ocean/Rose/Match/Neutral colours; five-second jumps; Beethoven octave/coda and live playback; reload and saved settings. No renderer errors or sample fallbacks occurred, and the owned QA app closed normally without changing its package.

A six-second Appassionata sample records 356 animation frames, frame p95 **17.7 ms**, a **34.3 ms** maximum frame and **0.46 mm** maximum error across 62 sampled held-finger contacts. These measurements describe this run on this Mac; they do not guarantee every passage or concurrent model workload. Native audio was muted, and physical MIDI, microphone listening, audible piano quality and chat inference were not retested in this visual pass.

The first complete candidate passed technical checks but was rejected during visual review because its wrists still ended above the frame. That candidate and an earlier clearance/settling failure are preserved. The accepted final-b screenshots show the continuous forearms. Independent visual review found no further blocker in the opening, crossing, octave and coda captures.

## Saved work

The verified app is saved at `.qa-runs/hand-redesign-2.30/verified-Luma Keys-2.30.0.app`; tests, actual UI captures and diagnostics are in the same run folder. `STATUS.md` records Desktop installation and personal-data preservation. No schedule was created or extended.

The hand revision was installed on October 3 as part of 2.31.0, alongside the Progress redesign. It was not installed as a separate 2.30 release. See `PROGRESS_2.31.md` and `evidence/progress-cute-2.31-verification.json` for the exact installed package and latest personal-data audit.
