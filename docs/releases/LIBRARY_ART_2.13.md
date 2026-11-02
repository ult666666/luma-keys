# Library illustrations · 2.13

Created 27 September 2026 for Luma Keys with the built-in `image_gen` tool, using the imagegen skill in built-in mode. These are original generated illustrations, not photographs, official album art, or composer portraits. No external artwork or user screenshot was used as an image reference.

## Chosen files

All three images are opaque RGB PNGs, 1536 × 1024 pixels (3:2). The files in `public/library-art` and `Assets/Library Art` are identical copies of the selected generated outputs. They have not been resized or recompressed.

| Scene | App asset | Bytes | Intended feeling |
| --- | --- | ---: | --- |
| Storm coast | `/library-art/storm-piano.png` | 2,767,460 | Walnut piano, storm-lit sea, ink and warm lantern light |
| Sunny window | `/library-art/sunny-piano.png` | 2,984,647 | Summer sky, curtains, jade greenery, cream and peach sunlight |
| Moon garden | `/library-art/moon-piano.png` | 2,428,030 | Ivory piano, plum dusk, amber lamp, small sleeping cat |

The original desktop copies are in `Assets/Library Art/`. Exact generation prompts, targeted edit prompts, tool mode, source paths, output metadata, focal positions, and SHA-256 checksums are saved in `Assets/Library Art/prompts.json`.

## Display guidance

Use the images as artwork beside the title; they contain no instructional notation. Full 3:2 display preserves the complete scene. A moderate 16:10 crop also preserves the piano and atmosphere. If a narrow crop is required:

- Storm: the piano is around 68% across and 62% down; `object-position: 64% 55%` retains much of the coast.
- Sunny: the piano is around 67% across and 56% down; `object-position: 62% 54%` retains the window light.
- Moon: the piano is around 68% across and 50% down, while the cat is around 36% across and 65% down. Prefer the complete scene or `object-position: 56% 53%`; a far-right crop can hide the cat.

When the image accompanies a visible score title and serves only as decoration, use empty alternative text. Do not use the artwork itself as a substitute for the score title, playback progress, or a button label.

## Inspection and provenance

Each selected image was inspected at generated resolution for composition, piano silhouette, texture, legibility at cover scale, and incidental text. Storm and moon each received one precise built-in imagegen edit to remove a small brand-like mark on the piano front; the surrounding scene was preserved. No other image-editing tools were used. The sunny output was selected without an edit.

The coherent set uses painted gouache/watercolor texture, natural wood and paper tones, with distinct storm, summer and evening light. All three show a recognisable grand piano, and the moon scene includes the requested sleeping cat. These are atmospheric illustrations, not keyboard anatomy diagrams.

File checks verified the dimensions, opaque output, non-empty assets and exact SHA-256 equality between the app copies and archived desktop copies. UI cropping, loading behavior and accessibility are tested by the separate Library integration work.

