# Cartoon song covers · 2.16

The Library now uses fourteen original cartoon illustrations. Thirteen identify known pieces or editions; one welcomes new, unrecognized imports. Characters, settings and colors distinguish pieces without adding more labels or controls.

| Piece | Cover story |
| --- | --- |
| Appassionata III | Mini Beethoven conducts a playful storm above the sea. |
| 晴天 · Original | A kitten, a guitar and a sunlit school courtyard. |
| 晴天 · Chord arrangement | The kitten and a bunny play a piano-and-guitar duet. |
| 晴天 · Concert arrangement | A sunset piano recital for little animal friends. |
| 龙卷风 · 邓紫棋版 | A purple kitten and a friendly whirlwind beside an empty chair. |
| 你离开的事实 | A scarf-wearing penguin waves goodbye to a departing train. |
| Moonlight Sonata I | A sleepy bunny floats in a crescent boat. |
| Gymnopédie No. 1 | A tiny fox balances quietly in a peach-and-sage courtyard. |
| Bach Prelude in C | An owl guides an ordered stream of golden pebbles. |
| First C major steps | A kitten and frog follow a piano-key garden path. |
| Twinkle, Twinkle, Little Star | A teddy bear reaches toward a smiling star. |
| Ode to Joy | A frog, fox, rabbit and bear play together under a rainbow. |
| Für Elise | A little robin delivers a rose-colored envelope. |
| New pieces | A kitten librarian keeps a musical folio in a cozy room. |

These are original visual interpretations, not official album artwork or assertions about the composers' intended stories. Instruments and key paths in the covers are decorative illustrations; the live keyboard remains the teaching diagram.

## Recognition and layout

Saved score identity determines its cover, so sorting, searching or renaming does not shuffle the artwork. Newly imported recognized titles use bounded work and composer matches. The three Sunny Day editions now retain separate visual identities. An unrelated import receives the neutral kitten cover instead of guessing a song from generic words such as “moon” or “storm.”

Cards show the full 3:2 image. Continue cards adapt to the window, with adjusted focal positions protecting the storm-cloud faces and the fox's raised ear. Companion rooms still color the surrounding paper and frame; each illustration retains its own palette. Images load locally with fixed dimensions and lazy loading in the collection. Reduced motion keeps artwork still; missing files retain the usable score card with a decorative fallback.

## Originals and provenance

Open `Assets/Cartoon Covers 2.16/index.html` for the offline gallery. All fourteen 1536 × 1024 PNG originals are retained intact beside it, with matching copies under `public/library-art/`. `manifest.json` contains exact prompts, generator mode, source paths, checksums and final focal positions. Images were created with the built-in `image_gen.imagegen` tool. Twinkle was reframed for a safer crop. Two tiny piano-mark cleanup attempts on Sunny Concert are documented; a small ambiguous gold detail remains and was accepted during visual review.

Older cover collections remain in their original folders. Practice scores, source PDFs, audio, companion behavior and personal history are outside this art-only change.

## Verification

373 unit/API tests and all 6 final native acceptance groups pass. An independent review checked 30 screenshots. Installation and reopening preserve all 107 personal files, ten scores and the Appassionata bar-378 bookmark. Final test and installation evidence is saved in `evidence/cartoon-covers-2.16-verification.json`; full reports and native screenshots are in `.qa-runs/cartoon-covers-2.16/`.
