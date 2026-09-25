# Third-party resources

Luma Keys is a personal, locally built piano practice application. Source code and modifications are included in this folder.

## Piano recordings
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
React (MIT), Vite (MIT), Electron (MIT plus bundled Chromium notices), Express (MIT), fast-xml-parser (MIT), fflate (MIT), @tonejs/midi (MIT), Lucide (ISC), OpenSheetMusicDisplay (BSD 3-Clause), Multer (MIT). Dependency license notices are retained in node_modules and the application bundle. Versions are pinned in package-lock.json.

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
