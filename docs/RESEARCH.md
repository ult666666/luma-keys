# Research and design decisions

## Why a native local app
A desktop app can bundle the complete piano samples and recognition engine, use a loopback server without deployment, and store the user's original scores as ordinary files on the Desktop. Electron's renderer runs with Node integration disabled, context isolation and sandbox enabled. Only the app's own origin can use the API. MIDI is enabled without system-exclusive messages.

## How a PDF becomes a lesson
PDF upload → saved original → separate Audiveris process → MusicXML output → parsed timed note events → editable review → practice. Job status shows recognition stages. Failures return an error; warnings about incomplete recognition remain visible. MusicXML and MIDI skip optical recognition. The user can always compare the original score.

Audiveris provides batch, transcribe and export options, and its 5.11.0 arm64 macOS build includes its Java runtime. The English Tesseract model is bundled separately because the Audiveris install initially had no OCR languages. It uses OEM_TESSERACT_ONLY, so the combined legacy/LSTM trained data is required rather than the smaller LSTM-only model.
- https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/
- https://github.com/Audiveris/audiveris/releases/tag/5.11.0
- https://github.com/Audiveris/audiveris/blob/5.11.0/app/src/main/java/org/audiveris/omr/text/tesseract/TesseractOrder.java
- https://github.com/tesseract-ocr/tessdata/tree/4.1.0

## Musical correctness
MusicXML duration is divided by divisions to obtain quarter-note beats. Backup/forward moves the voice cursor. Chord notes share an onset. Ties lengthen an existing event instead of sounding it again. Staves and clefs help identify hand assignments. Optical recognition and MIDI hand estimates are reviewable; the app does not claim to infer pedagogically correct fingerings.
- https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/backup/
- https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/chord/
- https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/tie/

## Beginner labels
The user's requested system is fixed Do: C = 1, D = 2, E = 3, F = 4, G = 5, A = 6, B = 7. Chromatic keys are shown using sharps. Pitch/octave labels remain visible on falling notes and in the next-note panel; C4 is middle C. A tonic selector supports movable labels without transposing sound. Numbers never represent fingering.

## Sound and input
Thirty local Salamander Grand Piano samples span A0–C8. Nearby samples are retuned by semitone ratio. Web Audio supplies low-latency playback, duration envelopes, sustain and a master compressor. The volume control operates on the master gain. Web MIDI note-on, note-off and CC64 are supported. Acoustic pianos can follow the visualization but are not automatically listened to.
- https://github.com/tambien/Piano
- https://github.com/sfzinstruments/SalamanderGrandPiano
- https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API

## Presentation
The requested falling-note visualization drives the interface. Midnight colors, mint right-hand notes, lavender left-hand notes, a cream keyboard and a floating vector companion create a calm futuristic music room. The hierarchy prioritizes the keyboard, the next note and simple playback. An optional hand filter, phrase loop and tempo control reduce the practice unit. Reduced-motion preferences stop decorative animation.

## Verification strategy
Test music semantics with explicit fixtures; verify actual user interactions in Chromium; import a generated PDF with known ground truth; then repeat the PDF and audio flows in the packaged Mac app. Check audio decoding and note scheduling separately from UI movement. Use a simulated MIDI interface for protocol coverage and explicitly distinguish it from physical hardware testing. Inspect screenshots of the original PDF and number-sheet export.
