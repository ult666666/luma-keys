# Piano studio implementation

Approved brief: `/Users/prince/.codex/attachments/094bb61c-b736-407f-9309-c8d5a10a0413/Pasted text.txt`.

Goal: believable, readable demonstration hands and a calmer piano studio. This is an implementation pass; the supplied brief replaces further design approval rounds.

## Baseline and boundaries
- MacBook-Pro-2.local, Mac17,9, Apple M5 Pro. Checkout `/Users/prince/Desktop/Luma Keys`, version 2.46.0; 978 pre-existing changed/untracked entries.
- React 19 / Vite 7 / Electron 44; Three.js 0.186 skinned MIT-licensed MRTK meshes over a DOM keyboard. Worker-prepared fingering and motion sampled by the existing stage transport. JSON preferences and journals through the local server.
- Baseline source copies, hashes, diff, tests and captures: `.qa-runs/studio-2026-10-14/`. Preview uses its own Library/Logs; no installed app, production process, other machine or unrelated project changes.

## Work and ownership
- [x] Record baseline and same-view captures; inspect assets, projection, planner, persistence.
- [x] Geometry: refine palm silhouette, thumb web, and shaft taper in hand3d-rig/data; protect pads, skeletons, lengths, weights and normals; rebake existing local maps. Geometry agent owns these files.
- [x] Planning: reproduce annotation loss, oversized chords, and stopped-clock replay; test and fix without dropping/rolling musical events. Logic agent owns fingering, hand-pose/planner and narrow parser changes. Infeasible poses return guidanceOnly + reason with all true contacts.
- [x] Presentation: persist Natural/Focus/Off; contact-only Focus and failure fallback; clip the wrist at a shorter stage boundary without a dark fade; preserve keyboard projection and note notation. Root owns renderer, KeyboardGuide, preferences, App and practice styles.
- [x] Supporting pages: unique saved/starter collection selectors, honest history labels, resolved exercise settings, concise cards and companion deduplication. UI agent owns screens and their existing styles.
- [x] Integration: full tests/build, desktop/responsive/zoom/reduced-motion/fallback checks, matched screenshots and real playback recording; independent review, final corrections and limitations.

## Review focus
1. Conflicting or impossible explicit fingers: retain the choice and exact music, show accurate key guidance instead of impossible geometry.
2. Held notes beside movement: pads remain on their playable surfaces; seeking does not replay earlier motion.
3. Renderer failure and Focus/Off: keyboard stays usable; finger numerals remain distinct from note degrees.
4. Library counts: distinguish saved, starter, filtered and removed/exercise history without rewriting history.
5. Narrow/200% windows and long bilingual titles: reflow controls and readable keys; no hidden transport or duplicate companion entry points.

No new third-party asset, model inference, or renderer migration is planned. No installation or release replacement is part of this pass.

Implementation and measured verification: `docs/STUDIO_HANDS_2026-10-14.md`. Final independent review findings are resolved before delivery.
