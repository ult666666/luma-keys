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

## Overnight rhythm and cross-staff follow-up — September 25
- The [MusicXML time element](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/time/) preserves numerators, denominators, additive groups, and composite signatures. Retain those groups alongside quarter-note bar lengths instead of reducing every meter to an integer quarter-note count.
- [Open Music Theory, Compound Meter](https://viva.pressbooks.pub/openmusictheorycopy/chapter/compound-meters-and-time-signatures/) describes the dotted pulse in compound meter. Luma now defaults to two dotted-quarter clicks in 6/8 and three in 9/8. An ungrouped 5/8 uses five eighth-note clicks; explicitly written 3+2/8 uses those two groups. This is a default interpretation, not an inference about every performer's phrasing.
- [MusicXML notation basics](https://www.w3.org/2021/06/musicxml40/tutorial/notation-basics/) distinguishes voices from the staves that display their notes. Cross-staff voices are now flagged for hand review. The importer preserves pitches and timing and does not claim to infer physical fingering or hand choice.
- The transport keeps quarter-note coordinates and quarter-note tempo internally. The interface displays `♩ =` for that tempo. Metronome pulses are scheduled with an 80 ms look-ahead on the existing AudioContext clock; pause and loop reset cancel pending click oscillators. A short pickup uses a count-in that leads into its place in the opening bar.
- Verification includes core meter/pickup/cross-staff regressions and browser measurements of scheduled click times. These are timing and signal checks, not a physical-speaker or physical-keyboard test.

## Built-in lesson audit — September 25, 1 AM pass
- Compared the Für Elise demo with the [Mutopia edition](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931), sourced from Breitkopf & Härtel 1888. The former demo flattened durations, used 4/4, and serialized bass notes into the right hand. Replaced it with a 53-note two-hand excerpt: two-sixteenth pickup, seven complete 3/8 bars and the short first ending. App bar 1 is the pickup; the source's printed bar 1 is app bar 2. This distinction is explained in the lesson guidance.
- Exact source retained locally with attribution; lesson MusicXML drives both playback and engraving. Explicit regression expectations independently check the source pitches, bass octaves, rests, pickup count-in and last bar. Pedal and expressive interpretation remain simplified, and this is only the opening excerpt, without repeats.
- Visual review found short notes overlapping because of a large minimum block height. The preview now moves closer for shorter note values, and each block uses its actual duration with a small separation. Extremely small blocks omit text instead of drawing illegible overlapping labels; the keyboard and next-note panel still name the key.
- A synthetic 50,000-note JSON score passed import, review pagination, save, late seek and playback in headless Chrome. Measurements are recorded in `evidence/large-score-qa.json`; they do not establish a guarantee for engraving long scanned books or for other hardware. This run deliberately tested note-timeline scale independently from optical recognition.

## Longer notation review — September 25, 2 AM pass
- Independent Bach BWV 846 and Joplin Entertainer MusicXML exports from OSMD's pinned 1.9.2 test collection are kept with original metadata, provenance and hashes in `tests/fixtures/README.md`. Bounded checks cover Bach's sustained lower voices and ending chord, and Joplin's two-part layout, key changes, repeats warning and final eighth rest.
- Rendering the entire Joplin score produced 12,636 DOM nodes and an 8,812-pixel scroll area. The initial 16-bar passage uses about 2,266 nodes and 1,939 pixels in the same test viewport. A 256-bar, 4,352-note synthetic book verifies later passage navigation. These measurements are for this Mac and test environment.
- The [OSMD options reference](https://opensheetmusicdisplay.github.io/classdoc/interfaces/IOSMDOptions.html) provides drawing ranges. The view parses the complete score to preserve clefs, keys and ties, then renders the selected 16-bar window. It uses a cleaned-up ResizeObserver rather than leaving global resize callbacks attached after the dialog closes. Narrow windows scroll the notation horizontally instead of compressing notes together.
- The [OSMD load API](https://opensheetmusicdisplay.github.io/classdoc/classes/OpenSheetMusicDisplay.html) accepts a Document. Passing a locally parsed XML Document fixes valid scores without an XML declaration being mistaken for a URL. The stress fixture deliberately omits that optional declaration. Invalid notation still falls back to editable notes and the original PDF.
- Review starts at the current practice bar, and a bar jump moves both the note table and notation. A displayed range is not marked ready until that actual range has rendered; visual QA caught and fixed a stale-notation frame after a jump.
- Timeline duration now includes explicit ending rests and rest-only closing bars. It does not invent extra silence for a short final bar. Review/save preserves the written ending. Re-import older MusicXML/PDF scores to obtain this corrected duration; personal saved data is not rewritten.


## PDF lifecycle follow-up — September 25, 2026

The 1.0.6 packaged baseline left its actual Audiveris process reparented to PID 1 after a normal app quit; reopening returned a missing-job error. The new local receipt records status and the retained original, while the renderer discovers jobs independently of an open dialog. Retries use new output directories so stale MXL output cannot masquerade as a successful retry.

The native recognizer now runs beneath a small Node child with an IPC connection to the desktop. That child owns the engine handle, stops it on parent disconnect, and escalates from SIGTERM to SIGKILL after three seconds if needed. No stored PID is used to kill a process on restart. The desktop waits for recognition shutdown after saving preferences; a ten-second upper bound prevents a stalled reader from holding the app open indefinitely. The runner drains final logs before exiting. A startup handshake distinguishes launch failure from unreadable sheet music.

Receipts use ordered atomic writes. Planned score IDs are journaled before saving, so restart recovers already-saved parts and explains a partial multi-part save. A receipt precedes installation of its original PDF; the PDF itself uses a temporary file and rename. These measures cover tested process interruption, not guarantees against damaged disks or every operating-system failure.

Primary references: [Node child-process lifecycle and IPC disconnect](https://nodejs.org/api/child_process.html), [Electron app quit events](https://www.electronjs.org/docs/latest/api/app#event-before-quit), [Electron RunAsNode fuse and fork behavior](https://www.electronjs.org/docs/latest/tutorial/fuses), and [ASAR handling](https://www.electronjs.org/docs/latest/tutorial/asar-archives). The packaged tests exercise the real bundled runtime and actual PDF recognition, in addition to a deterministic SIGTERM-ignoring engine fixture. Exact results are in STATUS.md and evidence.


## Input ownership and audio startup — September 25, 2026

A packaged 1.0.7 baseline reproduced five failures: computer A after clicking Play did not advance wait mode; a delayed Play resumed after Start over; pending notes became pressed after blur or simulated MIDI disconnect; and Pause left the sustain label enabled. The baseline is `evidence/input-baseline-1.0.7.json`.

Input registration now keeps separate owners for computer keys, each pointer, focused-key activation, MIDI port and MIDI channel. A pitch releases when its last owner releases; removing an entry invalidates its pending sound. Async Play requests are cancelled by Stop and read current settings after audio initialization. Port refresh only detaches changed inputs, and pedals combine into the shared virtual piano's sustain state. Loop boundaries stop scheduled playback voices while retaining live voices; finishing wait mode ends the transport while the last live note can ring.

The design follows the asynchronous [AudioContext resume contract](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume) and [W3C Web MIDI message/port definitions](https://www.w3.org/TR/webmidi/). Command transitions and changed key characters are tested with constructed events, including an omitted key-up; physical MIDI hardware is still untested. Supported MIDI input remains note-on/off and CC64, not the full controller specification.

The shared browser/native harness observes actual Web Audio source-start/stop calls, not only key colors. During timing regression, a development-only harness problem was isolated: Vite had versioned the UI audio module, while the test imported an unused second instance without the query. Audio/rhythm harnesses now observe the already-loaded module. Evidence: `evidence/rhythm-hot-reload-observer-baseline.json`; final timing results are in `evidence/rhythm-qa.json`.
