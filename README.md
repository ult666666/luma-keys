# Luma Keys

A focused, local sight-reading companion.

Double-click **Luma Keys.app on your Desktop**. No account, terminal, internet connection, or paid API is needed for normal practice.

## Find your way around
The app has four screens in the top bar:

- **Practice** is the reading workspace: the piece title, an **at a glance** row (key signature, meter, tempo, each hand's range, and anything worth a look first: eighths or sixteenths, dotted rhythms, off-beat entries, accidentals with their bars, the largest leap, chords, meter changes, pickups), a switch between Number score, Sheet music and Falling notes, the score, a control dock and the keyboard guide. The dock shows what to play next **and the notes after it**, the transport, the three practice modes, hand, speed and volume, plus a line from your companion. **New exercise** here, or the **N** key, makes a fresh piece at your saved level. On a fresh library a welcome card offers Level 1 or an import.
- **Exercises** lists the twelve sight-reading levels with your run counts and the recommended next level. Choose a level (and, if you like, a key, hands, length, meter or tempo) and press **Start exercise**; **Start** on any row does the same for that level.
- **Library** lists your imported scores and kept exercises with their key, length, tempo and last graded result, plus the starter pieces. **Open** loads a piece into Practice.
- **Progress** shows your streak, a chart of recent graded runs, results per level and the recent runs themselves. **Open** on a run reopens that piece, or regenerates that exact exercise from its seed.

**Import a score** and the settings gear stay in the top bar on every screen. The MIDI status pill turns on when a keyboard is connected.

## Read a piece
1. Open a score from Library or make one on Exercises. **Number score** shows a few bars from left to right, with separate right/left hands. C4 is middle C; C5 is one octave higher. The ♩ value under each note is its duration in quarter-note beats. Simultaneous notes are stacked; each rest also shows how long to stay silent.
2. Numbers name pitches: C / Do = 1, D / Re = 2, E / Mi = 3, F / Fa = 4, G / Sol = 5, A / La = 6, B / Ti = 7. These are not finger numbers.
3. Click a number to begin there. Previous/next passage and **Go to bar** move through the score; Previous/Next note let you advance at your own pace on an acoustic piano.
4. Click Play in **Listen & follow**, choose **Wait for me** for a connected MIDI piano, onscreen keys, or computer keys A W S E D F T G Y H U J K, or **Play in time** to read at a steady pulse and be graded afterwards. Wait mode checks pitch, not rhythm. The app does not listen through a microphone.
5. The keyboard keeps full-size keys in a scrolling window. **Follow notes** moves it when a target leaves view. The small overview shows your location on all 88 keys; arrows move by octave. Required pitches outside the window get explicit direction buttons. Use **Hide keyboard guide** to leave more room for reading at your piano. This choice stays with you while switching pieces during the current app session. Falling notes temporarily reveals the keyboard.

For a short practice phrase, choose **Repeat these bars** above the manuscript. To select a different range, click a bar number and then **Shift-click** its final bar, or edit the bar numbers below the player. The repeated bars are marked on the paper. Previous/Next note cycle within that phrase, and Start over returns to its first bar. Clicking a note, bar, passage or timeline position outside the repeat returns to the whole piece.

**Sheet music** displays the original engraving with a position cursor when MusicXML is available; generated exercises always have one. **Falling notes** is an optional alternate view. Use the settings gear for number/solfege labels, tonic, count-in, metronome, companions and themes. Opening Settings pauses practice.

## Practice sight reading with new music every time
Sight reading only works on music you have never seen. The **Exercises** screen makes short original pieces, engraved as real sheet music and shown as a number score:

1. Choose a **level** (1–12). Each level adds one idea: right hand in the C position, then the left hand, skips and rests, both hands, one sharp or flat, eighth notes, hands together, wider leaps and dotted rhythms, block chords, broken chords, accidentals and syncopation in 6/8, then sixteenths over an independent bass line. Level defaults for key, hands, length, meter and tempo can each be overridden in the panel.
2. Press **Start exercise** (or **Start** on a level row). The title names the level and key; the line beneath it shows the meter, length, hands and tempo. **Another like this** makes a different piece with the same choices, **New exercise** (or **N**) makes one at your saved level, and **Keep in library** saves the one you want to return to.
3. Read it once, in time (below), then let the next one appear. The level list shows your run counts and the recommended next level.

Exercises are generated on your Mac from a seed number, so nothing is downloaded and the same seed always makes the same piece. The app reopens on the piece or exercise you were reading last. Flat keys are spelled with flats (B♭, not A♯) in the number score, keyboard, cue and exports.

### Play in time
**Play in time** is the third practice mode. Press Play: one bar counts in (a pickup shortens it, as in Listen & follow), then the click keeps the pulse while the cursor moves at the practice speed and you play the notes. The piano does not play the written notes for you. When the passage ends, or when you press Pause part-way, a report card shows:

- notes right, the share played **on time**, missed notes, wrong notes, and whether you tend to run early or late (in milliseconds);
- a strip of bars coloured by how clean each one was, with the missed notes named by bar;
- two or three **coaching tips** drawn from the numbers (arriving late by so many milliseconds, the bar that cost the most, a leap to look at, whether to slow down or move up), with your companion looking pleased at 90% or better;
- **Repeat bars a–b** for the weakest bars (a phrase loop is set for you), **Play it again**, **Next exercise**, and **Try level N+1** once three consecutive complete runs at a level reach 90% with at least 60% on time.

A note counts when its pitch arrives within four tenths of a beat (at least 250 ms) of the written onset, and is "on time" within a tenth of a beat (at least 100 ms). Wrong pitches count against you; a passage started from the middle begins at that bar line. Each graded run is added to your practice history on the **Progress** screen (day streak, runs today, average of the last ten, a trend chart, results per level and the recent runs, each of which can be reopened). Play in time needs a MIDI keyboard, the onscreen keys or the computer keys; it does not listen through a microphone.

### Your companion
Luma the cat or Mochi the bunny (Settings → Companions & moods) sits under the score with one short line: a greeting on a fresh library, what the current mode will do, or a reaction to your last graded run. The companion never takes room from the music and can be turned off with **Companion tips** in Settings. Each theme tints the whole app, not only the accent.

### Settings that stay
Key labels, **Number 1 is**, count-in, metronome, the hidden keyboard guide, the music view, practice speed, mode, hand and your exercise choices are saved with your settings and restored at the next launch. **Number 1 follows the key** in Settings makes number 1 the tonic of each piece automatically (for movable-Do reading); off by default, so C stays 1.

## Bring your sheet music
Choose **Import a score**, or drag a file into the import dialog. PDF, MusicXML (.musicxml/.xml/.mxl), MIDI (.mid/.midi), and exported Luma JSON are supported. The maximum is 30 MB.

PDF recognition runs on your Mac using bundled Audiveris. Printed, straight, high-contrast scans work best. Recognition is not perfect: compare the recognized notes and the original PDF in the review window. You can change each note's pitch, octave, timing, duration, or hand. Click **Save & mark reviewed** once you have checked it. Recognition errors are shown rather than replaced with invented notes.

A PDF can keep reading while you close the import panel and practice. **View imports** brings back progress, including after a window reload. **Cancel recognition** stops the reader and keeps the PDF. Quitting the app also stops recognition; reopen and choose **Retry recognition** to continue from the saved original. A finished background import waits for you to choose **Review notes**. **Dismiss** hides its notice without deleting your PDF or music.

MusicXML/MIDI exports from notation software are more reliable than scans. Unsupported or simplified score features are noted in the review window. Voices that move between staves are flagged: staff position does not always tell you which hand should play, so review those hand colors. Repeats and navigation may play once in written order; use the bar loop to repeat a passage. The app does not infer fingerings or listen to an acoustic piano through a microphone.

Older practice backups with missing timing fields are restored from their notes and flagged for review. Check silent bars and the ending against the original sheet. Invalid pitches or rhythms are rejected with a clear error. If a saved file is damaged, the rest of your library still opens: the recovery notice lists the affected files, leaves them untouched, and lets you check again after restoring a backup or reimporting your music.

If saved settings are damaged, a separate recovery notice shows which fields use defaults. Valid themes, companions, mute and practice totals are retained. Opening the app leaves the original settings file untouched; the first saved change keeps an exact copy in `Library/Settings recovery/` before saving usable settings. You can also choose **Save recovered settings**. Normal desktop Quit and window close also record active practice time and finish pending saves. If the file cannot be opened, a lasting notice explains that changes are temporary and offers **Reload saved settings** after access is restored. Practice and preference controls wait until initial settings loading finishes.

## Practice controls
- **Listen & follow:** automatic sampled-grand-piano playback with the reading position highlighted.
- **Falling notes:** fast passages show a closer preview; note lengths stay proportional to duration and repeated notes remain distinct. Number-score spacing adapts for legibility, so use the written ♩ values to count.
- **Wait for me:** the timeline stays on each onset until the expected notes are found. Chords require every displayed pitch. Accuracy counts note attempts, not rhythmic skill.
- **Play in time:** count-in, click and a moving cursor at tempo; pitch and timing are graded afterwards, bar by bar, with a repeat offered for the weakest bars.
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
The overnight schedule ended at 8:00 AM Eastern on September 25, 2026. Later improvements follow direct user requests; that schedule has not been extended. Build status is in STATUS.md.

The original PDF viewer is built into the app and works offline. Review also supports adding a missing note or removing an incorrect one. If you edit the note timeline, the original engraving is explicitly labeled as unchanged; playback and numbered exports use your corrections. Playback pauses when the app is hidden or minimized, so it will not silently skip ahead.

Review opens at your current practice bar. Use **Review from bar** to jump directly to a passage in either the note table or the engraved sheet. Notation shows up to 16 bars at a time with Previous/Next controls; pickups count as app bars, so printed bar numbers can differ. On narrow windows, scroll the sheet sideways. New MusicXML/PDF imports preserve written closing rests; re-import an older score if its ending was cut short.

Phrase-practice acceptance: `node scripts/phrase-practice-qa.mjs` checks direct bar selection, close-note Wait input, phrase navigation, counted rests and keyboard collapse. `node scripts/native-phrase-practice-qa.mjs` runs the same story in the packaged app with isolated data.

Sight-reading acceptance: `node scripts/sight-reading-qa.mjs` makes exercises from the Exercises screen and the Practice button, engraves them, performs a known exercise twice in Play in time (a clock-accurate clean run and a flawed run) against the app's own audio clock, checks the report card, the saved history, restored settings, flat spellings, Number 1 follows the key, the Progress screen and the Library rows. `node scripts/native-sight-reading-qa.mjs` runs the same checks in the packaged app. Unit tests for the generator and the grader are in `tests/exercise.test.mjs` and `tests/performance.test.mjs`.
