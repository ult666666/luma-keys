# Third-party resources

Luma Keys is a personal, locally built piano practice application. Source code and modifications are included in this folder.

## Concert grand piano recordings (2.12 onward)
**Salamander Grand Piano V3**, recorded by **Alexander Holm** on a **Yamaha C5**, is the primary piano. Luma Keys bundles six velocity layers (1, 4, 7, 10, 13, 16), 30 pitches each, as unchanged 48 kHz/24-bit stereo FLACs. CC BY 3.0 permits redistribution with attribution. Full licence, source attribution, checksums and original mapping metadata ship in `public/piano-samples/`. Playback transposes intervening notes, selects the nearest recorded touch, applies envelopes, pan and room acoustics; it is not a Steinway instrument or a human performance.
- Pinned source: https://github.com/sfzinstruments/SalamanderGrandPiano/tree/3382bf9496bba2486f5ab0de55a264d1dfc38404
- Integration and source details: `docs/PIANO_SAMPLES.md`.

## Earlier piano recordings
Salamander Grand Piano V3 by **Alexander Holm**, MP3 samples distributed by the Tone.js audio project. Licensed under Creative Commons Attribution 3.0: https://creativecommons.org/licenses/by/3.0/ . The samples are bundled without audio editing; playback uses pitch shifting for intervening notes and gain envelopes.
- Source recordings and license: https://github.com/sfzinstruments/SalamanderGrandPiano
- MP3 distribution: https://tonejs.github.io/audio/salamander/
- Download manifest: scripts/download-samples.py

## Optical music recognition
Audiveris 5.11.0 by the Audiveris contributors, distributed as the unmodified macOS arm64 application and invoked as a separate local process. GNU Affero General Public License version 3.
- Project and complete corresponding source: https://github.com/Audiveris/audiveris/tree/5.11.0
- Binary: https://github.com/Audiveris/audiveris/releases/tag/5.11.0
- License: https://github.com/Audiveris/audiveris/blob/5.11.0/LICENSE
- Includes a Java runtime and native libraries with notices retained in the application bundle.

## Fonts
Manrope by Mikhail Sharanda and contributors, and DM Serif Display by Colophon Foundry and contributors. SIL Open Font License 1.1; locally bundled from Google Fonts.
- https://github.com/google/fonts/tree/main/ofl/manrope
- https://github.com/google/fonts/tree/main/ofl/dmserifdisplay

## Application libraries
React (MIT), Vite (MIT), Electron (MIT plus bundled Chromium notices), Express (MIT), fast-xml-parser (MIT), fflate (MIT), @tonejs/midi (MIT), Lucide (ISC), OpenSheetMusicDisplay (BSD 3-Clause), Multer (MIT), three.js (MIT; see below). Dependency license notices are retained in node_modules and the application bundle. Versions are pinned in package-lock.json.

## three.js (3-D hands)
The realistic hands over the on-screen keyboard are rendered with **three.js** 0.186.1 by the three.js authors, MIT License. It is bundled into the application's JavaScript as separate chunks (the renderer, and a worker that prepares the hand models), loaded the first time hands are shown.
- Project and source: https://threejs.org/ — https://github.com/mrdoob/three.js (npm `three` 0.186.1)
- License (MIT), reproduced as the license requires:

> The MIT License
>
> Copyright © 2010-2026 three.js authors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## 3-D hand models
The keyboard hand guide uses the **Rigged Hand Visualizer** mesh from Microsoft's **Mixed Reality Toolkit**, under the **MIT License**. The original FBX and license are retained in `Assets/hands/mrtk/`. `scripts/convert-hand-models.mjs` converts the right hand into the app's joint coordinate convention, reflects it for the left hand, and indexes identical vertex attributes without changing the drawn triangles, UV seams or skin weights. The resulting `public/models/hands/{left,right}.glb` files ship with `LICENSE-MRTK.md` and `PROVENANCE.json`.

At load time the app aligns the finger bend axes, uniformly scales the hand, smooths the mesh, adds shallow knuckle relief and extends the wrist fade. The source palm and individual bone proportions are retained. Skin detail is Luma Keys' procedural artwork, baked into the model's own UV layout by `scripts/bake-hand-maps.mjs`. `skin-maps.json` records the source model hashes and the subdivision/sculpt settings shared with the renderer.

- Source: [Microsoft MRTK Rigged Hand Visualizer](https://github.com/microsoft/MixedRealityToolkit-Unity/blob/5c6ab1f6fc064c9a4d9c786ae966c98c03d8b500/Assets/MRTK/SDK/Features/UX/Prefabs/RiggedHandVisualizer/R_Hand_MRTK_Rig.fbx), pinned commit `5c6ab1f6fc064c9a4d9c786ae966c98c03d8b500`.
- Copyright Microsoft Corporation. License: MIT, reproduced in `public/models/hands/LICENSE-MRTK.md`.
- Source FBX hash, conversion details and shipped GLB hashes: `public/models/hands/PROVENANCE.json`.
- Skin maps: `{left,right}-skin-n.png` (normal/roughness) and `{left,right}-skin-d.png` (colour, creases and nails), shipped beside the models under the same terms as the rest of Luma Keys.

## Included music
Traditional Twinkle, Little Star, and small beginner arrangements of Beethoven's Ode to Joy and Für Elise. Original scale exercises and generated practice sheets. Underlying compositions are public domain. The Schubert Ave Maria test PDF is from Audiveris's public examples and is used as a recognition test fixture.

The Für Elise opening lesson (version 1.0.3 onward) is a two-hand transcription of the pickup through the first ending, played once, from **Mutopia-2015/08/18-931**, typeset by **Stelios Samelis** from **Breitkopf & Härtel, 1888**. The typesetter placed this edition in the public domain. Pitches, durations and rests are retained for this excerpt; pedal, expressive markings and repeats are simplified. Source LilyPond is retained in `docs/sources/fur-elise-mutopia.ly`.
- Edition and licensing: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931
- Source: https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.ly

Independent Bach/Joplin MusicXML QA fixtures from OpenSheetMusicDisplay's 1.9.2 repository are retained unmodified in tests/fixtures, with provenance and hashes in its README. Underlying compositions are public domain; original source and encoding metadata remain intact. Repository license: https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/1.9.2/LICENSE . These fixture files are not bundled into the installed app as lessons.

## Original assets
Luma/Mochi vector companion artwork, icon, color themes, UI design and copy are original to this project.

Tesseract English trained data 4.1.0, Apache License 2.0, bundled to make text/tempo recognition available offline. https://github.com/tesseract-ocr/tessdata/tree/4.1.0 . The compatible legacy-and-LSTM model is required by Audiveris's Tesseract-only mode.

PDF.js by Mozilla and contributors (Apache License 2.0) renders the original score in the app. Its worker, character maps, standard fonts, and image-decoding WASM resources are bundled locally; associated notices are retained in public/pdfjs.


# Backing instrument samples

Nylon guitar and fingered electric bass samples are excerpts of the FluidR3_GM soundfont renderings distributed by the midi-js-soundfonts project (gleitz and contributors).

Source project: https://github.com/gleitz/midi-js-soundfonts
Source banks:
- https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_guitar_nylon-mp3.js
- https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/electric_bass_finger-mp3.js

The upstream README identifies FluidR3_GM as the Fluid Soundfont and licenses these samples under Creative Commons Attribution 3.0: https://creativecommons.org/licenses/by/3.0/
The license text is included in CC-BY-3.0.txt.

Luma Keys extracts 30 MP3 note samples without editing their audio bytes, selects nearby notes and transposes them during playback. Filenames use MIDI pitch numbers; manifest.json records their SHA-256 hashes. The musical backing arrangements, volume shaping and effects are performed by Luma Keys. These samples are instrument sounds, not song recordings, and no artist endorsement is implied.

## Local companion model and inference runtime (2.20)

Qwen3.5-9B by Alibaba Cloud / Qwen. Standard Q4_K_M GGUF quantization published by Unsloth, revision `3885219b6810b007914f3a7950a8d1b469d598a5`. Apache License 2.0. Base: https://huggingface.co/Qwen/Qwen3.5-9B · Quantization: https://huggingface.co/unsloth/Qwen3.5-9B-GGUF

llama.cpp macOS arm64 runtime `b11146` (stable release v0.5.0). Copyright the llama.cpp authors. MIT License. https://github.com/ggml-org/llama.cpp

Full licenses, model card and verified acquisition hashes are bundled in `Contents/Resources/companion-llm/` and retained in `engines/companion-llm/`. These are pretrained third-party weights; Luma Keys does not claim to have trained the underlying model. Inference is local; no model account, API key or external chat service is required.
