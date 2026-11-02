# Luma Keys 2.23: expressive playback, a companion that comes along, livelier panels

## Expressive playback, tailored to each piece

`src/interpretation.mjs` builds one playback-only plan per score. Pitches, written rhythm and notation are never changed; **Written** (Settings → Sound) stays literal and steady.

Each piece gets a **character**, picked from the score file's own `performance.character`, known titles, or its composer/tempo:

| Character | Pieces | Touch |
|---|---|---|
| Nocturne | Gymnopédie No. 1, Moonlight I | Singing top line, deep harmony pedal, lingering phrase ends, rolled wide chords |
| Ballad | 龙卷风, 晴天, 你离开的事实 | Restrained verses, opened choruses, pedal through each harmony, phrase breaths |
| Baroque | Prelude BWV 846 | Steady pulse, harmonic swells, light pedal |
| Dramatic | Appassionata III | Driving pulse, strong downbeats, written pedal only |
| Clear | Short lessons and exercises | Even, with a little phrase shape |

The plan contains:

- **Phrasing.** Four-bar phrases (restarting at sections, split at mid-phrase holds) swell toward a high point just past the middle.
- **Rubato.** The tempo breathes at phrase ends, slows into the final cadence, and holds written fermatas and *rit.* marks. It applies only in **Listen & follow**, as a tempo map, so falling notes, the cursor and the audio stay locked together. Under a generated backing the curve is steadier; against an imported recording it is off. Wait for me and Play in time keep the written pulse.
- **Voicing.** The top line sings. Inner voices and arpeggio figuration step back, and bass notes lean slightly.
- **Section dynamics.** These are inferred from texture (density and register), or taken from the score's `performance.sections`. The written average loudness is kept.
- **Touch.** The melody leads its chord by about 12 ms, and chords wider than a tenth roll upward. Repeated notes get small, fixed variations, so no two repeats are machine-identical.
- **Pedal.** A harmony-following legato pedal is added where a score marks none. It changes on each bar line and wherever the bass changes. Rhythmic, rest-filled bars such as band hits stay dry, and written pedalling is always kept.

## 龙卷风 · 邓紫棋版

All 71 bars were re-checked against the six-page EOP PDF at 300–600 dpi, and every pitch, accidental, rhythm and tie matches. The printed score has **no dynamics, pedal, slurs or articulation**, and the saved file played all 1,818 notes at one velocity with no pedal. That is what made it sound flat and disconnected.

`Library/tornado-gem-eop-8188.json` now carries an editorial `performance` block. It is a playback plan, not a correction of the score:

- intro hits (bars 1–2 and 6) stay dry
- verse 1 (bars 7–14) is held back
- the pre-chorus (15–18) builds into chorus 1 (19–26)
- verse 2 and pre-chorus 2 (27–34) lead into a fuller chorus 2 (35–42)
- the bridge (43–50) builds to the glissando, then comes the final chorus (51–58)
- the post-chorus eases down (59–62), the closing is soft (63–66), and the coda has a wide ritardando (67–71)

The notes, the MusicXML and the original PDF are unchanged, and a restore copy is in `.qa-runs/claude-2.23-backup/`.

The **Acoustic pop** backing now follows the piece. The bass plays one note per harmony instead of shadowing the left-hand arpeggio, with a lighter pulse on beat 3. The kit plays with the written intro stabs, stays sparse in verses and adds a push in choruses. The last bar ends on one hit.

## The companion comes along (`CompanionBuddy.jsx`, `buddy.mjs`)

Your chosen companion now stays with you from launch to the last bar. It never starts audio, sends messages or changes practice.

- It greets you on launch, then follows the pointer along the edge of the window and peeks in when you're far away. It steps aside from buttons and fields and never covers a control.
- It hops along when you change screens, with a line for each screen.
- It perches on open panels: the accompaniment panel, settings and import. It reacts to your choices there, such as turning the band on or off, each style, and very loud or very soft volume.
- It dances to the beat while music plays and says the occasional word: mode tips, halfway, every 16 bars, streaks of right notes, and a gentle word after a slip in a good run.
- At the end of a piece it walks to centre stage and bows with confetti. It also celebrates reaching the daily goal.
- It dozes after a quiet minute and wakes up when you come back.
- Click it for hearts and a tip, or double-click to open the chat.
- Turn it off in Settings → Companion & help → **Companion follows me**. It hides while the chat is docked, and reduced motion is respected throughout.

## Livelier interface

- **Accompaniment panel:** an animated band stage showing who's playing (guitar, bass, drums, piano, strings or a record) with stage lights and a level meter. There's a spring-loaded on/off switch, cards that lift on hover with iconography and a pop-in check, and instrument chips. A **Hear two bars** preview plays the backing with the written piano part from the current bar. The volume slider has a live fill.
- **App-wide:** screens slide in, library cards and progress panels settle in with a stagger, covers zoom gently on hover, and controls respond to presses. The selected navigation icon pops, and the Play button pulses while playing.

## Verification

- 488 unit/API tests pass, including new `tests/interpretation.test.mjs` and updated `tests/backing.test.mjs`. `vite build` passes.
- In the browser, checked against a copy of the library (`.qa-runs/claude-2.23/Library`): companion greeting and edge-following, control avoidance, perching on panels, the accompaniment panel (switch, styles, instrument chips, preview scheduling 31 backing events), Listen playback of 龙卷风 with rubato through the final cadence, the finish celebration, and the Library, Progress and Settings screens. No console errors.

## 2.23.1: friendlier hands, layout fixes, softer look

- **Hands** (`src/hand-draw.mjs`) are redrawn as a simple illustration: a rounded palm under the knuckles that widens as the fingers spread, chunkier tapered fingers with small nails and creases, and a thumb that joins the side of the palm with a gentle bend. On wide chords and octaves, the palm's thumb and little-finger sides stretch toward the reaching finger instead of growing long thin tubes. Fingertip contacts, the press and prepare markers and the finger numbers come from the pose engine unchanged. During playback, 54 of 54 sampled pressing fingertips sat on a lit key, and falling notes were 0 px off their keys.
- **Chat options** now open in the normal flow under the companion heading. They no longer cover the header or the conversation.
- **Short windows:** the title and the view switch share one row down to 860 px wide, so the transport no longer drops below a 1024×700 window.
- **Sheet follow** turns the page: the current line goes to the top, so the next lines are visible and no half-cut line is left above.
- **Companion** avoids sheet music, number scores and the keys as well as controls. While music plays it peeks from the edge and steps out only to speak.
- **Look:** a rounder stage and modals, pill-shaped choices, a round Play button, rounder note blocks and theme-coloured focus rings (`src/cute.css`). The layout and controls are unchanged.

## 2.23.2: transitions everywhere

Every visible change animates, using View Transitions (`withTransition` in `App.jsx`) and `src/transitions.css`:

- **Screens** slide toward the tab you chose. The top bar stays still, and the score and stage leave with their screen.
- **Panels** (settings, accompaniment, import, results) pop up over a fading backdrop and shrink away on close.
- **The companion chat** slides in from the side while the stage glides to its new width.
- **Notices** rise in and drop away.
- **Selected pills** in Listen/Wait/Perform and Numbers/Sheet/Falling notes slide to the new choice.
- **Drawers** (Practice tools, Score tools) open and close with CSS `@starting-style` and discrete `display` transitions, and their chevrons turn.
- **A new piece** settles in: its title, score and stage rise softly, one after another (Web Animations, so the dependent seek and resume logic stays synchronous).
- **Changing text** eases in on every update: the next-note cue, the finger-guide notes, the status line, the resume chip and the loop range.
- **While music plays**, panels, notices and pills animate only themselves. The page beneath stays live, so falling notes never ghost or freeze.
- **Reduced motion:** with it on, everything changes instantly.

Checked with headless Chromium frame captures mid-transition (`.qa-runs/claude-2.23.1/frames/`) and functional checks that every change still applies. 490 tests pass.
