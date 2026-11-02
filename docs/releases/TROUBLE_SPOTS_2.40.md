# Trouble spots · 2.40

Wait for me and Play in time already judge every bar you play, and the report card shows where a run broke down. Until now the app forgot all of it when the piece closed. A teacher remembers: "bars 45–46 again". This update gives the app that memory, shows it where decisions are made, and turns it into a drill.

## What the app remembers

Each piece in your practice journal keeps a short memory per bar: how many judged passes it has had, how many slipped, the outcome of the last eight passes (latest last) and the day it was last judged. A pass is judged once per bar:

- **Wait for me** judges a bar when you move on from it (or when you stop in it, or when a one-bar repeat comes round). It is clean when nothing wrong was pressed in it.
- **Play in time** judges every bar a graded run covered. It is clean when nothing was missed and nothing extra was played. Timing is still reported on the card but is not remembered as trouble, because a late note is not a wrong note.
- **Listen & follow** judges nothing. Generated exercises are not remembered either: their bars are new every time.

A bar becomes a **trouble spot** when at least two of its recent passes slipped and its recency-weighted slip rate is 40% or more, so the latest passes count most. Three clean passes in a row clear a bar. Troubled bars that sit next to each other (or one bar apart) form one spot of up to four bars; the strongest spots come first, then the most recent.

The memory lives in the settings file with the rest of the journal (`journal.pieces[id].spots`). It is read like everything else there: a damaged bar is dropped and reported as a journal issue, while the piece's minutes, bars and passages survive. A piece keeps at most 240 bars, troubled and recent ones first. Removing a piece or replacing it with a shorter edition does not rewrite the memory; bars past the end are simply not shown.

## Where it shows

- **The piece map** in the Practice dock marks each troubled bar with a warm band under the ribbons, stronger the more it has slipped. Pointing at one adds "slipped 3 of the last 5 passes" to the bar-and-time tip.
- **Practice tools → Trouble spots** lists up to three spots as chips ("Bars 45–46 · slipped 5 of the last 6 passes") with a Drill action and a Forget button. The Tools button summarises "· 2 trouble spots" when nothing else is on.
- **The report card** says "Bar 45 is a trouble spot · slipped 2 of the last 4 passes" under "Most misses", once the bar has a pattern rather than a single slip.
- **Library**'s Continue card offers the same spots as **Drill** chips beside the saved passages.
- **Progress** lists each piece's trouble spots with the number of bars cleared, and its piece map shows the warm marks. Both open a drill directly.

## Drill

Drill repeats the spot's bars (the existing repeat, so Previous/Next wrap inside it and the manuscript marks it), moves to its first bar, and slows practice to 70% if it was faster, saying so in the dock: "Drill bars 45–46 at 70% · Space plays". Nothing else changes: mode, hand, labels and accompaniment stay yours. From Library or Progress the drill opens the piece the same way. Three clean passes clear the spot and the chip disappears; Forget removes it at once.

## Verification

- `tests/trouble-spots.test.mjs` covers recording, the recent window, weighting, clearing, grouping and splitting, ordering, forgetting, validation of damaged memories and pruning. `tests/journal.test.mjs` and `tests/preferences.test.mjs` cover the journal and settings round trip.
- `node scripts/trouble-spots-qa.mjs` drives a four-bar fixture with computer keys on an isolated library: a fresh piece has no spots; one slip is remembered but is not a spot; two slips make the mark, the chip and the summary, kept across a reload; Drill repeats the bar at 70% and says so; three clean passes round the drill clear it; two graded runs with a wrong note judge the bar and name it on the report card; Library and Progress offer the drill and open it at 70%; Forget removes it from the drawer, the map and the saved journal. `node scripts/native-trouble-spots-qa.mjs` runs the same story in the packaged app.
- The piano's output is muted in both harnesses. Computer keys stand in for a piano; physical MIDI, the microphone and the chat model are outside this change.
- Since 2.39 the piano volume and mute live in the Practice tools drawer, which had quietly broken the first step of most browser and native harnesses (they last passed on 2.2.0). `scripts/piano-volume.mjs` opens the drawer for the slider and fourteen harnesses now use it; the hand-guide story focuses the dock's song-position slider instead. Three harnesses remain drifted for other reasons and are listed in STATUS.md.

## Limits

A bar is judged by what reached the app: in Wait for me a bar you seek away from part-way through still counts as a pass. A judged pass is a whole bar, so a long bar with one slip and a short bar with one slip weigh the same. The memory is per edition of a piece; two arrangements of the same song keep separate spots. Nothing in this update changes the fingering, the hands, playback or the grading itself.
