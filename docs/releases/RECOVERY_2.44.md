# Recovery and a steadier backend · 2.44

Since 2.41 Luma Keys has quietly kept the earlier versions of edited pieces, the pieces removed from the Library and a daily snapshot of the settings file (which holds the practice journal). The only way back was **Import a score**, which gives the piece a new id and leaves its practice history behind. 2.44 puts all of it within reach in the app, and hardens the local server behind it.

## Getting things back

- **Recently removed** (bottom of the Library). The newest ten removed pieces, with their composer, length and when they were removed. **Restore** puts a piece back under its own id, so its practice history, trouble spots and saved passages reconnect ("… is back in your library, with its practice history"). A piece already in the Library (for example after Undo) is marked as such; a damaged copy is listed but cannot be restored, and is left untouched.
- **Earlier versions** (a piece's ⋯ menu, shown when versions exist). Each version is listed with when it stopped being current, its bars and notes, and how its note count differs from now. **Restore** is an ordinary save: the version being replaced is kept in the same list, so a restore can itself be undone. The piece open in Practice follows at once.
- **Settings history** (Settings). Your settings and practice journal as they stood at the start of each day, for the last fortnight, with sessions, minutes and pieces practised. Restoring asks once ("Replace my settings"), keeps the settings it replaces as a "Before a restore" entry (the newest five), and applies the restored settings without restarting.

Under the hood these are five small routes (`src/recovery.mjs` and the settings routes in `server.mjs`). File names are matched exactly, so nothing outside the recovery folders can be named; a copy is restored only when it validates as a score whose id matches its file; a removed piece is moved back with an exclusive link (or an exclusive copy on disks without links), so it can never overwrite a piece that is already there; a settings restore runs in the same ordered queue as every other settings write.

## One write at a time per piece

Saves, removals and restores of the same piece now run in the order they arrive (a small queue per piece in `server.mjs`). Before, twelve saves of one piece arriving together all read the same "previous" file, so the five earlier versions kept were five copies of one, and whichever write finished last won rather than the last one sent; a save racing a removal could land either way. Recovery file names are also unique within the process, so two saves in the same millisecond can no longer share a version name. A test sends twelve saves at once and checks that the kept versions are all different and none is the current one (it fails without the queue).

The Recently removed and Earlier versions lists reuse what they read of each copy while its size, modification time and inode are unchanged, so opening the Library does not re-read megabytes of removed pieces each time; a copy changed or removed by hand is noticed on the next listing.

## From an audit of the backend

A read-only audit of the local server found these; each was reproduced before it was fixed, and each has a test.

- **Recently removed kept the wrong ten.** Removed pieces are named by their id and the time, and the oldest were pruned by sorting the names — that is, by id. With the random ids real pieces have, removing an eleventh piece could delete a piece just removed, before its Undo had expired. Pruning and the list now use the time in the name; a test removes twelve pieces with random ids and checks that the ten most recent are kept, newest first. (The personal Library had no removed pieces yet, so nothing had been lost.)
- **Chinese file names arrived garbled.** The upload parser read file names as Latin-1, so `月光 · Moonlight.musicxml` became `æå Â· Moonlight`, and that became the piece's title (and a PDF import's name). Names are now read as UTF-8.
- **An odd sub-folder stopped the app from opening.** A file where `Library/accompaniment` or `Library/imports` should be, or an accompaniment folder that is a link elsewhere, made startup fail with a stack trace. Now accompaniment audio or PDF import is simply unavailable (logged), playback refuses a linked folder, and both are checked again when used.
- **Failures are described by whose side they are on.** A full disk answers 507 ("Your disk is full, so this could not be saved…"), a Library that cannot be written 503, any other fault 500 with plain words; only a reader's invalid file or setting is a 400 with its own explanation. Before, everything was a 400 carrying the raw system message (for example the full path of a temporary file), and the log recorded the server's faults as the reader's.
- **A removal that could not keep a recovery copy said nothing.** It still removes the piece, and now says that no copy was kept, so Undo is the way back.
- **Interrupted writes left large files behind.** An accompaniment upload cut off by quitting left up to 100 MB in a hidden temporary file, and temporary files in the import, recovery, snapshot and export folders were never swept. All are swept at startup now.
- **The diagnostics log could fall silent.** One failed rotation made every later entry fail, and a log folder that could not be made once was never tried again. Both recover now.
- **Two servers on one Library.** A development server started without its own data folder uses the same Library as the app; the two would keep separate settings queues and one's startup sweep could delete the other's file mid-write. A server now notes itself beside the Library (`Logs/server.json`); a second one on the same Library, while the first is still running, skips its sweeps and the app says "Another copy of Luma Keys is using this Library…". A marker left by a crashed server is ignored.
- **Quitting waits for writes under way**, and a settings restore can no longer be undone by a save queued just before it.

Noted, not changed: the Library listing sends every piece in full (7.2 MB for this Library's twelve pieces, about 50 ms on the server) each time it is refreshed; original PDFs and recognition output of dismissed imports, and the versions of removed pieces, are kept until removed by hand.

## Hands

The hand's correction rounds no longer accept a step that carries a held key that is still being missed further away. Before, a cheap turn of the wrist could swing the hand between two fits from one frame to the next, and up to its tilt limit, while nothing in the music changed (Appassionata III, bars 32–34). Across the twenty measured hand-passages every held key is now reached within 0.5 mm (one passage had missed by 3.3 mm), visible jerks fell from 48 to 44, and the largest single-frame jumps fell sharply in several passages (Truth That You Leave, left hand, 78.5 → 15.9 mm; Gymnopédie, left, 64.0 → 24.9 mm; Moonlight bars 30–32, left, joint 57.9° → 23.5°). One measured cost: in the octave test's first landing the hand moves 8.2 mm in a frame (was 7.6 mm), and the Moonlight right hand's index-abduction flip moved four frames later and grew from 41.8° to 55.2°; both are recorded in the tests and STATUS. `scripts/hand-continuity-batch.mjs` runs all twenty passages in one command.

## One command for the packaged regression net

`npm run qa:native` runs every runnable packaged-app story one at a time, prints one line per story and writes `evidence/native-sweep.json`; `npm run qa:native -- reader` runs only the stories whose name contains "reader".

Each story has a 180-second deadline (240 seconds for the reader, full native flow and recognition-close stories) and an 8 MiB output limit. Exceeding either stops that story's QA process group and detached descendants identified through its live parent tree, and records a distinct failure. Stage performance failures return a failing exit status; hand-motion captures reject with the missing key and elapsed time if their keyboard disappears.

For an exact subset, use `npm run qa:native -- --stories native-reader-qa close-qa`. Add `--output-dir .qa-runs/my-sweep` to keep the runner's logs and summary in that folder; the individual stories still write their usual evidence files, so preserve those first when comparing runs.

Library-access QA pauses the packaged app at main entry to install its dialog answer before startup continues. This avoids racing a synchronous native dialog and keeps both Try Again and Quit evidence in the owned QA roots without modifying the package.
