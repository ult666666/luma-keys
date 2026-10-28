# Hands corrective review · 15 October 2026

Implemented and tested; visual acceptance remains with the user.

Candidate: **5f39132ad6db** at http://127.0.0.1:5188/ on MacBook-Pro-2.local, checkout `~/Desktop/Luma Keys`. The full ID and source/asset SHA256 values are in `after/report.json`. The development-only badge, API manifest, loaded mesh hashes, and every captured frame agree. The final handoff is Chrome Guest, Appassionata opening, Natural, both hands, 100%, paused. The temporary Electron wrapper was closed after its displayed pixels became stale despite a current accessibility tree.

## Diagnosis and changes

- The installed app was running the older packaged bundle on port 64059; port 5188 was absent at the start. Its old Hands control and wrist fade differed from the October 14 candidate. The Air checkout was not used or synchronized.
- The previous candidate already had solid wrists, shorter stage apron and Natural / Focus / Off. Those useful changes remain; they are not attributed to this pass.
- The remaining inflated appearance came from the prepared mesh and pose. This pass narrows upper-palm and finger shoulders, flattens swollen dorsal caps, differentiates phalange transitions, and redistributes idle bends while preserving pad locations. It retains the licensed local base asset and rigid skeletal lengths. The rebaked maps match surface version 6.
- Wrist preparation now solves simultaneous chord contacts before landing. Actual held fingers remain protected. Written holds no longer release early to make travel easier. Same-key reattacks transfer physical ownership at the attack. Impossible deadlines are explicit late/missed-contact diagnostics, without changing score/audio timing. Optional 40 ms legato tails are declined when they obstruct a thumb crossing; genuine written overlaps remain.

## Visual evidence

The previous candidate (42fbef1842b4) and final candidate use the same Mac, Chrome 155 runtime, 1440×900 viewport, DPR 1, zoom 1, Practice camera matrices, keyboard range, score beat, and contact assignments. Stills pause and seek the actual transport and wait for the renderer to settle. Neutral and silhouette are temporary diagnostic materials. All 12 pairs pass the matching checks.

Root and independent reviewer inspected full Practice images plus matched crops. Improvement is visible but moderate: slimmer fingers, less swollen upper palms, clearer knuckle/tendon transitions and quieter idle little fingers. Rounded knuckle caps and broad smooth palm/thumb-web areas remain. This is a focused mesh/pose refinement, not a new model.

Comparison images, kept in the git-ignored `.qa-runs/hands-corrective-2026-10-15/` folder on the development machine and not in this repository: Full-screen Appassionata comparison `appassionata-full-comparison.png` · Natural crop `appassionata-natural-comparison.png` · Neutral `appassionata-neutral-comparison.png` · Silhouette `appassionata-silhouette-comparison.png`

Relaxed five `relaxed-five-0-comparison.png` · Mixed chord `mixed-chord-0-comparison.png` · Held/moving `held-moving-2_35-comparison.png` · Position transition `position-transition-1_8-comparison.png`

## Verification and limits

- Fresh full suite: **1,008 / 1,008 tests pass**. Renderer subset: 69 / 69; planner subset: 112 / 112. Production build succeeds. Logs are retained in the evidence directory.
- All 13 full-app recordings use the authoritative musical clock, Natural mode and unchanged score timings. Sampled expected contacts: 9504, with zero missing or unexpected contacts. Maximum rig contact-target error: 0.499703 mm; maximum held-pad excursion: 0.7681 px; maximum clock-map difference: 5.3333 ms. These are observed samples, not proof about unsampled sub-frame events or the entire score.
- The failed crossover recording is preserved under `after-crossover-failure-40bcb8a0465d`. Its 2.894 mm error led to the additional strict real-layout regression. The final slow-scale recording peaks at 0.485522 mm; mixed arpeggio is close to the 0.5 mm budget.
- Actual weighted skin/triangle checks at both 32.925 px and 38 px key layouts show zero same-pose contact-surface change from the sculpt. The inherited sphere-proxy versus skin approximation remains: sampled vertical offsets about −0.72 to +1.16 mm. This is not a full moving triangle-versus-key collision proof.
- Motion was inspected through chronological frames from the full-app recordings and live Appassionata playback/reset in Chrome. Recordings are silent; audible synchronization and physical MIDI hardware were not listening-tested in this pass.
- The 61 fingerprinted personal-library files and installed app ASAR remain unchanged. Captures and fixtures use a separate Library and test profile; no personal browser storage was cleared.

## Full Practice recordings

| Passage | Maximum rig error (mm) | Local recording |
|---|---:|---|
| appassionata-1x | 0.106931 | `after/appassionata-1x.webm` |
| relaxed-five-1x | 0.111872 | `after/relaxed-five-1x.webm` |
| mixed-chord-1x | 0.006868 | `after/mixed-chord-1x.webm` |
| held-moving-0.5x | 0.106479 | `after/held-moving-0.5x.webm` |
| held-moving-1x | 0.097508 | `after/held-moving-1x.webm` |
| position-transition-0.5x | 0.000091 | `after/position-transition-0.5x.webm` |
| position-transition-1x | 0.000071 | `after/position-transition-1x.webm` |
| scale-0.5x | 0.485522 | `after/scale-0.5x.webm` |
| scale-1x | 0.128484 | `after/scale-1x.webm` |
| arpeggio-1x | 0.290942 | `after/arpeggio-1x.webm` |
| mixed-arpeggio-1x | 0.499703 | `after/mixed-arpeggio-1x.webm` |
| repeated-1x | 0.000104 | `after/repeated-1x.webm` |
| wide-intervals-1x | 0.117740 | `after/wide-intervals-1x.webm` |

Evidence root: `.qa-runs/hands-corrective-2026-10-15` on the development machine (git-ignored, so not in this repository). `after/report.json`, `matched-view-verification.json`, `loaded-mesh-verification.json`, `mesh-contact-audit.json`, `mesh-contact-audit-38px.json`, and `data-integrity.json` retain the detailed receipts.
