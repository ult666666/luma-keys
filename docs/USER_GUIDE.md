# Luma Keys user guide

The complete in-app guide and release notes, newest first. For an overview of the project, see the [README](../README.md).

Latest Desktop update: **2.44.0 — Recovery and a steadier backend**. Restore removed pieces and earlier versions of a piece from the Library, with their practice history, and earlier settings from Settings › Settings history; every restore can itself be undone. Saves of one piece now run in order, and quitting waits for writes under way. [Guide](RECOVERY_2.44.md) · [Verification](../evidence/native-recovery-qa.json).

Latest Desktop update: **2.43.0 — Fortify**. A part of the window that fails now shows a short notice with Try again instead of blanking the app; opening the app no longer rewrites your settings; settings saved by a newer version survive an older one; a Library folder that cannot be opened gets a plain explanation with Try Again; a read-only Library opens. Every runnable packaged-app regression story passes again. [Guide](FORTIFY_2.43.md) · [Verification](../evidence/fortify-2.43-verification.json).

Latest Desktop update: **2.42.0 — Hand motion**. Thumbs now reach their keys in wide stretches (the hand turns toward a thumb a fifth from the index), the hand no longer changes shape at the instant a key is struck, a landing finger arrives already curved, and free fingers settle instead of trembling. [Guide](HAND_MOTION_2.42.md) · [Verification](../evidence/hand-motion-2.42-verification.json).

Latest Desktop update: **2.41.0 — Solid storage**. Every save is atomic and flushed; earlier versions of edited scores, removed scores and a daily settings snapshot are kept in recovery folders you can import again; the Library listing reuses unchanged files; a bounded diagnostics log beside the Library records events, never content; the app warns if its folder cannot be written. [Guide](SOLID_STORAGE_2.41.md) · [Verification](../evidence/solid-storage-2.41-verification.json).

Latest Desktop update: **2.40.0 — Trouble spots**. The app now remembers the bars that slip in Wait for me and Play in time, marks them on the piece map, lists them in Practice tools, on the report card, in Library and in Progress, and drills them at 70% or slower. Three clean passes clear a bar; Forget removes one. [Guide](TROUBLE_SPOTS_2.40.md) · [Verification](../evidence/trouble-spots-2.40-verification.json).

Latest Desktop update: **2.29.0 — Artistic pianist hands**. The generated hand study informed softer peach skin, short satin nails, gently curved fingers, complete wrists and small ivory cuffs with teaching-colour seams. Playing contacts take priority over preparation for the next note; compact keyboards keep natural proportions. 777 tests and six packaged-app checks pass. The verified update is installed. [Hand guide](HAND_ART_2.29.md) · [Verification](../evidence/hand-atelier-2.29-verification.json).

Latest Desktop update: **2.28.0 — Faster companion chat**. The local model stays warm between messages, begins loading when chat opens and unloads after five idle minutes. Follow-ups reuse it; Stop and retry preserve a healthy session. First conversations still have a loading delay. [Guide](CHAT_SPEED_2.28.md) · [Verification](../evidence/chat-speed-2.28-verification.json).

Latest Desktop update: **2.27.0 — Colours and alignment**. Use the palette button beside your companion for Neutral, five named palettes or Match companion. Library adapts beside chat; selection persists without changing your practice controls. [Guide](COLOURS_2.27.md) · [Verification](../evidence/colour-flow-2.27-verification.json).

## Hand motion · 2.42

The hands keep every held key under the fingertip, including a thumb stretched a fifth from the index finger: the hand turns toward it, as a pianist's does. The hand's arch and fingertip angles change as a finger comes to its key and leaves it, not at the instant of the strike; a finger lands in the shape it plays in; and free fingers settle smoothly instead of following every small change. Fingering, timing, cues and the camera are unchanged. See [the hand motion guide](HAND_MOTION_2.42.md).

## Solid storage · 2.41

Your scores, settings and practice journal are plain files in **Desktop / Luma Keys / Library**. Every save now lands whole or not at all. Before a score is overwritten its previous version is kept (the newest five) under **Library / Score recovery / <score id>**; a piece you remove goes to **Score recovery / removed** (the newest ten); and before the first settings write of each day the settings file, journal included, is snapshotted under **Settings snapshots** (the newest fourteen days). Any of these is ordinary Luma Keys JSON: **Import a score** restores a score, and a settings snapshot can be copied back over `preferences.json` while the app is closed. A small log at **Desktop / Luma Keys / Logs / luma-keys.log** records events such as startup timings, failed saves and recognition results, never music or chat. If the Library folder cannot be written, the app says so. See [the storage guide](SOLID_STORAGE_2.41.md).

## Trouble spots · 2.40

Every bar you play in **Wait for me** or **Play in time** is judged, and the piece now remembers the ones that slipped. A bar that slipped in at least two recent passes (weighted towards the latest) is a **trouble spot**: a warm band under that bar on the piece map (point at it for "slipped 3 of the last 5 passes"), a chip in **Practice tools → Trouble spots**, a line on the report card, a **Drill** chip on Library's Continue card and a list on each Progress piece card. **Drill** repeats the spot's bars from the first one and slows to 70% if you were faster, saying so in the dock; three clean passes clear the bar, and **Forget** removes it. Listen & follow and generated exercises are not remembered. See [the trouble spots guide](TROUBLE_SPOTS_2.40.md).

## Practice hands and five-second jumps · 2.26

The hands keep their familiar shape with softer light, quieter skin detail, satin nails and clearer finger numbers. Song-cover colours carry into the piano frame and falling notes. Press **← / →** in Practice to move back or forward five seconds on the song clock; Listen continues and paused practice stays paused. Text fields and other controls keep their arrow keys. See [the Practice guide](PRACTICE_ART_2.26.md).

## Library and transitions · 2.25

Library has a compact resume card, clearable search, **All pieces / Practised / Unplayed** filters and sorting by recent play, title or composer. Resume and saved passages work as before. The app bar stays steady while the selected tab glides between screens; dialogs and chat enter once without overlapping animations. Rapid navigation keeps the latest destination, and Reduce Motion removes these transitions. See [the Library guide](LIBRARY_FLOW_2.25.md).

## Plain interface copy · 2.21.1

Removed remaining decorative slogans from selection messages, colour settings, the empty chat screen and companion artwork captions. Labels now describe the choice or action directly. Music instructions, greetings and controls are preserved. See [the copy notes](PLAIN_COPY_2.21.1.md).

## Companion picker · 2.21

Six compact character cards, a tappable greeting and colour previews replace the large companion poster. Choose applies the character; Match piano sound optionally matches its room sound. The footer stays reachable in small windows. See [the picker guide](COMPANION_PICKER_2.21.md).

## Companion conversation · 2.20

A bundled Qwen3.5 9B model gives the six companions broader conversation, distinct voices and better follow-ups. Chat stays in the small side panel. Conversation options offer thirteen language choices; your choice and recent chat survive reopening. The model runs locally without an account or paid API. First replies can take longer while it loads, and language/factual quality varies. Exact note lessons and practice commands still use the written score and validated app controls. See [the conversation guide](COMPANION_INTELLIGENCE_2.20.md) and `STATUS.md` for installation and verification.

## Mini companion · 2.17

The pet now chats in a compact side panel beside your music. Minimize it without losing your draft, tap it for a heart-wave or musical greeting, and keep using the piano and Library. Chinese/English preferences persist across follow-ups; general replies are shorter and exact practice guidance still comes from the score. See [the mini companion guide](COMPANION_MINI_2.17.md).

## Cartoon covers · 2.16

Fourteen original cartoon illustrations give each known work its own character, setting and palette. The three 晴天 editions have separate solo, duet and concert scenes; starter songs have their own covers too. Open `Assets/Cartoon Covers 2.16/index.html` for the full-size gallery and exact built-in imagegen prompts. See `docs/CARTOON_COVERS_2.16.md` for details.

# Luma Keys

Version **2.14** refines the playing hands with curved resting fingers, an articulated thumb, clearer fingertip numbers and matte shading. Compact keyboards keep the palm visible; fingers release and settle smoothly. See [the hand guide](NATURAL_HANDS_2.14.md).

The September27 collection adds **你离开的事实**, **龙卷风 · 邓紫棋版**, **Moonlight Sonata I**, **Gymnopédie No.1** and **Bach's Prelude in C** to your private Library. All five have complete practice playback and attached original PDFs. The three classics are published in [Practice Sheets](../Practice%20Sheets/) with their Mutopia sources and provenance; the two community arrangements stay in the private Library because their source does not permit reposting.

Version **2.13** gives Library three original illustrated piano scenes, larger artwork, details on demand and a companion who responds to touch. Click the portrait to greet it or its name to open chat. The exact artwork and generation prompts are saved in `Assets/Library Art/`.

Version **2.12** adds a six-layer, lossless stereo Yamaha C5 grand, written articulation, Concert/Written phrasing choices, and natural final-chord decay. Open **Reading settings → Sound**. A coda preview is in `Assets/Audio Previews/`; details and limitations are in [docs/CONCERT_PIANO_2.12.md](CONCERT_PIANO_2.12.md).

A focused, local sight-reading companion.

Double-click **Luma Keys.app on your Desktop**. No account, terminal, internet connection, or paid API is needed for normal practice.

Version **2.9** adds saved companion conversations with streamed, on-device replies, Stop and retry controls, and English/Chinese follow-ups. The companion receives the current bar, a short written-note excerpt and recent messages. Library, Exercises and Progress have quieter spacing and clearer typography. The original 2.9 release used Apple Intelligence through [FoundationModels](https://developer.apple.com/documentation/foundationmodels); no API key or cloud service is used. Practice commands work even when the model is unavailable.

Version **2.8** adds optional accompaniment for each saved arrangement: backing made from its written notes, or an imported recording with tempo and start-position controls. The accompaniment has its own volume and starts with Play.

Version **2.7** adds six illustrated companions, each with coordinated room colours and an optional piano reverb preset. Every companion offers the same local tools for finding saved pieces, resuming practice and setting up a passage. Playing tips use the written score and practice state.

Version **2.5** redesigned the surrounding app: a charcoal toolbar, paper-coloured Library, Exercises and Progress screens, and small cat or bunny illustrations. Dialogs use clear dark text; labels and practice tips are shorter and more specific. The instrument retains the hands, finger guide and satin keys from 2.4. Reduced motion removes decorative movement.

## Find your way around
The app has four screens in the top bar: Practice, Exercises, Library and Progress. Quiet navigation, serif titles, warm instrument surfaces and gentle transitions keep the music central. Reduced motion removes decorative animation.

- **Practice** is one view that fits the window, with nothing on it you do not use while playing: the piece title over one line of details (composer, key, meter, tempo, bars), a switch between Number score, Sheet music and Falling notes, the score, then the **keyboard stage** (the main indicator, see below) and the control dock at the bottom. The dock's top row is the **piece map**: the whole piece drawn as two ribbons, the right hand over the left, lit up to where you are, with a repeated phrase marked and the bars you have played through underlined. Point at it to see the bar and time; click or drag to go there. The row below holds the transport, the three practice modes, the time and bar, hand, speed and volume. When you open a piece you stopped part-way through, **Resume at bar …** appears beside its details. What to play next **and the notes after it** sit in the keyboard stage's header, right above the keys. The **ⓘ** button beside the title opens the piece **at a glance** (key signature, meter, tempo, each hand's range, and anything worth a look first: eighths or sixteenths, dotted rhythms, off-beat entries, accidentals with their bars, the largest leap, chords, meter changes, pickups). **New exercise** appears for generated exercises, or press the **N** key, to make a fresh piece at your saved level. On a fresh library a welcome card offers Level 1 or an import.
- **Exercises** shows the twelve sight-reading levels as cards with your run counts, best result and the recommended next level. Choose a level (and, if you like, a key, hands, length, meter or tempo) and press **Start exercise**; **Start** on any row does the same for that level.
- **Library** opens with an illustrated **Continue** card for the current or last-practised piece. Resume at its saved bar, start again, or open a saved passage. The collection uses large artwork, full titles and compact bar/key labels. Open **Details** for descriptions, source, tempo, note count and practice history. Same-title arrangements remain separate. Click a cover or **Open** to read the piece. The companion portrait responds to touch, Enter or Space; its name opens your conversation without sending a message.
- **Progress** is your practice journal: today's minutes as a ring against your daily goal, days in a row, this week and all time, a chart of the last two weeks, a calendar of the last six months, and every piece you have practised with its time, sessions, the bars played through and where you left it (**Continue** opens it there). Below that are the graded Play in time runs: a trend chart, results per level and the recent runs. **Open** on a run reopens that piece, or regenerates that exact exercise from its seed.

**Import a score** and the settings gear stay in the top bar on every screen. The MIDI status pill turns on when a keyboard is connected.

## Find music and set up practice

Open your current companion in the top bar (**Beethoven** by default). The compact panel keeps the piano available while you chat. It searches your saved local scores and the included starter pieces; matching arrangements appear as choices so you can open the version you want. If a piece is missing, it offers **Import a score**.

Try these in the **Ask** field, labelled with your companion's name:

- `find 晴天` — find matching saved arrangements.
- `where did I stop?` — return to a saved practice bar. Use `resume 晴天` for a particular piece.
- `go to bar 12` or `repeat bars 4–8` — choose a position or practice range.
- `slower` or `right hand` — reduce speed by 5% or practise one hand.

Ask a question such as `How can I feel less nervous at the piano?` or `请给我一点练琴的鼓励。` for a conversational reply. **Help with these bars** uses the app’s written-score guide for exact note, chord and rhythm cues. The header shows whether on-device chat is available. **Stop reply** cancels generation; **Try again** retries the same question. Closing the panel stops an unfinished reply. Chat stays only in memory for the current app session: minimizing or reopening the panel keeps it, while **New chat**, reloading, or quitting clears it. Old saved conversation files are removed on startup. Text-size preferences and practice progress are separate and remain saved. Conversation is shared between companions, with each reply retaining its author. Only a small recent context fits in the model, so this is not unlimited memory.

The local model is small: it can give general or mistaken advice, even with the score excerpt. Use the displayed score and written-score guide for exact pitches, rhythm and hand cues. The characters are fictional companions. They use written-score context, not microphone or camera observations, and their advice can be mistaken. A model reply does not execute app actions. Changing companion keeps the chat and applies the selected room as before. The bundled conversation model runs on Apple silicon. Apple Intelligence is used only by the legacy fallback when the bundled model is absent.

Bar, repeat, speed and hand commands apply directly; opening a piece waits for your choice. Press Play when ready. Short playing tips come from the current score and practice state, including chords, rests and held notes. Turn **Show tips while playing** on or off in the panel.

## Read a piece
1. Open a score from Library or make one on Exercises. **Number score** shows the music from left to right, with separate right/left hands. C4 is middle C; C5 is one octave higher. The ♩ value under a note is its duration in quarter-note beats; it is written where the rhythm changes (and at the start of each bar), not repeated on every note of a run. Simultaneous notes are stacked; each rest also shows how long to stay silent. Notes already played fade, the note sounding now is filled, and the next one is outlined.
   - **With the note runway off** (or the keyboard hidden) the number score takes the room as a **tape**: each line holds as many bars as fit the width (so nothing scrolls sideways), the line you are playing is on top and whole, and the next lines sit below it. When you reach the next line it slides up into place from where your eyes already found it.
   - **Beside the note runway** the score is a **strip** above the piano display: just the line being played, fitted to the width, sized for the piece and never scrolling. Chords are stacked bare numbers, as a numbered score writes them (the runway and keys show which octave); the strip moves on to the next line when the music gets there. If you don't need the numbers at all, **Falling notes** gives the whole view to the piano display.
2. Numbers name pitches: C / Do = 1, D / Re = 2, E / Mi = 3, F / Fa = 4, G / Sol = 5, A / La = 6, B / Ti = 7. These are not finger numbers.
3. Click a number to begin there. Previous/next passage and **Go to bar** move through the score; Previous/Next note let you advance at your own pace on an acoustic piano.
4. Click Play in **Listen & follow**, choose **Wait for me** for a connected MIDI piano, onscreen keys, or computer keys A W S E D F T G Y H U J K, or **Play in time** to read at a steady pulse and be graded afterwards. Wait mode checks pitch, not rhythm. The app does not listen through a microphone.
5. The keyboard stands still: it is fitted once to the whole piece, as large as the window allows, and never zooms or pans while you play (see **The keyboard stage** below). On a phone-sized window, where the keys would get too small, the strip scrolls by hand and required pitches outside the window get explicit direction buttons. Use **Hide keyboard guide** to leave more room for reading at your piano. This choice stays with you while switching pieces during the current app session. Falling notes temporarily reveals the keyboard.

For a short practice phrase, choose **Repeat these bars** above the manuscript. To select a different range, click a bar number and then **Shift-click** its final bar, or edit the bar numbers below the player. The repeated bars are marked on the paper. Previous/Next note cycle within that phrase, and Start over returns to its first bar. Clicking a note, bar, passage or timeline position outside the repeat returns to the whole piece.

**Sheet music** displays the original engraving with a position cursor when MusicXML is available; generated exercises always have one. A desktop window shows eight bars at a time across the page (larger when the keyboard is hidden); a narrow one shows four. **Falling notes** hides the score and gives its space to the keyboard stage's note runway. Use the settings gear for number/solfege labels, tonic, count-in, metronome, companions and themes. Opening Settings pauses practice.

## The keyboard stage: watch the keys
The keyboard is the main thing to watch while you play. It sits between the score and the transport and moves in time with what you hear. With the runway on, the keys and the runway take most of the window; **Falling notes** gives them all of it.

- **A still keyboard, as big as the piece allows.** When a piece opens, the keyboard is fitted to its whole range, edge to edge (the Appassionata's F1–C7 fills the window), and then it stays put: no zooming or panning while you play, so every key is always where you last saw it. Numbers (or solfege or letters) and note names are printed on every key.
- **The hands.** A pair of hands over the keys shows how to play each passage: the suggested fingering (1 thumb, 2 index, 3 middle, 4 ring, 5 little finger), the hand's shape and its position on the keyboard.
  - Small finger badges sit on the illustrated fingertips: a filled badge is pressing now, a ringed one is about to play, and small numbers are at rest. These are fingers **1–5**, distinct from the score's pitch numbers **1–7**. Required keys also expose the suggested finger in their accessibility description.
  - A held key keeps its finger while the others move around it. The hand glides to a new position just before it is needed, and sets off sooner for a long leap. A hand with nothing to play for a while fades back.
  - The fingering is worked out for the whole piece when it opens, like a teacher pencilling it in. It weighs how far each pair of fingers can stretch, thumb crossings (never onto a black key if it can help it), weak fingers, black keys, held notes and how much time there is to move (after Parncutt et al.'s ergonomic model). Scales, arpeggios and chords come out with their textbook fingerings.
  - **Hands** in the keyboard's header shows or hides them (the choice is saved).
- **Hand guidance.** The slim line below the keyboard pairs pitches such as C4 with a circled finger number. **Place** previews a paused attack, **Play** marks an attack while practising, **Hold** means keep that key down, and **Next** previews the next notes during a rest. A chord can say Hold for one finger and Play for another. Missing finger suggestions say **choose finger**. **Finger guide** pauses playback and opens two illustrated hands: choose Thumb, Index, Middle, Ring or Little to see its number. On hands, 1–5 identifies a finger; on the score and keys, 1–7 identifies a pitch. Opening help releases held input; closing it returns focus to its button.
- **Note runway.** Notes fall onto their keys and reach the line at the moment they sound, in time with the audio you hear (output latency included). Bars are ruled and numbered on tabs at the left edge. **Falling notes** makes the runway tall; **Note runway** in the keyboard header hides it (the choice is saved).
- **Easy to read in hard music.** The runway zooms to the piece: its typical short note (sixteenths in the Appassionata) stays tall enough to read its number, and slower music shows more beats ahead. Notes a hand strikes together are tied by a bar where they land, so a chord reads as one shape. The chord to play next is outlined and glows (while waiting, the one to play now). A splash of the hand's colour rises from each key as its note lands. Short notes show just their number.
- **Colours.** The stage is a concert grand in natural colours: a walnut stage lit warmly where the notes land, ivory and ebony keys behind a red felt strip, a wooden rail for the hands and a brass now line. Honey is the right hand and slate blue the left, everywhere: runway notes, lit keys, the hands' badges and the number score. The keys to play now take their hand's colour in full (black keys too), a key glows from its top edge as its note approaches, and, while music moves, a sounding key fills with colour and drains as the note should still be held. Louder written dynamics light keys more brightly, and the header shows the marking in force (*p*, *mf*, *ff*…) when the score has one.
- **Motion.** The hand eases into a new position, lifts between repeated notes, and lowers without a jump. Key caps make shallow presses while their click targets stay still; short ripples mark each attack. macOS Reduce motion turns off hand glides, finger lifts, ripples and key transitions while keeping the current position and feedback readable. Measured frame timing is recorded in `evidence/*beauty-2.4-qa.json`; it depends on the computer and load.
- **Your playing.** Keys you press go down; with a MIDI piano, harder playing shows brighter. **Wait for me** flashes the key green for a right note and rose for a wrong one. **Play in time** flashes green on time, amber early or late, rose for a wrong pitch; keys tried during the count-in are not judged. Listen & follow praises playing along and never scolds free play.
- **Then.** The chord after the one you are waiting for is ringed on its keys.
- **Count-in.** The beats are counted large over the runway, or beside the next notes when the runway is off.
- **Header.** One slim line: what to play next (with its bar) and the notes after it, the status, the written dynamic, the focus, hands and runway switches and the hide button. The piece's at-a-glance details are behind the ⓘ button beside the title.
- **Sustain pedal.** When the score marks the pedal, a gold lane runs up the runway's right edge: *Ped.* where it goes down and a hook where it lifts, arriving at the now line exactly when the foot should move. The **Ped.** lamp in the header lights while the pedal should be held.
- **Accents.** A note written louder than the music around it in the same hand (an *sf* or accent) lands with a gold edge and a small **>**, so the accents of a piece like the Appassionata are seen coming.
- **Dynamics.** The written dynamics come down the runway's left edge, beside the bar numbers: the marking (*pp* … *ff*) where a new level begins, and a hairpin labelled *cresc.* or *dim.* where the music swells or fades from one level to the next. They are read from the notes' written loudness, so they follow what you hear. The header shows the marking in force.
- **Focus.** The arrows at the right of the keyboard's header hide the top bar and the title so the runway and keys have the whole window; the same button or **Esc** brings them back.
- With reduced motion, the verdicts and lights still show, without animation.

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

Choose from six companions. The artist companions are original stylized app characters; all six use the same local search, practice commands and score-based tips.

| Companion | Room | Colours | Optional sound |
| --- | --- | --- | --- |
| Beethoven | The walnut study | Amber and ink | Room |
| Lang Lang | The concert room | Midnight navy and porcelain | Hall |
| Mozart | The porcelain salon | Ivory and dusty plum | Dry |
| Liszt | The midnight salon | Oxblood and ink | Hall |
| Luma the cat | The garden room | Sage and cream | Room |
| Mochi the bunny | The rose room | Rose and cream | Room |

Click your current companion, then **Change companion**, or open **Settings → Companions**. Click a portrait to preview its room. Leave **Use room sound** checked to apply its reverb preset, or uncheck it to keep your current sound. Press **Choose [name]** to apply the selection. Your piece, reading position, repeat range, hand and speed stay as you set them.

Choosing a **Colour** in Settings overrides the companion's room palette. **Restore [name]'s colours** restores that palette without changing the piano sound. Your companion and colour choices are saved for the next launch. **Show tips while playing** in the companion panel, or **Companion tips** in Settings, controls the short playing tips.

### Settings that stay
Settings is one dialog with cards for Reading, Timing, **Sound** (Dry, Room or Hall), your **Daily goal** (5–120 minutes; Progress draws today's ring against it), **Colour** (five themes in natural tones, each shown as a little practice scene: Moon garden, Lavender dusk, Rose nebula, Ocean deep and **Concert grand**, brass on walnut like the keyboard stage) and Companion & help (Companions, the reading guide and the keyboard shortcuts). Key labels, **Number 1 is**, count-in, metronome, the daily goal, the hidden keyboard guide, the hands, the music view, practice speed, mode, hand, whether the other hand plays along, and your exercise choices are saved with your settings and restored at the next launch. **Number 1 follows the key** in Settings makes number 1 the tonic of each piece automatically (for movable-Do reading); off by default, so C stays 1.

## Bring your sheet music
Choose **Import a score**, or drag a file into the import dialog. PDF, MusicXML (.musicxml/.xml/.mxl), MIDI (.mid/.midi), and exported Luma JSON are supported. The maximum is 30 MB.

PDF recognition runs on your Mac using bundled Audiveris. Printed, straight, high-contrast scans work best. Recognition is not perfect: compare the recognized notes and the original PDF in the review window. You can change each note's pitch, octave, timing, duration, or hand. Click **Save & mark reviewed** once you have checked it. Recognition errors are shown rather than replaced with invented notes.

A PDF can keep reading while you close the import panel and practice. **View imports** brings back progress, including after a window reload. **Cancel recognition** stops the reader and keeps the PDF. Quitting the app also stops recognition; reopen and choose **Retry recognition** to continue from the saved original. A finished background import waits for you to choose **Review notes**. **Dismiss** hides its notice without deleting your PDF or music.

MusicXML/MIDI exports from notation software are more reliable than scans. Unsupported or simplified score features are noted in the review window. Voices that move between staves are flagged: staff position does not always tell you which hand should play, so review those hand colors. Repeats and navigation may play once in written order; use the bar loop to repeat a passage. Fingering is a suggestion, not a teacher-verified technique: unsupported shapes can omit suggestions so a held finger is never assigned another key. The app does not listen to an acoustic piano through a microphone.

Older practice backups with missing timing fields are restored from their notes and flagged for review. Check silent bars and the ending against the original sheet. Invalid pitches or rhythms are rejected with a clear error. If a saved file is damaged, the rest of your library still opens: the recovery notice lists the affected files, leaves them untouched, and lets you check again after restoring a backup or reimporting your music.

If saved settings are damaged, a separate recovery notice shows which fields use defaults. Valid themes, companions, mute and practice totals are retained. Opening the app leaves the original settings file untouched; the first saved change keeps an exact copy in `Library/Settings recovery/` before saving usable settings. You can also choose **Save recovered settings**. Normal desktop Quit and window close also record active practice time and finish pending saves. If the file cannot be opened, a lasting notice explains that changes are temporary and offers **Reload saved settings** after access is restored. Practice and preference controls wait until initial settings loading finishes.

## Accompaniment · 伴奏

Click **伴奏** beside the transport controls. Accompaniment starts **off** and is saved separately for each arrangement. For a generated exercise, choose **Keep in library** first.

- **From the score:** choose **Match the piece**, **Acoustic pop**, **Piano duet** or **Soft strings**. These use the written supporting-hand notes. Acoustic adds octave bass and a quiet generated beat; it does not infer missing chords. On a melody-only score, select Acoustic explicitly for a beat without added harmony.
- **Audio recording:** import a matching backing track, set **Recording tempo** and **Bar 1 starts in the audio at**, then enable it. Use the same arrangement and bar order. Files stay on your Mac.
- **Accompaniment volume** changes the backing mix separately from your piano. Close the panel and press Play in **Listen & follow** or **Play in time**. Backing stays paused in **Wait for me**.

The score-based option is a practice arrangement. For a particular recording's instrumentation, use its matching instrumental audio. See [Accompaniment setup and limits](ACCOMPANIMENT.md) for alignment, style details and file storage.

## Practice controls
- **Listen & follow:** automatic sampled-grand-piano playback with the reading position highlighted.
- **Falling notes:** fast passages show a closer preview; note lengths stay proportional to duration and repeated notes remain distinct. Number-score spacing adapts for legibility, so use the written ♩ values to count.
- **Wait for me:** the timeline stays on each onset until the expected notes are found. Chords require every displayed pitch. Accuracy counts note attempts, not rhythmic skill.
- **Play in time:** count-in, click and a moving cursor at tempo; pitch and timing are graded afterwards, bar by bar, with a repeat offered for the weakest bars.
- **Hands:** isolate left or right; imported MIDI hand assignments may need review. Practising one hand, the piano can **play the other hand softly** (the waveform button beside the hand menu, on by default) in Listen & follow and Play in time, so a hand learned alone still sits in the music. Wait for me waits for your hand only.
- **Loop:** repeat the selected bar range. New MIDI and MusicXML imports preserve changes in bar length. Wait mode stays inside the selected phrase; an empty phrase prompts you to choose another hand or widen the loop.
  - **Speed up each pass** (in the phrase row) makes Listen & follow play the phrase 5% faster each time round, up to full speed: start at 60% and let it climb.
  - **Keep bars a–b** saves the phrase as a passage for this piece. Passages appear as chips in the phrase row (click one to repeat it, × to forget it), as gold marks along the top of the piece map, and on the Library's Continue card, which opens the piece already repeating that passage. Up to twenty per piece, kept in the practice journal.
- **Speed:** 25–125% in 5% steps without changing pitch: the tortoise and hare beside the speed menu (or **[** and **]**) step it down and up. `♩ =` shows quarter notes per minute; a piece that changes tempo shows its opening and closing tempo (`♩ = 144 → 180`). Written tempo changes are played, and the speed setting scales them all.
- **As written:** playback follows the score's tempo marks, its dynamics and accents, and the sustain pedal (a note released under the pedal rings until the pedal lifts).
- **Sound:** the sampled grand grows brighter as it is played harder (and darker when soft), each note sits across the stereo field where it is on the keyboard, and **Settings → Sound** places the piano in a room: **Dry**, **Room** (a warm studio, the default) or **Hall**. The numbers, runway and keys keep each note's written length. Count-in and metronome follow the written meter: for example, two dotted-quarter pulses in 6/8. A small hint shows the pulse count. Short pickup notes enter after the appropriate partial count-in.
- **Number 1 is:** C is fixed Do by default. Choosing another tonic changes number labels, not the sounding notes.
- **Keyboard:** large keys that follow the music (see above); scroll to reach the whole piano. Arrow keys move keyboard focus; Enter/Space plays the focused key.
- **Export icon:** saves a printable numbered practice HTML and reusable JSON backup to the Exports folder. Open the HTML in a browser and choose Print / Save PDF.
- **Space:** play/pause when focus is outside an input or button. **,** and **.** step to the previous and next note, **[** and **]** change the speed, **N** makes a new exercise, and **?** lists every shortcut. A–' play C4–F5; the black keys use W E T Y U O P. These note keys also work after clicking Play or moving a volume/timeline slider. Typing in a text field or dialog stays silent.

Computer, onscreen and MIDI keys can be used together: releasing one input does not cut a pitch still held by another. A loop keeps live notes and sustain sounding across its boundary. The last note in **Wait for me** rings until you release it. Pause/Start over clears notes and sustain; switching away cancels pending key sounds. MIDI connection changes release only the disconnected input. MIDI input currently handles note-on/off and CC64 sustain; other controller messages are not interpreted.

In **Lessons**, Für Elise now includes a two-hand opening excerpt with its 3/8 pickup, rests, engraved sheet music and a three-step practice path. Start with one hand at 50%. App bar 1 is the pickup, so the left hand enters in app bar 3. The excerpt ends after the first ending without repeating. Its corrected MusicXML, printable numbered HTML and PDF are in `Practice Sheets/`.

## Files you own
- `Library/`: imported scores, original PDFs, recognition output, and practice settings, including the practice journal (minutes per day and per piece, the bars played through and where each piece was left, in `preferences.json`). Back this up.
- `Library/accompaniment/`: imported backing audio and its file metadata. Include this folder in Library backups.
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
