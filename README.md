# Luma Keys

A focused, local sight-reading companion.

Double-click **Luma Keys.app on your Desktop**. No account, terminal, internet connection, or paid API is needed for normal practice.

## Read a piece
1. Open a score. **Number score** shows a few bars from left to right, with separate right/left hands. C4 is middle C; C5 is one octave higher. The ♩ value under each note is its duration in quarter-note beats. Simultaneous notes are stacked and silent gaps are marked rest.
2. Numbers name pitches: C / Do = 1, D / Re = 2, E / Mi = 3, F / Fa = 4, G / Sol = 5, A / La = 6, B / Ti = 7. These are not finger numbers.
3. Click a number to begin there. Previous/next passage and **Go to bar** move through the score; Previous/Next note let you advance at your own pace on an acoustic piano.
4. Click Play in **Listen & follow**, or choose **Wait for me** for a connected MIDI piano, onscreen keys, or computer keys A W S E D F T G Y H U J K. Wait mode checks pitch, not rhythm. The app does not listen through a microphone.
5. The keyboard keeps full-size keys in a scrolling window. **Follow notes** moves it when a target leaves view. The small overview shows your location on all 88 keys; arrows move by octave. Required pitches outside the window get explicit direction buttons.

**Sheet music** displays the original engraving with a position cursor when MusicXML is available. **Falling notes** is an optional alternate view. Use the Settings icon for number/solfege labels, tonic, count-in, metronome, companions and themes. Opening Settings pauses practice. Pets and progress no longer occupy the reading workspace.

## Bring your sheet music
Choose **Import a score**, or drag a file into the import dialog. PDF, MusicXML (.musicxml/.xml/.mxl), MIDI (.mid/.midi), and exported Luma JSON are supported. The maximum is 30 MB.

PDF recognition runs on your Mac using bundled Audiveris. Printed, straight, high-contrast scans work best. Recognition is not perfect: compare the recognized notes and the original PDF in the review window. You can change each note's pitch, octave, timing, duration, or hand. Click **Save & mark reviewed** once you have checked it. Recognition errors are shown rather than replaced with invented notes.

A PDF can keep reading while you close the import panel and practice. **View imports** brings back progress, including after a window reload. **Cancel recognition** stops the reader and keeps the PDF. Quitting the app also stops recognition; reopen and choose **Retry recognition** to continue from the saved original. A finished background import waits for you to choose **Review notes**. **Dismiss** hides its notice without deleting your PDF or music.

MusicXML/MIDI exports from notation software are more reliable than scans. Unsupported or simplified score features are noted in the review window. Voices that move between staves are flagged: staff position does not always tell you which hand should play, so review those hand colors. Repeats and navigation may play once in written order; use the bar loop to repeat a passage. The app does not infer fingerings or listen to an acoustic piano through a microphone.

Older practice backups with missing timing fields are restored from their notes and flagged for review. Check silent bars and the ending against the original sheet. Invalid pitches or rhythms are rejected with a clear error. If a saved file is damaged, the rest of your library still opens: the recovery notice lists the affected files, leaves them untouched, and lets you check again after restoring a backup or reimporting your music.

If saved settings are damaged, a separate recovery notice shows which fields use defaults. Valid themes, companions, mute and practice totals are retained. Opening the app leaves the original settings file untouched; the first saved change keeps an exact copy in `Library/Settings recovery/` before saving usable settings. You can also choose **Save recovered settings**. Normal desktop Quit and window close also record active practice time and finish pending saves. If the file cannot be opened, a lasting notice explains that changes are temporary and offers **Reload saved settings** after access is restored. Practice and preference controls wait until initial settings loading finishes.

## Practice controls
- **Listen & follow:** automatic sampled-grand-piano playback with the reading position highlighted.
- Fast passages show a closer preview; note lengths stay proportional to duration and repeated notes remain distinct.
- **Wait for me:** the timeline stays on each onset until the expected notes are found. Chords require every displayed pitch. Accuracy counts note attempts, not rhythmic skill.
- **Hands:** isolate left or right; imported MIDI hand assignments may need review.
- **Loop:** repeat the selected bar range. New MIDI and MusicXML imports preserve changes in bar length. Wait mode stays inside the selected phrase; an empty phrase prompts you to choose another hand or widen the loop.
- **Speed:** 25–125% without changing pitch. `♩ =` shows quarter notes per minute. Count-in and metronome follow the written meter: for example, two dotted-quarter pulses in 6/8. A small hint shows the pulse count. Short pickup notes enter after the appropriate partial count-in.
- **Number 1 is:** C is fixed Do by default. Choosing another tonic changes number labels, not the sounding notes.
- **Keyboard:** keep keys readable; scroll or use the overview to reach the whole piano. Arrow keys move keyboard focus; Enter/Space plays the focused key.
- **Export icon:** saves a printable numbered practice HTML and reusable JSON backup to the Exports folder. Open the HTML in a browser and choose Print / Save PDF.
- **Space:** play/pause when focus is outside an input or button. A–' play C4–F5; the black keys use W E T Y U O P. These note keys also work after clicking Play or moving a volume/timeline slider. Typing in a text field or dialog stays silent.

Computer, onscreen and MIDI keys can be used together: releasing one input does not cut a pitch still held by another. A loop keeps live notes and sustain sounding across its boundary. The last note in **Wait for me** rings until you release it. Pause/Start over clears notes and sustain; switching away cancels pending key sounds. MIDI connection changes release only the disconnected input. MIDI input currently handles note-on/off and CC64 sustain; other controller messages are not interpreted.

In **Lessons**, Für Elise now includes a two-hand opening excerpt with its 3/8 pickup, rests, engraved sheet music and a three-step practice path. Start with one hand at 50%. App bar 1 is the pickup, so the left hand enters in app bar 3. The excerpt ends after the first ending without repeating. Its corrected MusicXML, printable numbered HTML and PDF are in `Practice Sheets/`.

## Files you own
- `Library/`: imported scores, original PDFs, recognition output, and practice settings. Back this up.
- `Exports/`: printable number sheets and practice backups.
- `Practice Sheets/`: starter sheet and sample practice resources.
- `src/`, `public/`, `server.mjs`, `electron.cjs`, `recognition-runner.cjs`: complete editable application source and assets.
- `docs/`: design decisions, third-party credits and Claude's enhancement report.
- `evidence/`: test results and screenshots.

## Development
Requires Node.js and npm only for development. Installed dependencies are included locally.

```
npm install
npm run dev
npm test
npm run build
npm run pack
```

Development UI: http://127.0.0.1:5188 . Local API: port 5189. Packaged app chooses its own available loopback port. It uses an isolated renderer without Node access and rejects foreign web origins.

To rebuild and refresh the Desktop app after changes, run `scripts/package-desktop.sh`. Quit and reopen the app when convenient to load an installed update.

For browser tests, use `LUMA_DATA_DIR="$PWD/.qa-runs/ui/Library" npm run dev`, then run the QA scripts sequentially. They require this separate test library. `node scripts/reader-qa.mjs` tests the new reading workflow; `node scripts/native-reader-qa.mjs` runs it in an isolated packaged app. `node scripts/native-input-qa.mjs` checks piano input and `node scripts/close-qa.mjs` checks save/quit behavior. Older dashboard-oriented QA scripts retain historical selectors. `node scripts/recognition-close-qa.mjs` checks normal close, force quit, relaunch and PDF retry in isolated packaged instances. See docs/OVERNIGHT.md.

The app is a local personal build for this Apple Silicon Mac; it is not an App Store release. It includes a current Electron runtime and the local recognition engine. Do not delete Library if rebuilding the app.

## Overnight work
An hourly Codex follow-up is scheduled through 8:00 AM Eastern on September 25, 2026. Keep this Mac plugged in, awake, and Codex running. Build status is in STATUS.md. The schedule is bounded to tonight.

The original PDF viewer is built into the app and works offline. Review also supports adding a missing note or removing an incorrect one. If you edit the note timeline, the original engraving is explicitly labeled as unchanged; playback and numbered exports use your corrections. Playback pauses when the app is hidden or minimized, so it will not silently skip ahead.

Review opens at your current practice bar. Use **Review from bar** to jump directly to a passage in either the note table or the engraved sheet. Notation shows up to 16 bars at a time with Previous/Next controls; pickups count as app bars, so printed bar numbers can differ. On narrow windows, scroll the sheet sideways. New MusicXML/PDF imports preserve written closing rests; re-import an older score if its ending was cut short.
