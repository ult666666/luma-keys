## October 7 — fortify 2.43 installed

The user asked to continue fortifying everything. Product changes, each covered by tests:

- **Crash containment.** Each major part of the window has its own error boundary (`src/ErrorBoundary.jsx`): keyboard and hands, number score, sheet, original PDF, Exercises, Library, Progress, companion chat, accompaniment and the roaming companion. A failing part shows "… hit a problem. Your music, settings and practice are safe." with Try again while the rest keeps working; a new piece resets the score-bound parts; anything outside every part gets a full-window notice with Reload. Faults are logged as `renderer-error` (part and message, never content). Exercised in the development build by injected faults (keyboard and Library contained, Try again restored, logged); production builds carry no injection hook.
- **Settings forward compatibility.** `PUT /api/preferences` carries fields this version does not know (top level, stats, reading, journal, days, pieces) across every write (`mergeUnknownPreferences`), so going back to an older build no longer drops what a newer one saved.
- **No launch-time settings write.** Every launch had rewritten `preferences.json` (recorded at the 2.40 install): hydration stored the companion's last-seen day and derived a legacy colour flag differently from the save path. Launch now writes nothing until something changes. In the packaged app valid, partly damaged, null and truncated settings files, and legacy files in the accompaniment, grand, companion and conversation stories, stay byte-identical through launch and reload; the reopened personal app left all 108 personal files unchanged.
- **Library folder that cannot be opened.** Instead of a stack trace and quit, the app explains the cause (macOS Files and Folders permission, a file in the folder's place, a read-only disk), names the folder, says nothing was changed and offers Try Again / Quit (`library-access.cjs`, `LibraryUnavailableError` in `server.mjs`). The new `scripts/native-library-access-qa.mjs` checks both answers in the packaged app with a file in the folder's place. The macOS privacy denial itself was not reproduced.
- **Read-only Library.** A new unit test found that a Library that can be read but not written did not start at all: the accompaniment store created its folder at startup (Multer creates a string destination synchronously) and PDF recognition read a missing imports folder. Both are now tolerant, the imports folder is optional, and importing into such a Library fails with an error while nothing is written.

**906 unit/API checks pass** (four new). **All 23 runnable packaged-app stories pass on 2.43.0 in one sequential sweep**: native-qa (28 checks, including both settings recovery stories), input 12, reader 9, material 7, keyboard stage 17, accompaniment 11 groups, grand, companion 9, conversation 12, maestro 9, studio design 8, hand beauty 6, hand guide 8, continuity, phrase practice 10, sight reading 5, stage performance, storage 4, trouble spots 7, transition 2, library access 3, close (quit, window-close, failed save) and recognition close (quit, window-close, force-quit). Most had failed since 2.2–2.38 on interface drift; two helper agents ported the chat, companion and studio-design stories under the same rules (no product changes, report bugs rather than work around them) and found no product bugs. Where the product was deliberately redesigned the stories now assert the new behaviour with a dated comment: Practice-first start, lessons as Library pieces, meter and tips in Settings, colours as a reading choice (legacy files open neutral), keys capped by the 3-D hands' proportions (28 px at 1280×800), a shorter runway since 2.39, instant key presses with per-attack splashes hidden under the 3-D hands, focus rings on the key face, a short Play-in-time stop as a pause notice, expressive playback by default ("As written" for exact-length checks), the docked temporary chat (Escape minimises), and held keys judged by the 3-D contact point (C3's contact sits 4.2 px from the key centre and drifts 0 px; the old 3 px rule measured the fingertip's projected underside). Historical acceptance suites, pinned to their versions and not part of the net: native-conversation-model-qa (2.9), native-coach-qa (2.10), native-library-illustrated-qa (2.13). New shared helper: `scripts/settings-ui.mjs`; the chat helper is `companionChat` in `scripts/maestro-checks.mjs`. Guide: `docs/FORTIFY_2.43.md`.

Observations, not changed: at 1280×800 the number view's runway is about 50 px (a beat and a half ahead) and Falling notes' about 150 px, because the 3-D hands' bed takes space below the keys; Twinkle's keys are 28 px there for the same reason. The `.key-resonance` styles in `src/keyboard-guide.css` are unused since the in-key resonance was retired.

Installed and reopened `~/Desktop/Luma Keys.app` **2.43.0**, ASAR `64deb3a5a11ec37084295b149c935c5124aa873ddb77a0fafe51f5ee0e418ad2`, all 3,035 bundle entries matching the staged candidate. The 2.42 app had been idle since its own reopening (no personal file or log event since) and was quit normally first. All 108 personal files were byte-identical before the quit, after installation and after reopening. The reopened app reports 2.43.0, a writable Library, no settings issues, server ready at 746 ms and window loaded at 1,224 ms by its own clock (55 s on the wall clock, the known first launch of a new bundle). The previous 2.42.0 app is recoverable in `.qa-runs/claude-2.43.0/`. Evidence: `evidence/fortify-2.43-verification.json`, `evidence/native-library-access-qa.json` and the refreshed native story reports. No new schedule.

## October 7 — regression net restored (after 2.42 install)

The stories that had drifted since 2.2 (phrase practice, sight reading, resume audio, overlap motion) now pass again, in the browser and in the installed 2.42.0 package. No app code changed; only the harnesses, which had kept the 1.x/2.2 interface. Other stories (backing, companion, conversation, maestro, material, keyboard stage, studio design, the original native-qa) received only the shared helper changes and were not rerun in this pass:

- **Phrase practice** (browser and native, 10 checks) and **sight reading** (browser and native, 5 checks): first green runs since 2.2.0. They now open the Practice tools and Piece drawers for the repeat range, review and New exercise; open pieces from the Library's cards; drive the 2.33 Exercises shelf (level cards, Customize, segmented length); read the status from the companion's live line when tips are on; read the 2.x report card (its sentence and rings); open Progress's graded-runs disclosure; and count the selected level's runs from the saved history rather than assuming an empty one.
- **Resume audio**: it asserted the pre-2.12 release tail. It now plays the held note with written phrasing and computes each expected voice length with the app's own `planPianoStart`, `pianoNoteSeconds` and `damperRelease` (4.339 s for the eight remaining beats, 2.699 s for the loop carry; the old constant assumed 4.46 s). All three sustained-note checks pass within their original tolerances.
- **Overlap motion**: it counted a per-key resonance animation the 2.4 stage no longer renders. It now records the landing element the stage adds per new voice. Because the stage also renews that landing when playback starts a new epoch, its claims are stated relatively: every onset adds a landing; a short note ending, a live key's release, a pause and the final stop add none; every landing is a new element; all 88 key buttons keep their identity.
- **Native continuity** (resume audio, overlap motion, chord reading) passes on the packaged app. Hand guide (8 groups), storage (4) and trouble spots (7) pass natively as recorded above.

Shared helpers: `scripts/practice-tools.mjs` (`setLoopRange`, `openReview`, `clickInPieceTools`), `scripts/piano-input.mjs` (`connectMidi`), `scripts/library-open.mjs` (`openFromLibrary`) and `scripts/piano-volume.mjs`; about twenty harnesses use them. Evidence: `evidence/regression-net-2.42-verification.json`.

Next hand finding, not shipped: while a finger approaches a key beside a held one (Appassionata bars 32–34, right hand), the placement fit turns, tilts and rolls the hand to its limits, because a rotation costs it almost nothing, and the hand snaps back when the finger lands (one eased frame moves 13 mm and a free little finger 58°). Stronger orientation priors and costlier turning were tried on the probe; each helped two passages and hurt two others, so neither was kept. A proper fix needs the aim's pull to stop driving orientation, measured across all 20 passages.

## October 7 — hand motion continuity 2.42 installed

The user asked for realistic, bug-free, smooth hands. Measured first with the new `scripts/hand-continuity-probe.mjs` (144 Hz node posing of 20 hand-passages, still and renderer-eased) and a CPU profile of the packaged app (renderer mostly idle, so the problems were in posing, not frame rate). Fixed in `src/hand3d-rig.mjs` (with `src/hand3d.mjs`, `src/hands3d-layer.mjs`): a thumb held a fifth from the index could not be reached because the wrist was limited to 12° of turn, so in Tornado bars 4–6 the left thumb floated 17.5 mm off A3 and in the Moonlight Sonata bars 57–59 the right thumb 16.2 mm off B3; the wrist may now turn up to 13° further, continuously, as a thumb-index or thumb-middle stretch passes the widest natural spread (both frames now ≤ 0.4 mm). The local contact refinement could stall two frames from an exact fit; only while a held key is still missed it retries from the wrist turned to either bound and from the default frame. The hand's span (arch and fingertip angles) now counts digits as they come and go instead of switching at the strike; aims bring the hand over the second half of the approach; a landing finger takes on its on-key joint ranges as it arrives; free fingers settle on a 90 ms clock; the eased hand (now 40 ms) lets a finger stretch within strained ranges while it catches up, returning to comfortable ranges once arrived; free fingers hang a little closer in wide stretches; nails, knuckle relief and warmth slightly stronger. The motion engine, fingering, camera, contact tolerances and joint limits are unchanged. Guide: `docs/HAND_MOTION_2.42.md`.

**Worst held-key miss across the 20 hand-passages fell from 17.5 mm to 3.3 mm (one frame, Sunny Day chord arrangement bars 57–59, right hand; 19 of 20 within 0.5 mm, was 14); eased jerk frames fell from 148 to 125.** The original code's misses in the same passages were 14.7 mm (Tornado) and about 26 mm (Moonlight, lab dump). Pose cost per hand 0.38 ms mean, 0.71 ms p95, 5.6 ms worst. **902 unit/API checks and 162 hand checks pass**, including the new `tests/hand-continuity.test.mjs` (no landing or release moves the eased hand 8 mm in a frame, held keys exact there, bounded jerk, no height jump at a landing). Rejected along the way and retained in this note: a warm start from the previous frame (added together with the free-finger clock, the pair failed the easing test at 1.75 mm against 0.92 mm; the warm start was removed and the clock kept), step-halving in the correction rounds (broke three tests), a strained-limit refinement (no gain), and a guard against aims at keys still held (made one exact frame miss 5 mm).

Harness repair: the hand-guide story had failed since 2.39 on drift (volume moved into Practice tools, the guide previews the next note during a hold since 2.37, Connect piano opens the piano-input dialog since 2.34). `scripts/piano-input.mjs` and `scripts/practice-tools.mjs` handle these; five harnesses now use the MIDI helper. **The hand-guide story passes all eight groups in the browser and in the packaged app, the first green runs since 2.38**; trouble spots pass in the browser and natively, storage passes natively. Dense Appassionata playback in the packaged app: 496 frames, median 16.7 ms, p95 17.6 ms, max 34.1 ms (2.41: max 49.9 ms).

Installed and reopened `~/Desktop/Luma Keys.app` **2.42.0**, ASAR `77798af3f6a1475566866bbcc2602b9000bff99e662bcfc7a4906e230c91a930`, all 3,035 bundle entries matching the staged candidate; all 108 personal files byte-identical through installation (the 108th is 2.41's daily settings snapshot). One retained slip: the first install attempt refused to run because its running-app check matched the shell command that launched it, and that chained command then reopened the old 2.41 app; it was quit normally before the real install. First launch of the new bundle took 54 s to a listening server while the app's own clock read 431 ms (the known first-launch effect). The previous 2.41.0 app is recoverable in `.qa-runs/claude-2.42.0/`. The phrase-practice, sight-reading and resume-audio harness drift was repaired afterwards (see the next section up). Evidence: `evidence/hand-motion-2.42-verification.json`. No new schedule.

## October 6 — solid storage 2.41 installed

The local back end is harder to lose data with and easier to diagnose; what is stored and how practice works are unchanged. Every settings write, score save, import receipt, original PDF and export now goes through one atomic routine (`src/atomic-file.mjs`): a unique temporary name beside the destination, flushed to disk, then renamed into place, with nothing left behind on failure and stale temporaries swept at startup. Before a score is overwritten with different content its current bytes are kept under `Library/Score recovery/<id>/` (newest five); a removed score moves to `Library/Score recovery/removed/` (newest ten); before the first settings write of a day the healthy file is kept under `Library/Settings snapshots/preferences-<day>.json` (newest fourteen). All are ordinary JSON that **Import a score** restores. A lost recovery copy is logged, never allowed to block the save. The Library listing reuses parsed scores while a file's size, mtime and inode are unchanged (the Appassionata alone is 3.4 MB), invalidating on app saves and removals and healing per file after damage.

A bounded diagnostics log beside the library, `Desktop/Luma Keys/Logs/luma-keys.log` (one rotation at 1 MB, mode 600), records events only: server start with timings, an unwritable library, failed requests (method, path, status), recognition starts and finishes (job id, attempt, status, parts saved), recovery copies kept or not, and faults the page reports through `POST /api/diagnostics` (five event names, flat short values, 2 KB, thirty a minute; the benign Chrome "ResizeObserver loop" notice is filtered). `/api/health` reports the version, whether the Library is writable (a probe file at startup), startup timings and the log path; the app shows a notice when the Library cannot be written. The desktop shell logs and reloads a crashed page (at most three times a session), logs an unresponsive page and logs main-process faults with the usual dialog. Guide: `docs/SOLID_STORAGE_2.41.md`.

**899 unit/API checks pass**, nine of them the new `tests/storage.test.mjs`: whole files under twenty concurrent writers and cleanup on failure; log ordering, truncation, depth, rotation and unwritable locations; health fields and timings; score versions kept, pruned and skipped for identical saves; removed scores kept, pruned and re-imported; settings snapshots once a day before the first change, pruned, with damaged files still going to the `.bak` copy; the library cache seeing API and by-hand changes, damage and healing; and the report route's limits and rate limit. Existing server, recognition, backup, backing-store and packaging tests pass with the receipt and original-PDF writes now atomic (one preferences test was updated for the snapshot folder). **The trouble-spots story passes twice and the chord-reading story once in the browser on the restarted server; in the exact packaged app the new native storage check passes its four groups and the trouble-spots story its seven.** The diagnostics log itself exposed the ResizeObserver noise during these runs. Piano output stayed muted; no physical MIDI, microphone or chat-model inference.

**Startup, measured.** The "cold-start delay" recorded since 2.32 is a first-launch effect of a newly installed bundle, not app code: two warm launches of the packaged 2.40 app took 0.5–1.1 s to the window and 1.1–2.2 s to Play; the freshly installed 2.40 app took about 17 s to bring its server up the first time. For 2.41 the installed app's first launch took 53 s from `open` to a listening server while its own clock read 416 ms to server ready and 736 ms to window loaded, so the wait happens before the app's code runs (macOS inspecting a 6 GB unsigned bundle); the same build warm measured 173/365 ms. These are this Mac's measurements; the health report and the `server-ready`/`app-ready` log events now show them on every run.

Harness: the trouble-spots story captured the imported fixture's id from the last-piece setting, which can still name the previous piece (an earlier UUID), the cause of its intermittent "not saved" failure; it now finds the piece by title. The native storage check does not assert a settings value the live page may rewrite with its own debounced save.

Installed and reopened `~/Desktop/Luma Keys.app` **2.41.0**, exact ASAR `89c32c951e7015a83bd24a8dc321be94b781881c3914622786254ff1d4879cbb`; all 3,035 bundle entries match the staged candidate. The idle 2.40 app (no CPU, no personal file written since it was opened) was quit normally first; all 107 personal music/settings/progress files were byte-identical before and after installation, and none changed after reopening (the app now writes only when something changes; the new `Logs` folder sits beside the Library, outside the personal set). The reopened app reports version 2.41.0, a writable Library and its first `server-ready` and `app-ready` events. The previous 2.40.0 app remains recoverable in `.qa-runs/claude-2.41.0/`. Retained from 2.40: three drifted harnesses (phrase practice, sight reading, resume audio) and the hand-guide cue-versus-key assertion, unchanged here. A Library folder that cannot be created at all still stops the app from opening, as before. Evidence: `evidence/solid-storage-2.41-verification.json`, `evidence/native-storage-qa.json`, `evidence/native-trouble-spots-qa.json`. No new schedule.

## October 6 — trouble spots 2.40 installed

The app now remembers where a piece keeps slipping. Wait for me judges a bar when you leave it, stop in it or a one-bar repeat comes round; Play in time judges every bar a graded run covered (clean when nothing missed or extra; timing stays on the card). Listen & follow and generated exercises are not remembered. Each piece keeps a short per-bar memory in the journal (`journal.pieces[id].spots`: passes, slips, the last eight outcomes and the day), read with the journal's recovery rules: a damaged bar is dropped and reported while the piece survives, and a piece keeps at most 240 bars. A bar with two recent slips and a recency-weighted slip rate of 40% or more is a trouble spot; neighbouring troubled bars (one bar apart at most) form a spot of up to four bars; three clean passes in a row clear a bar.

Trouble spots show as warm marks under the piece-map ribbons (pointing at one adds "slipped 3 of the last 5 passes"), as Drill/Forget chips under **Practice tools → Trouble spots** (the Tools button says "· 2 trouble spots"), as a line on the report card under "Most misses", as **Drill** chips on Library's Continue card and as a list on each Progress piece card with the bars cleared. Drill repeats the spot's bars from the first one, slows to 70% if practice was faster and says so in the dock ("Drill bars 45–46 at 70% · Space plays"); Library and Progress open the same drill. Nothing else changes: mode, hand, labels, accompaniment, fingering, hands, playback and grading are untouched. Guide: `docs/TROUBLE_SPOTS_2.40.md`.

**890 unit/API checks pass** (12 new for the memory itself, three for the journal, one for the settings round trip). **The browser story passes its seven checks twice on an isolated library copy, and the same story passes all seven in the exact packaged app** with no capture skipped: a fresh piece has no spots; one slip is remembered but is not a spot; two slips make the mark (over bar 2 of 4 at 25%–50% of the map, trouble 1.00), the chip and the summary, kept across a reload; Drill repeats bar 2 at 70% from beat 4 and says so; three clean passes round the one-bar drill clear it while the bar's history stays; two graded Play in time runs with a wrong note judge bar 3 and the second card says "Bar 3 is a trouble spot · slipped 2 of the last 4 passes"; Library offers the drill and Progress lists the spot beside "1 bar cleared" and opens a 70% drill at bar 3; Forget removes it from the drawer, the map and the saved journal. The Wait-mode chord-reading story also passes in the browser. Computer keys stood in for a piano with the piano muted; no physical MIDI, microphone or chat-model inference.

Harness repair: since the undocumented 2.39 pass moved the piano volume and mute into the Practice tools drawer, the first step of most browser and native harnesses (filling "Piano volume") had been failing; they last passed on 2.2.0 or on 2.38 (hand guide). `scripts/piano-volume.mjs` opens the drawer for the slider and fourteen harnesses now use it; the hand-guide story focuses the dock's song-position slider where it used to focus the volume. Retained drift, not changed here: phrase-practice-checks expects the loop spinbuttons outside the drawer (2.39); sight-reading-checks expects the pre-2.33 Exercises options panel; resume-audio-checks (first in native-continuity) asserts the pre-2.12 release tail (8 beats × 0.94 + 0.7 s) and fails against the 2.12 grand; after its volume step was repaired, native-hand-guide now fails its first cue-versus-key finger-description assertion, which this pass did not touch. These are harness findings; the trouble-spot stories and the chord-reading story cover this change end to end.

Installed and reopened `~/Desktop/Luma Keys.app` **2.40.0**, exact ASAR `ed5b451f7de1d0a575e88ae9abb015c1721f760b5b3ce3238df53171eff56cbc`; all 3,035 bundle entries match the staged candidate, and `src/trouble-spots.mjs` is in the bundle beside the journal (the packaging test enforces it). The app was not running before installation; all 107 personal music/settings/progress files were byte-identical before and after installation. On reopening, the app rewrote only `Library/preferences.json`, as it does on every launch (the companion's last-seen day); it reads back valid with the Appassionata still the last piece and no trouble spots yet, and the other 106 music, export and practice-sheet files are unchanged. The reopened app's loopback server was listening about 17 s after launch (the known cold-start delay, unchanged and unclaimed) and reports the personal Library as its data folder. The previous 2.39.0 app remains recoverable in `.qa-runs/claude-2.40.0/`. Evidence: `evidence/trouble-spots-2.40-verification.json`, `evidence/trouble-spots-qa.json`, `evidence/native-trouble-spots-qa.json` and the `evidence/*trouble-spots-*.png` captures. No new schedule.

## October 4 — live hand anatomy and posing 2.38 installed

The user's rejection supersedes earlier internal visual acceptance. The generated prototype was an anatomy reference; the runtime mesh, posing and material did not reproduce it. Reduced excessive dorsal volume, separated knuckles, shortened tendon relief, corrected skin-map derivative sampling and softened the material. Ordinary melodies now use a lower, more open arch and less idle curl; wide held chords and crossings retain supported wrist height. Bind bones, weights, UVs and palmar contacts stay intact. Cached endpoint poses avoid rebuilding geometry during playback. Removed the blue hidden-thumb surface overlay after exact-app review showed it painting through the palm. Finger numbers and key targets remain.

**141 hand/pose/planner/fingering checks and 41 independent surface/bake/guidance/stage/seek checks passed; 40 final renderer/surface/bake checks passed after the final material bake. Nine exact-package native groups passed.** Actual melody/rest, crossing, octave, held-chord, black-key and live coda images were reviewed by root and an independent reviewer. No major distortion was observed; skin and nails still look less natural than the reference. No pixel-identical or photorealistic-parity claim.

The initial six-second native playback sample produced 265 frames (median 16.7 ms, p95 34.3 ms, max 816.7 ms), with an explicitly retained initial stall. The separate warm sample produced 336 frames (median 16.7 ms, p95 33.3 ms, max 66.9 ms); hand update/render CPU mean 2.548 ms/p95 3.5 ms. This is not a constant 60 fps claim. Muted isolated testing did not exercise a physical piano, microphone, MIDI, audible audio or chat-model inference.

Installed and visibly reopened `~/Desktop/Luma Keys.app` **2.38.0**, exact ASAR `8d24bb385c7e589f21a77bae105ded4e3ca7084a90e5a23c68fe0d8ed6aa4805`. All 657 production inputs, 531 packaged assets/source/helper checks and 3,035 bundle entries match. A normal quit and fresh non-chat backup preceded installation; all 107 personal music/settings/progress files remained byte-identical after reopening. CUA accessibility and pixels show the new hands, paused Appassionata, Resume bar 45, Perform/Both/100%, Ocean/Lang Lang and Falling notes. First inspection timed out, then recovered normally; startup delay is not claimed fixed. No personal playback or chat started.

Guide: `docs/HAND_GUIDE_2.38.md`. Evidence: `evidence/hand-guide-2.38-verification.json` and `evidence/native-hand-guide-2.38-*.png`. Exact native reports, previous 2.37 app, rejected first candidate and fresh musical-data backup remain in `.qa-runs/hand-art-2.38/`. No new schedule.

## October 3 — hand guidance follow-through 2.37 installed

Continued the accepted 2.36 hand anatomy and materials. Filled finger badges now require actual guide contact (including exact Wait placements); released numbers briefly fade as outlines. A displaced badge can show a quiet connector along its own key column. Exactly repeated voicings show each pitch/finger once with “Next: repeat,” while accessible text still names the full new attack. Different pitches/fingers, partial repeats, holds, rests and missing suggestions retain explicit guidance.

Fixed a reproduced Appassionata bar 267 transition: the planner had held a black-key thumb for an artificial extra 40 ms after its written note ended, while another finger crossed to an unreachable contact. Only unreachable synthetic overlaps involving a black-key thumb lose that extension; written notes, audio and ordinary/no-thumb/white-thumb crossings stay unchanged. The 29.315 mm miss at beat 532 is effectively zero; nearby sampled held error peaks at 0.664 mm. All 360 sampled coda motions are unchanged.

The solver skips unheld digit calculations that were immediately discarded from contact refinement. All 786 bounded poses matched exactly before the separate crossing fix, with 1.58% fewer analytic solves. **103 hand tests passed, eight focused tests passed after the final no-thumb scope restoration, and 37 guidance/coach/keyboard/seek tests passed. Seven exact-package native groups and independent visual review passed.** The native six-second coda sample produced 333 frames (p50 16.7 ms, p95 33 ms, max 66.9 ms); hand CPU mean 2.478 ms/p95 4.3 ms. This does not establish constant 60 fps. Eighty-four live sampled frames included released markers and passed the contact-style check. No sampled native frame required a leader, so that rare path is unit-tested/code-reviewed, not visually exercised.

Installed and visibly reopened `~/Desktop/Luma Keys.app` **2.37.0**, exact ASAR `abee16cce0d3a9a8aeee238bc2a8525e287cbb6bbe38575713dce0f093986719`. All 657 production inputs, 531 packaged assets/source/helper checks and 3,035 installed bundle entries match. A normal quit and fresh non-chat backup preceded installation; all **107 personal music/settings/progress files are unchanged**. Native accessibility and pixels confirm paused Appassionata bar 1, Resume bar 31, Perform/Both/100%, Ocean/Lang Lang, Falling notes, the accepted hands and both new repeat cues. No personal playback or chat was started.

Retained diagnostics: an initial broad overlap guard failed Tornado legato and was rejected; the first native harness incorrectly expected a repeat cue outside its one-second window at 60% speed, corrected without a production change. Final source restricts the crossing guard exactly to the intended case. Actual app inspection first timed out during startup and then recovered normally; startup delay is not claimed fixed. Physical piano, audible audio, MIDI/microphone and chat-model inference were outside this hand-only pass.

Guide: `docs/HAND_GUIDE_2.37.md`. Evidence: `evidence/hand-guide-2.37-verification.json` and `.qa-runs/hand-flow-2.37/`. The previous 2.36 app and musical-data backup remain recoverable. No new schedule.

## October 3 — hand guide 2.36 installed
Replaced the rejected hand mesh with Microsoft MRTK’s MIT-licensed RiggedHandVisualizer, converted reproducibly with source proportions preserved. Compact palms, natural thumb attachment, curved idle fingers and restrained knuckle/skin detail replace the former stretched appearance. Indexed GLBs are 115 KB each. Runtime preparation and baked skin maps now share geometry settings and verified source-model hashes. Generated reference art is kept in docs, not shipped as a runtime hand.

Fixed artificial 40 ms non-thumb finger crossing without shortening written holds; corrected finite differences and constrained solving at wrist rotation bounds. Thumb-under crossings allow 22° wrist turn with unchanged finger limits and contact tolerances. A native visual review caught exposed forearm ends in raised coda poses; local wrist fading now completes before the compact mesh ends.

**Installed and visually reopened `~/Desktop/Luma Keys.app` 2.36.0.** All 3,035 bundle entries match the accepted candidate, ASAR `b2fc596b67d322059fcd22e1e5955493f8c1ad0a9a607fbd51f44ff350a965ac`. All 657 snapshotted source/asset inputs stayed unchanged; 531 packaged source/assets and the native helper match. Installation preserved all 107 non-chat personal music/settings files, with a fresh backup and recoverable 2.35 app. Actual native pixels show the new hands on Appassionata’s opening, with Resume bar 31, Perform/Both/100%, Falling notes and Lang Lang/Ocean intact.

**100 hand tests, 40 focused coach/planner/stage/seek/packaging checks and 1 added forearm-fade regression pass.** Six final native groups cover single notes, octaves, held chords, black keys/coda, multiple widths/short windows, palettes, reduced motion, hand toggle, five-second seeking, playback, pause audio cleanup and reload. Root and independent visual review accept exact-package images. All native checks used isolated musical-data copies and muted output; no physical audio/MIDI/microphone or chat inference claim.

Frame pacing remains variable on this Mac in old/new and hands-hidden samples. Final playback produced 235 frames over 6 s, frame median 16.8 ms / p95 66.4 ms; hand-update CPU mean 4.17 ms / p95 7.7 ms. Controlled comparisons did not show a consistent new-rig slowdown; no speculative optimization was shipped and no locked 60 fps claim is made. The first actual-app CUA inspection timed out during reopening; subsequent native state/pixels succeeded. Startup delay remains unclaimed.

Guide: `docs/HAND_GUIDE_2.36.md`. Evidence: `evidence/hand-guide-2.36-verification.json`; native images use `evidence/native-hand-guide-2.36-*.png`. Rejected candidates, reports, source manifests and backups remain in `.qa-runs/hand-sculpt-2.36/`. No new schedule.

## October 3 — temporary companion chat 2.35 installed
Renderer chat is now memory-only, with no normal history GET/PUT, transcript writes or stored reactions. New chat cancels pending and delayed questions, clears draft/turns/reactions and returns focus. Larger text/targets, an explicit temporary label, keyboard scrolling and Latest focus improve the compact panel. Legacy server history routes discard writes, startup removes canonical files, and one-time Electron cache migration removes old cached API bodies. Music/preferences remain separate.

**Installed `~/Desktop/Luma Keys.app` (2.35.0).** All 3,035 bundle entries match the verified package, ASAR `b78b3015d679f672b93f3972cc29dd75168d0002d309522c6062b3a069fe7d29`. All 1,160 production inputs remain unchanged; 530 packaged source/assets match, with builder-normalized package identity checked separately. Normal quit, installation and reopening preserve all 107 non-chat personal files byte-for-byte. Removed the 33 identified legacy conversation files from the active Library and project QA/update backups without reading or copying their contents. The fresh musical-data backup excludes chat. The version-only HTTP-cache migration marker is 0600; live health confirms temporary storage and successful cleanup.

**853 serial unit/API tests, 20 focused privacy/copy checks and nine exact-package native groups pass.** Native checks cover startup cleanup/no history fetch or writes, temporary reactions, local and controlled model replies, panel close/minimize, reload, clearing during streaming or delayed availability, fresh context, IME, keyboard scrolling, Latest focus, options, six layouts, large Chinese text, reduced motion and forced-colors focus. Root visual review accepts the compact layouts. The full serial run preceded final UI/cache edits; focused and final-package native verification cover the completed implementation. Real inference, physical microphone and spoken screen-reader output were not tested in this pass.

Actual Desktop pixels confirm Appassionata III paused at the start, Resume bar 31, Perform/Both/100%, Falling notes, Lang Lang and Ocean colours. Reopening initially produced three CUA timeouts; later pixels and live health confirmed launch. Native accessibility exposed only the outer window and input returned `noWindowsAvailable`, so the personal chat panel was not opened. The exact-package isolated chat checks above passed. No force quit, personal chat request or physical capture was used. A process sample and failed inspection diagnostics remain saved; the inspection delay is not claimed fixed.

Retained rejected QA attempts were harness issues: storage access on initial about:blank, layout-dependent innerText during a transition, and an overflow assertion counting deliberate 7 px bubble tails. Final assertions separately check text and scroll-container overflow. Guide: `docs/TEMPORARY_CHAT_2.35.md`. Evidence: `evidence/temporary-chat-2.35-verification.json`; exact reports and the previous 2.34 bundle are in `.qa-runs/temporary-chat-2.35/`. No new schedule.

## October 3 — real-piano microphone Wait 2.34 installed
**Installed and visually reopened `~/Desktop/Luma Keys.app` (2.34.0).** Connect piano now offers explicit microphone capture alongside USB / MIDI. Wait independently detects fresh piano attacks, compares complete note sets, and advances the score, falling notes, keys and hand guide together. Held notes cannot repeatedly advance; separate partial notes do not accumulate into a chord. The beta supports C3–C6 and simple chords up to three notes. Octave/twelfth, hollow fifth and other ambiguous targets stay pending with input guidance. Extra octave notes can hide in overtones; physical acoustic-piano/room accuracy is unverified.

Capture uses a local AudioWorklet and separate detector Worker with bounded backpressure, discontinuity recovery and stale-attack rejection. Target scopes prevent queued results from moving a new seek/loop/hand position. Explicit permission, cancellation, disconnect and app lifecycle cleanup are covered. App piano, backing, metronome and companion-game audio share a capture mute gate; no sample echo accompanies a microphone match. Existing volumes and MIDI remain intact. No microphone recording or audio transfer to the pet model.

The companion reacts immediately and can request a short background coaching line from the existing local model using bounded note metadata. Detection never waits for inference. Busy, late, timed-out, cancelled and obsolete model replies cannot interrupt advancement or deliver a stale tip. No model retraining or judgment of physical touch/posture is claimed.

**109 focused checks and four exact-package native scenarios containing 12 checks pass.** Native coverage includes silence/wrong pitch/octave/repeated attacks/complete chords, audio isolation, responsive status/Stop, simulated denial/disconnect, a 500 ms UI stall, seek/restart/loop/hand/chat changes, unsupported targets/MIDI fallback, deliberately queued stale attacks and a delayed coaching response. The latter is explicitly stubbed (2.5 s); this tests nonblocking integration, not model quality. All native output was muted, input was Chromium fake capture, and data was isolated. No physical microphone permission was requested. The broader serial suite passed842/847; five existing recognition process-timeout fixtures subsequently passed in the unchanged isolated8/8 recognition suite. No clean847-test single-run claim.

All1160 frozen production inputs remain stable;508 packaged source/asset entries match, with builder-normalized package identity separately checked. All3035 installed file/symlink entries match ASAR `9bc131f84d079de0707e71500486574daeab220883d10a493f5cfc85d0d245db`. Normal quit, a fresh backup, installation and reopening preserved all108 personal files byte-for-byte. Actual Desktop UI restores Appassionata paused atbar1/569, Resume31, Perform/Both/100%, Falling notes, hands, Lang Lang/Ocean. Piano input is open; physical microphone capture remains off for the user to start.

Retained failures include a QA fake-audio sandbox setup issue, an original capture-backlog disconnect during UI work (fixed with bounded recovery before final acceptance), and QA startup instrumentation timing. The original rejected bundle is retained. Cold-launch/inspection delays remain: actual reopening first timed out at35 seconds, then the next explicit Desktop path selection showed the restored app without force quit. Recorded-note detector confirmation of180–252 ms excludes hardware/queue/display time and is not a real-piano latency promise.

Guide: `docs/MICROPHONE_WAIT_2.34.md`. Evidence: `evidence/microphone-wait-2.34-verification.json` and `.qa-runs/microphone-practice-20261003/accepted-native-reports.json`. Verified candidate, previous2.33 bundle and fresh personal backup are recoverable in that QA folder. No new schedule.

## October 3 — compact Exercises 2.33 installed
Exercises now uses twelve stable lesson cards in three groups and one setup card. Hands/length remain visible; Customize folds key/meter/tempo while their current values stay visible. Level guide retains useful original tips, adapting early starting advice for custom hands/keys. All defaults, overrides, reset, seeds, saved scores, exact clicked-level double-click, recommendation, clearing and graded history remain. Native controls and setup-first phone document/tab order improve keyboard access. A small manually authored musical motif and the selected palette replace repeated explanations and the long staircase. Brief lesson transitions respect reduced motion; chat leaves a usable content column.

Native testing caught a real phone companion obstruction immediately after scroll. Whole-panel avoidance geometry, summary protection, immediate disclosure measurement and a scoped scroll/reflow guard now keep the figure and its hit area off labels and controls. The companion returns to a clear seat; header/app-bar chat remains available.

**802 full serial unit/API checks passed before the final follower correction; 53 focused checks pass after it.** Two exact-package native scenarios pass19 groups,17 actual generated/saved MusicXML/notes/config comparisons and36 responsive/theme/chat layouts. All12 default Starts, custom/reset/new-seed/double-click/keyboard flows, all7 palettes, both disclosures, empty/populated statistics, phone immediate/settled follower checks, reduced motion and persistence pass. Root and independent visual review accept the final pixels. No renderer errors or inference requests; test output was muted. Physical audio/MIDI/microphone, model generation and 3-D hand contact were not retested in this UI pass.

**Installed and reopened `~/Desktop/Luma Keys.app` (2.33.0), with Exercises open.** All648 build inputs were stable,527 packaged source/assets/helper entries match, and all3,035 installed files/symlinks match archive `90d7ac56908ef9245044f4728080e7dd45d6aae4b357c64fe054034fa2367b01`. The old app quit normally; fresh backup and strict audits preserve all108 latest personal files byte-for-byte after reopening/navigation. Actual Desktop CUA accessibility and pixels confirm Lang Lang/Ocean and all12 Exercises controls. Before navigation, Practice restored paused Appassionata bar1/569, Resume31, Perform/Both/100%, Falling notes and hands. No personal exercise, playback or chat request was started.

Retained failures include three initial parallel mocked-process fixture failures (serial full suite passed without weakening tests), a transient-toast harness correction, an excluded copy taken before packaging completed (never tested/installed), and the real follower overlap fixed above. One native launch timed out before renderer readiness; a later cold-start sample supports a loader delay before app code, with exact cause unknown. Final archive runs passed; cold-start delay is not claimed fixed. Actual Desktop inspection first timed out and recovered after a CUA reset without force quit. Full diagnostics remain saved.

Guide: `docs/EXERCISES_2.33.md`. Evidence: `evidence/exercises-polish-2.33-verification.json`, `.qa-runs/exercises-polish-2.33/NATIVE_ACCEPTANCE.md` and exact-package captures. Previous2.32 bundle and fresh personal backup remain recoverable in the QA folder. No new schedule.

## October 3 — smooth themed Practice 2.32 installed
The main piano now shares one audible-clock sample across falling notes, key approach and the existing natural 2.30 hands. Exact fingering and motion preparation runs in a cancellable worker with bounded clock caching; GPU preparation runs alongside it. Obsolete score/speed responses cannot replace the current plan, and the original exact planner remains available when a worker is unavailable. Queued attacks use absolute audio deadlines. The first playback window is queued before the initial redraw, fixing a real skipped opening note under a delayed first frame. Paused Sheet/Numbers/Falling remounts now restore the correct runway position.

The selected palette carries through the frame and fine woven wrist rest. Notes have restrained satin highlights, solid readable colour, clear contact outlines and quieter landing effects. Left/right teaching colours remain distinct. Dynamic markings sit above the onset line; hands no longer dim key labels. Cleared highlights restore readable black-key captions and quieter inactive white-key numbers. Colours includes small piano-finish previews; all seven choices, five-second arrows and every existing practice control remain.

**802 unit/API checks, seven exact-package native groups, two additional fresh-start/reopen checks and independent visual review pass.** All 370 expected sampled attacks matched, with maximum software scheduling error 5.33 ms. The forced350ms initial redraw stall keeps its opening attack queued once and Pause cancels voices. Caption recovery, hand contacts, Listen/Wait/Perform ownership, seeking, all palettes, live colour changes, 1440/800/390/short layouts, reduced motion and view/hands/reload transitions pass. The final caption-only CSS change was verified on the exact final native package; all JavaScript inputs match the full unit-suite run.

Frame pacing remains variable: final native Sunny Day listening p95 is17.6ms, dense Appassionata50.1ms, coda33.4ms and Tornado50.1ms. The earlier accepted same-JavaScript final2 run measured33.7ms for dense Appassionata versus50ms for the2.31 baseline; it also recorded worse coda pacing. Neither run establishes universal60fps. Hand preparation leaves the main thread, and scheduling is tighter, but occasional dense/cold-start rendering stalls remain. A separate instrumented trace magnified layout/paint/compositor waits and caused sample fallbacks; it is retained as failed diagnostic evidence, not acceptance. One final3 start timed out at90seconds waiting for3-D hands; its cause remains unestablished. The identical archive subsequently passed the full suite, two startup checks and actual Desktop visual inspection. Native output was muted; physical audio/MIDI/microphone and model inference were not retested.

**Installed and reopened `~/Desktop/Luma Keys.app` (2.32.0).** All647 build inputs stayed stable,527 packaged source/assets/helper entries match, and all3,035 installed bundle files/symlinks match archive `b95add1db9a8d10422bca7f1ce5648b05d876ca5b2037f4bf0b4916ad407a9bb`. The old app quit normally and a fresh backup preceded installation. All108 latest personal files are unchanged. Native inspection initially lost its pipe/timed out; a CUA session reset recovered the actual updated window without force quitting the app. Accessibility and pixels confirm paused Appassionata bar1/569, Resume bar31, Lang Lang/Ocean, Perform/Both/100%, Falling notes and the real3-D hands. Practice is open. The old2.31 bundle, backup, accepted intermediate and failed diagnostics remain recoverable in `.qa-runs/practice-flow-2.32/`.

Guide: `docs/PRACTICE_FLOW_2.32.md`. Evidence: `evidence/practice-flow-2.32-verification.json`; exact-package captures, comparisons and live personal observation are saved in `.qa-runs/practice-flow-2.32/`. No new schedule.

## October 3 — clean and cute Progress 2.31 installed
Progress now has a compact daily-goal/week/companion summary, one switchable Activity chart/calendar, artwork piece cards with exact saved-place Continue, optional original piece maps and expandable graded reports. All history, 12/26-week calendar persistence, stats/trends/levels, Show more and exact piece/exercise reopening remain. Presentation-only bounds handling clips stale coverage/resume against a replacement score without changing journal data or treating a saved final bar as completion. The narrow-calendar grid overflow and travelling-pet click interception were fixed; the companion keeps streak and goal labels clear.

**787 unit/API checks, 56 focused buddy/progress checks, 15 exact-package native acceptance groups and a supplemental mobile graded review pass.** Root and independent visual review accept populated/empty/goal, 1440/1280/800/390/short, Calendar, Ocean/Rose/Neutral, reduced motion, immediate moving-pet Calendar clicks and settled greetings. Resume restores exact saved bars with ready 3D hands and finite held contacts. Native output was muted; physical audio/MIDI/microphone and model inference were not retested. Earlier failed diagnostics remain saved, including the two real issues fixed above and harness-only assumptions.

All 643 build inputs remained stable;525 packaged source/assets/helper entries and all 3,035 installed bundle files/symlinks match the final native-tested archive: `974645466ca6b1966efc87fff70bca72ecfa120b62be69937650d065c59add07`. This release carries the previously verified 2.30 natural-hand redesign, which was not installed separately.

**Installed and reopened `~/Desktop/Luma Keys.app` (2.31.0).** Native control initially timed out but recovered using the exact Desktop path. The old app quit normally; a fresh backup was taken before replacement. All 108 latest personal files remain byte-for-byte unchanged after installation, reopening and navigation. Lang Lang/Ocean, Appassionata's saved bar 31, Perform/Both/100%, Falling notes, hands and all musical settings are preserved. Actual CUA accessibility and pixels show the healthy updated Progress page with the user's 12 history entries and 2 h 13 min total. Practice initially opens paused at bar 1 with Resume bar 31. The previous2.29 bundle and personal backup are recoverable in `.qa-runs/progress-cute-2.31/`.

Guide: `docs/PROGRESS_2.31.md`. Evidence: `evidence/progress-cute-2.31-verification.json`; native reports, actual app captures with isolated synthetic history and the live personal observation are in `.qa-runs/progress-cute-2.31/`. No new schedule.

## October 3 — natural hand redesign 2.30 verified; included in installed2.31
The user rejected 2.29 visually. Its technical checks below did not establish visual acceptance. Generated a new natural pianist reference first, corrected camera foreshortening and compact keyboard depth, refined long fingers/slimmer palms/varied idle curves, removed cuffs, softened the finish and continued forearms through the lower frame. A free-finger clearance correction preserves strict settling and held key contacts; bones and joint limits are unchanged.

**780 unit/API tests and six exact-package native groups pass.** Opening/crossing, mixed black/white octave/coda, 1440/1280/800/390 and short-window layouts, colours, reduced motion, hide/show, five-second seeking and persistence are verified. The six-second coda sample records356 frames, frame p95 17.7ms, maximum34.3ms and peak0.46mm across62 sampled held contacts. No renderer errors or sample fallback. Output was muted; physical audio/MIDI/microphone and chat inference were not retested.

Root and independent visual review accepted final-b actual app captures. The earlier final-a candidate passed technical checks but failed visual review on detached wrist ends; it remains saved. All641 build inputs stayed stable,525 packaged source/assets/helper entries match, and3035 bundle entries match the frozen verified app. Archive: `b56b1091c3d36ed85da3339864b916b927d408c83ae57f34674d8c1239053bdf`.

The standalone 2.30 candidate was not installed while native control was unavailable. Its full hand revision is now included in the verified2.31 Progress release installed above. The personal app later quit normally after macOS control recovered; latest preferences were backed up and preserved. The original 2.30 candidate remains archived at `.qa-runs/hand-redesign-2.30/verified-Luma Keys-2.30.0.app`.

Guide: `docs/HAND_REDESIGN_2.30.md`. Evidence: `evidence/hand-redesign-2.30-verification.json`, actual native screenshots and retained diagnostics in `.qa-runs/hand-redesign-2.30/`.

## October 3 — artistic pianist hands 2.29 installed
Generated the complete reference first, then refined the articulated hands: softer peach skin and lighting, short satin nails, gentler curved fingers, complete tapered wrists and ivory cuffs accented by the teaching colours. Compact-key projection and bounded wrist refinement keep playing contacts aligned without stretching bones or widening joint limits. The palette close control now clears the roaming companion.

**777 unit/API tests and six exact-package native groups pass.** The six-second muted Appassionata check records 362 animation frames, frame p95 17.6 ms, hand-render CPU p95 2.4 ms and peak sampled contact error 0.38 mm. All 640 build inputs stayed stable; 524 packaged source/assets/helper entries match. Archive: `f3b3d47a5716e75679f97114b072570f35309a0c6d974e2e92f1936b0901e990`. Evidence and retained failures: `evidence/hand-atelier-2.29-verification.json`, `.qa-runs/hand-atelier-2.29/`; guide: `docs/HAND_ART_2.29.md`.

**Installed and reopened `~/Desktop/Luma Keys.app` (2.29.0).** After the Mac was unlocked, the old app quit normally. All3035 installed files and symlinks match the accepted native-tested candidate. A fresh backup contains all108 personal files. All107 score/export/conversation and other files remain byte-for-byte unchanged; `Library/preferences.json` has live appearance and practice-log updates. Its saved score, reading position and musical practice settings are preserved. The app initially restores 晴天 bar1/76, paused, Wait, Both hands,60%, Falling notes, Lang Lang and Neutral. The latest live view is Library with Liszt/Match Liszt and chat open; these new choices were retained. The strict all108-files assertion correctly failed on preferences; the separate live audit records the actual differences instead of rolling them back.

The normal installed-app reopen first timed out in native app control, then succeeded with the explicit Desktop path. A changed-UI guard was refreshed before returning to Practice. That personal screenshot caught the 2-D preparation fallback; final hand visual acceptance uses the exact-candidate native captures, including confirmed3-D rendering and live coda playback. No personal chat requests or score edits were sent. Previous2.28 is recoverable at `.qa-runs/hand-atelier-2.29/previous-installed-Luma Keys-2.28.0.app`, with a fresh personal backup beside it. No new schedule.

## October 2 — Faster companion chat 2.28 installed
**Installed and reopened `~/Desktop/Luma Keys.app` (2.28.0).** The existing Qwen3.5 9B model now stays warm between conversation turns. Chat opening starts background loading; availability checks/app launch do not. One private Unix-socket model is owned by a connected IPC worker. Matching prompt prefixes can be reused, with128MiB additional cache and idle CPU polling disabled. Stop cancels generation while keeping a healthy loaded model; five idle minutes unload it. Failure, disconnect and app quit reap the owned processes, and the next request can restart a failed worker. Answer quality/language/length checks and exact score commands are preserved.

The same three-question runtime sample improved first-text latency from23.74→19.00s initially,15.47→6.28s for English recall, and11.91→9.65s for a Chinese tip. This is a small sample, not a guarantee: the first conversation still loads the model; native visible replies under substantial system memory pressure took about14–34s. The native old-build comparison overlapped a unit run and is retained descriptively. No smaller model, network service or new training claim.

**773 unit/API tests pass** in a separate bounded-concurrency run. Four final native acceptance groups cover genuine local-model replies/recall after persisted-history reload, Chinese streaming, Stop/new question, real decoding alongside piano, and quitting during an active reply with no model processes left. Captured piano sources continue and future queued voices stop on Pause. Frame p95 was83.4ms, with one cumulative cache miss/fallback whose onset this capture does not locate; these limits remain in the evidence. Sound was muted; no acoustic quality or physical MIDI claim. Earlier attempts used old UI selectors or mistook deterministic score coaching for inference. Two old2s process fixtures exceeded their budget during a simultaneous unconstrained unit/inference run; all773 pass separately with two workers, without weakening product behavior.

638 build inputs remain stable;523 packaged entries/helper and42 model/runtime/license files match. All3,035 installed bundle entries match the accepted candidate. ASAR: `dfde38fdeb392ee0555c52c3a3c6a1d96fadcd9907277bcee35148aed3272a20`. All108 latest personal files remain unchanged after normal quit, installation and reopening. Native accessibility shows 晴天 paused atbar1/76, Lang Lang, Wait, Both hands,60%, Falling notes and Neutral colours. Practice is open. Previous2.27 is retained in `.qa-runs/chat-speed-2.28/previous-installed-Luma Keys-2.27.0.app`.

Guide: `docs/CHAT_SPEED_2.28.md`. Evidence: `evidence/chat-speed-2.28-verification.json`. No schedule extension.

## October 2 — Colours and alignment 2.27 installed
**Installed and reopened `~/Desktop/Luma Keys.app` (2.27.0).** A palette button beside the companion opens seven choices: Neutral, Sage, Lavender, Rose, Ocean, Walnut and Match companion. Settings uses the same choice list. Selection applies immediately across app chrome, screens, chat and keyboard materials; a fixed palette stays fixed when the companion changes, while Match follows the character. Song artwork and blue/amber teaching cues remain intact. Removed the decorative colour caption.

Library now adapts to its actual column width: explicit search/avatar cells, compact cards and a separate conversation column from901px upward. Corrected the implicit-grid-column conflict, faint Neutral text, picker/navigation layering and wrapped Import label. Keyboard arrows/Home/End operate the picker without playing notes or seeking; Escape restores its trigger, outside click/Tab dismiss it, short windows scroll the selected control into view and reduced motion removes its animations.

**762 unit/API tests and seven final native acceptance groups pass.** Real Appassionata, 晴天 and 龙卷风 were copied into isolated QA data. Checks cover all seven choices, distinct keyboard finishes and retained 3-D hands, Settings/reload agreement, companion matching, keyboard/audio ownership, live Listen continuity, pause cancellation, every screen and six widths (1440/1280/1100/901/800/390), plus390×360 keyboard access. No renderer errors or model requests; source scores remain byte-for-byte unchanged. Root reviewed final captures and the actual Desktop Library/picker. Test sound was muted; physical MIDI, audible quality and model-answer quality were not retested. Below901px, Library retains floating chat.

637 build inputs are stable;522 packaged entries/helper and42 model/runtime/license files match. All3,035 installed entries match the exact native-tested candidate. ASAR: `dc4153491ad4be534bab6a1deab2e31d2d91e3c87d7fc61382cee24004b215fe`. All108 latest personal files remain unchanged after normal quit, installation, reopening and showing Library/picker. 晴天 stays paused atbar1/76 with Lang Lang, Wait, Both hands,60%, Falling notes and the saved Neutral selection. The palette is open for the user to choose. The previous2.26 app remains recoverable in `.qa-runs/colour-flow-2.27/previous-installed-Luma Keys-2.26.0.app`.

Retained initial runs include harness-only background-owner and old chat-option-label mistakes; those expectations were corrected. Visual review additionally fixed contrast/layering/app-bar details and medium-width Library overlap before final acceptance. The first reopening read timed out; the next explicit full-path app selection returned the healthy updated app. No forced quit, restoration or personal data edit was needed.

Guide: `docs/COLOURS_2.27.md`. Evidence: `evidence/colour-flow-2.27-verification.json` and desktop/compact/mobile captures. No schedule extension.

## October 2 — Practice hands, materials and navigation 2.26 installed
**Installed and reopened `~/Desktop/Luma Keys.app` (2.26.0).** The approved 3-D hand model, rig, proportions and key contacts remain unchanged. Softer lighting, warmer skin, quieter creases/veins, matte highlights, satin nails and clearer fingertip numbers refine its finish. The instrument frame, runway, felt and rail use colours from the same song artwork as Library, blended with the selected room palette. Falling notes have a solid satin face, a fine edge, readable numbers and separate next/hitting outlines. Blue/amber hand cues remain consistent; velocity still shapes highlights. Reduced motion keeps the teaching pose and removes material transitions.

**← / → jump back or forward five seconds on the displayed song clock**, like a video player, at every practice speed. Listen continues without another count-in and cancels the old sound queue; paused practice stays paused. Wait resumes at the next written attack. Perform stops the unfinished run without recording a grade. Jumps during a count-in begin at the displayed position, without extrapolating to an earlier beat. Song and active repeat bounds clamp without wrapping. The timeline accepts the same command; text/chat, volume sliders, selectors, tabs and piano-key navigation retain their own keys. Existing note navigation is preserved.

**762 unit/API tests, 14 focused seek/tempo tests and eight final native acceptance groups pass.** Real Appassionata, 晴天 and 龙卷风 scores were copied into isolated QA data. Native checks cover hand rendering/contact data at1280/800/390, reduced motion, tempo changes, paused/playing/rapid seeking, written/expressive timing, Wait/Perform behavior, count-in/audio cancellation and control ownership. Tested note-number contrast is at least6.50:1 on the base face. No renderer errors, sample fallback or queued voices after Pause. Root reviewed final captures and the live Desktop screen. Physical MIDI and audible quality were not retested; test audio was muted.

635 build inputs remained stable;522 packaged entries/helper and42 model/runtime/license files match. All3,035 installed entries match the exact native-tested candidate. ASAR: `048742fbf9aaefc5565678eb71685e20abda9cda703dfcf42bc0405a9a6aa8bc`. All **108 latest personal files remain byte-for-byte unchanged** after normal quit, installation and reopening. Native accessibility and screenshot show **晴天, paused at bar1/76, Lang Lang, Falling notes, Wait, Both hands,60%, neutral colours**. Practice is open. The previous2.25 app is recoverable in `.qa-runs/practice-art-2.26/previous-installed-Luma Keys-2.25.0.app`.

Earlier retained native runs contain harness-only repeat-bound/control-name/empty-overlay-selector mistakes. An initial elapsed-practice-time interpretation of the shortcut was revised to the displayed song clock before final acceptance. The final run uses the installed archive and actual repeat bounds, verifies the corrected count-in edge case explicitly, and was repeated with all762 tests after the count-in correction. The hand-lab's oversized URL was replaced with a smaller isolated scenario. No personal data was changed during QA. The first native reopening read timed out; the existing window's next full-path selection returned a healthy paused Practice screen. No forced restart or data recovery was needed.

Guide: `docs/PRACTICE_ART_2.26.md`. Evidence: `evidence/practice-art-2.26-verification.json`. No schedule extension.

## October 2 — Library and transitions 2.25 installed
**Installed and reopened `~/Desktop/Luma Keys.app` (2.25.0), preserving the newer 2.24 source and features.** Library has a compact header and resume card, a clearable search field, All pieces / Practised / Unplayed filters, and sorting by recency, title or composer. Search supports Chinese and full-width input. Covers, saved passages, exact resume bars, details, review and per-piece actions remain available. Restart labels now match their actions, and reaching the last bookmark no longer claims completion.

The app bar stays steady while its selected-tab indicator moves. Screen, dialog and chat entrances are coordinated without replaying nested animations. Rapid navigation commits the latest destination without stale captures restoring an old screen. Playback and reduced motion bypass these view transitions.

**758 unit/API tests and eight native acceptance groups pass.** The exact package was checked at 1280, 800 and 390 pixels for artwork, search, filters/sorts, keyboard menus, resume/repeat passages, rapid tab changes, settings/chat, mobile details/import and reduced motion. No renderer errors or model requests; isolated score bytes and practice preferences are unchanged. Independent visual review accepted the layouts. Earlier retained runs failed on obsolete QA selectors, a non-guaranteed companion-speech expectation and an unseeded startup day stamp; no app source changes resulted from those harness corrections. Physical MIDI, model quality and audible sound quality were not retested in this interface-only pass.

633 build inputs stayed stable; 522 packaged entries/helper and 42 model/runtime/license files match. All 3,035 installed entries match the tested candidate. ASAR: `0b0a35439990a1039cabef22406290b31b67e0a6b5e907d604fc9449f72ed24a`. All **108 latest personal files** remain byte-for-byte unchanged after normal quit, installation and reopening. Native accessibility confirms **晴天, paused at bar 1 of 76**, Lang Lang, Falling notes, Wait mode, Both hands and 60%. The updated Library is open and visually inspected with all ten personal pieces. The previous 2.24 app is recoverable in `.qa-runs/library-flow-2.25/previous-installed-Luma Keys-2.24.0.app`.

Guide: `docs/LIBRARY_FLOW_2.25.md`. Evidence: `evidence/library-flow-2.25-verification.json`; desktop/mobile captures: `evidence/library-flow-2.25-desktop.png` and `evidence/library-flow-2.25-mobile.png`. No schedule extension.

## September 30 — expressive playback & roaming companion 2.23 (source)
**Version 2.23.0 is built from source; the Desktop app is still 2.21.1 until it is repackaged and installed.**

- **Expressive playback, tailored to each piece.** Each piece gets a character: Nocturne, Ballad, Baroque, Dramatic or Clear. The plan shapes phrases, adds rubato (Listen & follow only, as a tempo map so the visuals stay in sync), voices the melody, infers section dynamics, rolls wide chords, adds a melody lead, varies repeated notes, and adds a harmony-following pedal where none is written. **Written** stays literal.
- **龙卷风.** All 71 bars were re-checked against the EOP PDF: no pitch, rhythm or tie errors. The source prints no dynamics or pedal, and the file played at one flat velocity with no pedal. `Library/tornado-gem-eop-8188.json` gains an editorial `performance` section plan (intro hits dry, verses held back, choruses opened, bridge build, coda ritardando). Notes, XML and PDF are unchanged. A restore copy is in `.qa-runs/claude-2.23-backup/`.
- **Acoustic backing.** The bass follows the harmony rather than the arpeggio, and the drums follow intro stabs, verse and chorus.
- **Companion.** It greets you, follows the pointer along the window edge while avoiding controls, hops between screens, perches on panels and reacts to choices, dances to the beat, cheers streaks and finishes, and dozes when idle. It can be turned off in Settings.
- **Interface.** The accompaniment panel has an animated band stage, switch, cards, chips and a *Hear two bars* preview. The whole app gains a motion layer.
- **Tests.** 488 unit/API tests pass, and `vite build` passes. Browser checks were run against `.qa-runs/claude-2.23/Library`, a copy of the library.

Details: `docs/EXPRESSIVE_COMPANION_2.23.md`.

## September 27 — plain interface copy 2.21.1 installed
**Installed and reopened `~/Desktop/Luma Keys.app` (2.21.1).** The screenshot's “A familiar face. A room of your own.” was already removed in2.21. This pass removes similar decoration elsewhere: selection toast is “Mozart selected”; colour settings use direct names or “Custom colours”; the daily goal shows only today's minutes; empty chat uses “Ask Mozart” plus its actual tasks; the guide subtitle names its contents. Exercises/Progress keep companion artwork without decorative room captions, and palette previews use literal colour names. Useful musical instructions, greetings and all controls remain. Saved conversations are not rewritten.

**11 existing companion/preferences tests and five focused native groups pass.** All six companion previews/toasts, empty-chat tasks/input, Exercises/Progress illustrations, active/custom colour restore, daily hint, reading guide, desktop/mobile chat and paused practice preservation were checked on the exact package. Independent source and visual review accepted six picker images, both chat sizes, Settings, and settled guide/Exercises/Progress captures. The first run's task-label expectation omitted the existing1–7 icon; corrected only the QA expectation and retained the failure. Three mid-transition screenshots were replaced by separately retained same-hash settled captures. No model inference/audio retest was needed for this copy-only change.

589 build inputs remained stable,512 packaged entries/helper and42 model/runtime/license files match;583 inputs are unchanged from2.21. All3035 installed bundle entries match the tested candidate. ASAR: `31e943f8bdab27b2f32d2bd9694ba85de4c685078fe6ddc7056b6162d7ec9d28`. All108 latest personal files remain byte-for-byte unchanged after normal quit, installation, reopening and resume. Native accessibility confirms Truth paused at bar105 of115; Beethoven, Falling notes and existing settings are preserved. Previous2.21.0 bundle is recoverable under `.qa-runs/plain-copy-2.21.1/previous-installed-Luma Keys-2.21.0.app`.

Copy notes: `docs/PLAIN_COPY_2.21.1.md`. Evidence: `evidence/plain-copy-2.21.1-verification.json`; exact native gate and settled captures: `.qa-runs/plain-copy-2.21.1/`. No schedule extension.

## September 27 — compact companion picker 2.21 installed
**Installed and reopened `~/Desktop/Luma Keys.app` (2.21.0).** The companion page is now a compact740×486px panel on the tested desktop, with six bilingual character cards, individual colour accents, a tappable greeting, one optional sound setting and an explicit Choose action. Removed the oversized poster, slogans, repeated room descriptions and advice. Saved Current and preview selection remain distinct. Short windows scroll the gallery while the footer stays reachable; opening the picker clears an old toast that could cover its buttons.

**472 unit/API tests and six final native groups pass**, with seven real hit/actionability checks across six window sizes. Checks cover all six choices, preview/Choose separation, sound on/off, keyboard/focus/Escape, reduced motion, greeting without chat/audio/inference, practice settings and saved bar7 after reload. Immediate apply/reopen at390×633 removes the stale notification in479ms and leaves Choose clickable. Eight final-package images pass independent visual review; all six character previews were also reviewed before the toast-only fix. Earlier failures remain separately retained.

All589 source inputs stayed stable;512 packaged source/assets/helper and42 model/runtime/license files match. Only five build inputs differ from2.20; audio, scores, model and conversation behavior are unchanged. All3035 installed bundle entries match the final tested candidate. ASAR: `4691e31416c70a734d08b05ec8512d14d426b98f82b3c3c2cc75ae30bec73379`.

All108 latest personal files remain byte-for-byte unchanged after normal quit, installation and reopening. Truth is restored paused at bar105 of115, Falling notes, Both hands,100%, with Beethoven. No personal chat/test messages were sent. Previous2.20 bundle is recoverable under `.qa-runs/companion-picker-2.21/previous-installed-Luma Keys-2.20.0.app`. The new picker is open with Beethoven unchanged, confirmed through native accessibility. Native screenshots intermittently retained an earlier frame; a fullscreen reveal and return to normal restored the live controls. Visual acceptance is based on independently captured exact-candidate native images, not those stale personal screenshots. No personal data repair was needed.

Guide: `docs/COMPANION_PICKER_2.21.md`. Evidence: `evidence/companion-picker-2.21-verification.json`; desktop/small-window previews in `evidence/companion-picker-2.21-*.png`. No schedule extension.

## September 27 — companion intelligence 2.20 installed
**Installed and reopened `~/Desktop/Luma Keys.app` (2.20.0).** The app is paused at **你离开的事实 · The Truth That You Leave, bar105 of115**, in Falling notes, Both hands,100%, with Beethoven and the compact chat available. Conversation options confirm **Qwen3.5 9B** and the user's saved Simplified Chinese preference. All **10 saved scores** validate; the revised Truth edition has **1581notes/115bars**. All **108 latest personal files** remain byte-for-byte unchanged after normal quit, installation, reopening and passage restoration. No personal chat requests were sent during verification. The previous2.18 app remains recoverable in `.qa-runs/companion-intelligence-2.20/previous-installed-Luma Keys-2.18.0.app`.

**This release supersedes every pending installation instruction in the historical2.19,2.19.1 and2.19.2 entries below.** Their clean audio, cat/piano icon and concise copy are included. The saved Truth arpeggio edition is loaded. Do not install any older staged candidate. No schedule extension.

The companion uses bundled, publisher-verified Qwen3.5-9B Q4_K_M weights through llama.cpp on Apple silicon. This is pretrained-model integration, not new foundation-model training. Six fictional voices use restrained humor; casual questions, translations and follow-ups reach the model. Thirteen persistent conversation languages include Simplified/Traditional Chinese, Japanese, Korean, Spanish, French, German, Portuguese, Italian, Russian, Arabic, Hindi and English. Arabic paragraphs use the correct direction. The latest60messages are saved; up to12recent messages fit the bounded context. Exact score lessons and app actions use separate deterministic, validated logic. Combined requests offer explicit loop/hand/speed buttons, stale actions are disabled, and model prose cannot operate the computer or silently change the score. Stop followed immediately by Retry now handles a still-closing local model without duplicating the question.

The approximately5.68GB model runs through a private Unix socket, with no cloud account, exposed model server or external model tools. It starts a new process for each reply and releases it afterward. Context/output are bounded and cancellation reaps owned processes. License, model cards and hashes accompany the bundle. In the isolated comparison, warm OS/file-cache first text was4–6seconds; the initial cold case was32seconds. Final packaged real requests showed first text in7–19seconds and completed in13–64seconds. Sampled model peak was approximately5.8GiB on this16GB Mac. Those timings are observations, not guarantees.

**472 unit/API tests and nine final native behavior groups pass.** Six controlled UI groups verify languages/RTL, responsive layouts, typing/IME isolation, explicit compound actions,60-message rollover, stale actions, cancellation and retry. Two separately retained real-model groups verify conversation recall after reload and Chinese preference with an English question. The final real streamed-reply/piano group matches **453/453 actual sampled note starts**, maximum onset error **11.61ms**, across four Appassionata sheet passages; Pause cancels eight queued attacks. This is muted WebAudio scheduling evidence, not physical listening/MIDI evidence. During actual text decoding, frame p95 was50ms and maximum250.4ms; visible pauses remain, and sheet changes were not isolated from inference load.

**Model quality remains mixed.** The exact Mozart comparison and Chinese casual-history regression improved. Retained tests also include incorrect Spanish/Hindi facts, verbose replies, an invented excerpt range and inaccurate counting/tempo explanations. General prose is not accepted as authoritative music teaching or universal task competence. Exact lesson cards remain English/Simplified Chinese. Prior failed runs are preserved and clearly excluded or limited to their independently passed prerequisite groups; they are not relabeled as passing.

All589 build inputs remained stable,512 packaged source/assets/helper files and42 model/runtime/license files match, and all3035 installed entries match the tested candidate. All187 protected audio source/assets match the accepted2.19 reference. Installed ASAR: `1e75fd9c8867d7ca45a96e39ea465b32622911df4a809fbe1de847dda6432cb1`.

Initial native screenshots/input stayed on a boot frame; a full-screen reveal restored the live HTML window. Returned to normal window, resumed the saved bar105 and verified Play/paused state through native accessibility. Read-only personal endpoints report healthy settings/library with zero issues; no source or personal-data repair was needed.

Guide: `docs/COMPANION_INTELLIGENCE_2.20.md`. Evidence: `evidence/companion-intelligence-2.20-verification.json`; final native gate and installation records: `.qa-runs/companion-intelligence-2.20/`.

## September 27 — Truth bar 88 arpeggio saved
**Applied the user-requested arpeggio to `Library/truth-eop-9266.json`.** The same score ID, title, saved practice positions and all other personal files are preserved. A new editable `Practice Sheets/你离开的事实 - Arpeggio transition.musicxml` is saved; exact original JSON/XML restore copies are in `Assets/Truth Arpeggio Transition/`. No application source or package changed. **The running app has not reloaded because CUA still reports the Mac locked; installed app remains 2.18.0 and the combined 2.19.2 candidate remains the next app update.**

The screenshot's practice 87–89 maps to printed 55/73/74. Original printed73 deliberately has a three-beat RH rest, so this is an editorial fill, not a source correction. Bar88 adds11 gentle B-flat-major sixteenths passed from LH to RH, rises to B-flat5 and settles through F5 into the existing G octaves. The bass is softer with its original3-beat duration; pedal releases at the octave pickup. All other bars, original octave pickups, 115-bar route, score tempo and original PDF are unchanged. The added notes and pedal are written in MusicXML and matched in every practice view. Details records the arrangement.

Final native checks pass16/16 written bar88 attacks (maximum measured onset error16ms), representative LH/RH/high-register finger contacts, original five-page PDF access and actual JSON reimport of1581notes with identical XML/pedal. All owned apps/browsers closed normally, no runtime/request errors. Matched48k stereo previews cover bars86–90:59→70 notes, peak0.653, zero clipping/sample fallback, bar88 average level +0.28dB. The final engraving-only revision preserves the exact70-event production audio plan; this equivalence is documented rather than claimed as another render.

**Known viewport limit:** compact initial auto-follow leaves15.3px of the low LH rest below the viewport. Normal sheet scrolling or Hide keyboard shows all notes/rests/pedal; final visual captures confirm reachability. No broader sheet-engine change was made. Source rolls at40/72 remain subject to the previously documented playback limitation.

Evidence: `evidence/truth-arpeggio-transition-verification.json`. Preview: `Assets/Truth transition previews/After - Truth transition bars86-90 at130BPM.wav`. Original/candidate hashes and the exactly two changed personal paths are recorded in `.qa-runs/truth-arpeggio-20260927/applied.json`.

**Next after unlock:** normal save/quit; install the existing tested2.19.2 using `.qa-runs/concise-copy-2.19.2/install.py install`; reopen the current piece and verify the new library score loads; restore latest saved bar paused. Preserve this new arrangement during the fresh installation snapshot. No schedule extension.

## September 27 — concise lesson copy 2.19.2 staged
**Version 2.19.2 is built and staged; the Desktop app remains 2.18.0 while the Mac is locked.** This combined candidate includes the pending clean-audio fixes and new cat/piano icon, and supersedes both earlier installation candidates. CUA again reported the locked Mac. No personal files or running app bundle were changed.

The built-in lesson headers now show plain composer credits: Beethoven, Traditional, and Luma Keys. Removed “a two-hand challenge,” “first steps,” and “learn the numbers”; shortened “Your first C major scale” to “C major scale.” Ode to Joy’s beginner-arrangement information remains in Details. Excerpt titles, edition names, practice tips, and imported score credits remain intact. A one-bar sheet passage now reads “Bar 9 of 9” instead of “Bars 9–9 of 9.”

40 existing music/artwork tests pass. All four built-in pieces pass final packaged header/library, Details, About, three-view and play/pause checks. Twelve captures cover 1280px and 800px; the exact single-bar label passes at both widths. Musical fields, note arrays and IDs match the immutable 2.19.1 package (only display copy and parser-created timestamps excluded). No runtime/request errors; the owned QA app closed normally. Root visually reviewed the concise header and Library; evidence is `evidence/concise-copy-2.19.2-verification.json`. The source delta from the accepted 2.19.1 candidate is limited to these lesson strings, the single-bar display, and package version. All 588 build inputs are stable, 512 packaged entries/helper match, and all 2,992 staged bundle entries match. Archive: `2cef29e89c1cbc1841be9acecf0390528dd22a7ea18195db0df5f53a691c89a9`.

**Next after unlock:** save and quit the installed app normally; use `.qa-runs/concise-copy-2.19.2/install.py install` and `verify-installed.py`, preserving the latest personal state. Do not use the superseded 2.19 or 2.19.1 installers. No schedule extension.

## September 27 — new app icon and audio update 2.19.1 ready
**Version2.19.1 is fully built, tested and staged; the Desktop app remains2.18.0 while the Mac is locked.** The latest combined candidate is `.qa-runs/icon-2.19.1/install-ready.app`, superseding the staged2.19 audio-only candidate. CUA again reported the locked Mac; no force quit or in-use bundle replacement was attempted. The prior request to unlock is still pending.

The new icon is an original ivory cat resting its paws on piano keys, with deep teal and a muted brass rail. It replaces the generic cat/star mark. Editable detailed and small SVG masters,1024PNG, a native ICNS and all ten macOS PNG representations are saved in `Assets/App Icon 2.19.1/`.16/32pixel exports use simpler artwork; the favicon matches. No generated raster artwork was used. Independent visual review accepted actual exported sizes on light/dark backgrounds and all alpha/padding checks. The legacy1x16/32 ICNS representations have benign RGB rounding at semitransparent corners; their alpha and opaque artwork match, and the other eight representations are exact.

All three final native smoke groups pass: packaged/served icon resources, saved state, both saved scores, sampled playback/pause and a real WAV through the shared protected output. All314 protected musical source/audio-asset hashes match the verified2.19 audio release; its410 unit/API tests,36 waveform renders and six native groups remain applicable to unchanged audio.588 build inputs are stable,512 packaged source/assets/helper entries match, and all2,992 staged bundle entries match the tested candidate. ASAR: `5c0234c3c3e69d18908e67abf3a351eb546e33cfc9854e6eaa1fcf903caaae16`. Owned QA apps closed normally, no runtime/request errors, personal scores unchanged. A harness-only built-in-card count assumption from the first native attempt remains separately retained.

**Next after unlock:** save/quit the installed app normally; run `.qa-runs/icon-2.19.1/install.py install` (not the superseded2.19 installer); reopen and restore the latest saved bar without playing; run `.qa-runs/icon-2.19.1/verify-installed.py`. Update both icon/audio evidence with the installation result and latest personal-state preservation. Do not overwrite the user's latest preferences from earlier snapshots.

Preview: `evidence/app-icon-2.19.1-preview.png`. Evidence: `evidence/app-icon-2.19.1-verification.json`. Asset guide: `Assets/App Icon 2.19.1/README.md`. No schedule extension.

## September 27 — clean audio 2.19 tested; installation awaits unlock
The complete 2.19.0 update is built and staged in `.qa-runs/audio-clean-2.19/install-ready.app`. The **Desktop app is still 2.18.0**: CUA reported that the Mac is locked, so normal save/quit/reopen is unavailable. The user has been asked to unlock. No force quit or replacement while running was attempted.

The update fixes reproduced loud-passage clipping through one shared protected output for piano, generated accompaniment and imported audio. Pedal-held continuations resume their decayed waveform instead of replaying every hammer strike. Half-millisecond attack fades and four-millisecond metronome-stop fades reduce boundary clicks. All original six-layer piano recordings, score events, room choices and independent mix sliders remain.

**410 unit/API tests; 6 final native groups; 36 matched waveform renders at 44.1/48 kHz pass.** Native playback matched 354/354 written attacks across dense Appassionata, its coda and Tornado, with all 31 future attacks canceled on transport changes. Actual imported WAV playback, input ownership, other-hand guidance, loops, mute, rooms and reload pass. All 180 FLACs match their original checksums. Dense piano plus backing falls from a clipping peak of 1.419 to 0.915; no final test engages the emergency ceiling. Quiet C4 levels stay within .025 dB; max-volume coda average changes about −1 dB. Pedal-resume burst peak falls from 2.515 to .134 in the isolated waveform comparison. These are software signal checks, not a listening-device or physical MIDI claim.

All 586 build inputs and 510 packaged source/assets/helper entries match. The staged 2,992 bundle entries match the native-tested archive `1891a0c9c1f97703cf9221c5bea49c08ffaeed88ba52719bc8654dc7f7c3e26e`. Owned QA apps are closed; personal source scores are unchanged. One harness-only malformed range-input attempt is retained separately. Latest personal files will be snapshotted after normal quit before installation.

Next: after unlock, use normal app Quit to flush current settings, run `.qa-runs/audio-clean-2.19/install.py install`, reopen, restore the saved bar without starting playback, and run `verify-installed.py`. Then update this status and `evidence/clean-audio-2.19-verification.json` with installed/preserved results.

Guide: `docs/CLEAN_AUDIO_2.19.md`. Audio comparison assets: `Assets/Audio Previews/Clean Audio 2.19/`. No schedule extension.

## September 27 — concise practice workspace 2.18 installed
**Installed and reopened `~/Desktop/Luma Keys.app` (2.18.0).** The app is paused at **龙卷风 · 邓紫棋版, bar 69 of 71**, in Falling notes with the user's **Beethoven** theme. All **10 saved pieces** and all **107 latest personal files** remain byte-for-byte unchanged after normal quit, installation and reopening. The fresh installation snapshot includes the user's practice and conversations made while this update was being developed. The previous 2.17 app is recoverable under `.qa-runs/practice-clarity-2.18/previous-installed-Luma Keys-2.17.0.app`.

The main workspace now has a compact score header, view tabs, a steady timeline and one primary transport row. **Score tools** holds review/export/help and full score details; **Practice tools** holds volume, accompaniment and passage settings. Playback, mode, hands, speed and the active loop remain directly accessible. Drawers and nested dialogs preserve focus and keyboard ownership. The complete grand staff fits above the shorter piano; all 88 key nodes, hand/runway/Focus controls, mini companion and six room themes remain available. No generated artwork was added.

More curved outer fingers, a tapered palm, quieter nails and active finger badges refine the procedural hands. The short guide retains pitch and finger information. Across 168 matched poses and 288 pressed contacts, fingertip coordinates and contact states are unchanged (maximum coordinate difference 0 px). Fingering remains a suggestion.

**Synchronization:** a reproduced 80 ms scheduling-horizon failure dropped notes when the sheet engine blocked for roughly 333 ms. Automatic audio now uses a shared 0.5 second horizon with pause/seek/speed cancellation. Bounded MusicXML engraving retains staff state and spanning notation, while Review keeps the entire original score. On the exact installed candidate, dense Appassionata, its coda and a fresh Sheet switch matched **559/559 written attacks**, maximum onset error about **5.3 ms**. Dense/coda maximum frame gaps were **66.6/100 ms**, with p95 about **18.6 ms**. Initial Sheet opening still produced a **266.6 ms visual pause**; audio stayed intact. These are muted native scheduling measurements, not physical speaker latency.

**403 unit/API tests pass; all 7 final native UI groups pass, with 27 screenshots reviewed.** Verification covers all views, source score preservation, full Review, controls, loops, simulated MIDI, typing isolation, hands, mini chat, six themes, reduced motion and four window sizes. All 585 build inputs stayed stable; 510 packaged source/assets/helper entries and all 2,992 installed bundle entries match. Installed archive: `58d1cb41c815ecae675278a4c3f7d4308c57b28789c47f4efb37e244d9ae4dbf`.

Remaining narrow-layout quirks are nonblocking: speed buttons can stack and mobile accompaniment uses an icon with its accessible name. Physical MIDI, speaker latency, arbitrary PDF recognition and general model quality were not re-audited. Earlier rejected candidates remain separate from final2 evidence. No schedule extension.

Guide: `docs/PRACTICE_CLARITY_2.18.md`. Evidence: `evidence/practice-clarity-2.18-verification.json`; screenshot: `evidence/practice-clarity-2.18-sheet.png`; detailed reports: `.qa-runs/practice-clarity-2.18/`.

## September 27 — mini companion 2.17 installed
**Installed and reopened `~/Desktop/Luma Keys.app` (2.17.0).** Library and the new mini Lang Lang conversation are open side by side. All **10 saved pieces**, the Appassionata **bar-378** bookmark and all **107 latest personal files** remain unchanged after a normal quit, installation and reopening. No personal chat messages were sent during QA. The previous 2.16 app is recoverable under `.qa-runs/companion-mini-2.17/previous-installed-Luma Keys-2.16.0.app`.

The full modal chat is now a compact, non-modal 352px panel. It makes room beside the music on wide windows, stays below navigation on narrower layouts and folds into a small pet tab without losing a draft. Main navigation and playback remain usable. Chat input owns its keyboard shortcuts, held computer notes release on entry, and Escape restores a visible opener, including Focus mode. Closing, minimizing, changing score/companion or opening a dialog cancels unfinished generation. Six portraits have bounded gaze/typing feedback and finite alternating heart-wave/music greetings, with still feedback under Reduced Motion.

Explicit Chinese/English requests receive a brief local acknowledgement and persist through follow-ups and saved history. Exact practice teaching remains grounded in written notes. Short timed-practice requests and clarification now use one current-bar action; a selected “Both hands” filter is no longer described to the model as proof of two written parts. General replies use a smaller output budget and clearer context; repeated sentences interrupt with an honest error/retry state.

**391 unit/API tests passed; all 8 final packaged UI groups passed.** Native verification covers five sizes, six profiles, typing/IME, simulated MIDI, drafts, focus, stale actions, streaming/cancellation, language continuity, history/reload, mobile options and reachable lower practice controls. An independent visual review accepted 16 final captures. All 510 packaged source/assets and the native helper match; all 2,992 installed bundle entries match the tested candidate (`97ffa38b68fe7a6a97d1303e962807ef2f71916e3719595da2ca6d05049614af`).

**Model quality is not an all-pass result.** Final packaged testing confirmed the exact one-hand teaching regression is fixed, plus local Chinese preference and English switching. Two genuine model replies succeeded (Chinese relaxation, English encouragement), but `I am tired today` was declined by Apple’s model. The app cleared pending state, kept playback stopped and exposed retry; no retry was made to manufacture a pass. Advice remains basic and may be mistaken. No model retraining or cloud service was added. Earlier failed model outputs and UI attempts are retained separately.

Guide: `docs/COMPANION_MINI_2.17.md`. Evidence: `evidence/companion-mini-2.17-verification.json`; detailed runs in `.qa-runs/companion-mini-2.17/`. No schedule extension.

## Latest direct-user continuation — cartoon song covers 2.16.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.16.0).** Library is open with the new cartoon Appassionata hero, the user's saved bar-378 Continue action, Lang Lang companion and all ten saved pieces. All **107 latest personal files** remain byte-for-byte unchanged after normal quit, installation and reopening. The previous 2.15.0 app is recoverable in `.qa-runs/cartoon-covers-2.16/previous-installed-Luma Keys-2.15.0.app`.

### Artwork and recognition
Fourteen original full-color cartoon illustrations replace the painted covers: mini Beethoven and friendly storm clouds, Sunny Day's schoolyard kitten, a duet and a sunset recital, Tornado's purple kitten/whirlwind, Truth's goodbye penguin, Moonlight's crescent-boat bunny, Gymnopédie's balancing fox, Bach's owl, a first-steps garden, Twinkle's teddy/star, Ode's animal quartet, Für Elise's robin and a neutral kitten librarian. The three Sunny Day editions now have distinct covers, and the starter songs no longer share a generic scene. Stable saved identities and bounded title/composer aliases keep covers attached to the correct work and edition. Unknown imports use the neutral illustration. Theme frames retain their colors; art keeps its own palette.

Full-size 1536×1024 PNG originals, exact built-in imagegen prompts, edit history, checksums and an offline gallery are saved in `Assets/Cartoon Covers 2.16/`. Cards retain full 3:2 art. Focal adjustments protect Appassionata/Tornado cloud faces and Gymnopédie's fox ear in wider Continue crops. These scenes interpret the songs; they are not official album artwork or instructional instrument diagrams. The tiny ambiguous gold detail remaining on Sunny Concert after two cleanup attempts is documented and not readable as lettering at card size.

### Verification
**373 unit/API tests pass.** The final Mac package passes **6 native acceptance groups**: all 14 cards and 13 distinct known covers, separate neutral art, four responsive sizes, all six companion palettes, Chinese search and three Sunny editions, exact paused resume/saved ranges, reduced motion, unknown import and unavailable-image recovery. There are no renderer/request errors. An independent review inspected **30 final screenshots** and found no material issues; its report distinguishes native captures from source-based hero crop analysis. The installed Appassionata hero was additionally checked directly in the personal app.

All **578 build inputs** remained unchanged through the final package; **509 packaged source/assets/helper entries** match, and all **2,992 installed files/symlinks** match the staged candidate. The installed archive matches the native-tested SHA256. The earlier preliminary native run was interrupted during final crop refinements, retained as interrupted and excluded from acceptance. Owned QA apps are closed. Existing audio, recognition, hands and chat behavior were outside this visual pass; physical MIDI was not tested. No schedule extension.

Evidence: `evidence/cartoon-covers-2.16-verification.json`; guide: `docs/CARTOON_COVERS_2.16.md`; native screenshots and detailed reports: `.qa-runs/cartoon-covers-2.16/`.

## Latest direct-user continuation — song artwork 2.15.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.15.0) on Library.** All ten saved editions remain available, with the user's Appassionata resume at **bar 378**, Lang Lang companion and all **107 latest personal files** byte-for-byte unchanged after normal quit, installation and reopening. The previous 2.14.0 app is recoverable under `.qa-runs/song-art-2.15/`.

### Artwork and identity
Eight original full-color paintings replace the three shared scene families for the current collection: crimson motion and a dark sea for Appassionata; nostalgic school chairs after rain for 晴天; a windblown city scene for 龙卷风; an empty platform bench and departing train for 你离开的事实; a moonlit lake, a solitary dancer, repeating sunlit arches, and a kitten's first stepping stones for Moonlight, Gymnopédie, Bach BWV846 and First Steps respectively. These are visual interpretations rather than claims of official song/composer narratives.

All three 晴天 arrangements share their song's painting while retaining distinct titles, files and practice history. A pure resolver uses known work identities and bounded multilingual title/artist aliases; unrelated mood words and arbitrary hashes no longer choose a cover. Unknown imports and other starter pieces keep neutral artwork. Cards display the original 3:2 composition, the Continue panel uses per-image focal positions, and theme tinting over the paintings is removed. Room colors continue through the frame and controls.

Full-size original PNGs, exact built-in imagegen prompts, source paths and checksums are saved in `Assets/Song Covers 2.15/`; `index.html` is an offline gallery. All eight final app copies match the originals. One generated signature-like mark on Gymnopédie's first variant was removed with the image-generation tool; its initial variant and edit prompt are retained. No external album artwork or lyric text was used.

### Verification
**370 unit/API tests pass**, including eight work-identity regressions. The final 2.15 package passes **eight native groups** covering all ten cards and eight local image identities, four responsive sizes, six companion rooms, Chinese search and edition distinction, exact resume/saved passages, Details and keyboard focus, stationary artwork buttons, reduced motion, unknown import and unavailable/restored images. Zero renderer/request errors; all ten isolated QA score files remain unchanged. Independent visual review accepts **26 screenshots**. Earlier harness interruptions and selector repairs remain recorded; passed cover/layout evidence is explicitly reused only under the identical final archive hash.

All **564 build inputs** remain unchanged; **495 packaged source/assets/helper entries** match; all **2,992 installed files/symlinks** match the staged candidate. The installed archive matches the final native-tested SHA256. Personal files were hashed again after reopening; no music, progress, settings or conversation files changed.

Evidence: `evidence/song-art-2.15-verification.json`; guide: `docs/SONG_ART_2.15.md`; detailed reports and recoverable previous app: `.qa-runs/song-art-2.15/`. Audio, physical MIDI and arbitrary PDF recognition were not re-audited in this artwork-only pass. No schedule extension.

## Latest direct-user continuation — natural hands 2.14.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.14.0).** The app is paused on the user's latest Appassionata position at **bar 378 of 569**, with Lang Lang, Falling notes, both hands and 100% speed preserved. All **107 latest personal files** remain byte-for-byte unchanged after normal quit, bundle replacement and reopening. All ten pieces remain intact. The previous 2.13.0 app is recoverable in `.qa-runs/natural-hands-2.14/previous-installed-Luma Keys-2.13.0.app`.

### Hand illustration and movement
Curved resting fingers, articulated joints, shorter diagonal thumbs, a compact knuckle arch and tapered wrists replace the flat splayed pose. The palm opens for actual chord spans and relaxes after release. Warm matte shading, subtle nails and softer creases fit the illustrated app; wrist fading is confined to the front rail. Compact keyboard layouts retain visible palms. Finger contours stay rounded during movement, and idle labels yield when they obscure a playing finger. Blue left-hand and honey right-hand guidance remain clear across all six companion rooms.

Precise white/black-key contacts, held-note positions, repeated-note lifts, preparatory leaps, pause/seek behavior, reduced motion and pointer-through input are preserved. The hand artwork remains procedural so fingertips can follow the actual notes. Suggested fingering itself is unchanged.

### Verification and installation
**362 unit/API tests pass.** Final visual review covers **84 poses and 144 pressed contacts**, with zero horizontal contact error in the isolated pose fixtures. The actual final Mac package passes **10 native acceptance groups**: seven fixed poses, the user's mixed black/white thumb-and-ring reach, all six rooms, pointer/computer/simulated-MIDI ownership, repeated notes, held fingers, leaps, pause/seek, reduced motion and dense playback. There are no renderer or request errors. Three short 9,600-note samples measured median 16.7 ms and p95 17.5–17.6 ms, with no frames above 33 ms at the recorded 1480×980 DPR1 test setup.

All **555 build inputs** remained unchanged through final packaging; **487 packaged source/assets/helper entries** match, and all **2,992 installed bundle files/symlinks** match the staged candidate. The installed archive matches the final native-tested SHA256. Native reopening confirms the saved piece/bar and final artwork. The initially partially offscreen window was fitted with the normal macOS zoom action for visual inspection; no app preference or music file was changed.

Evidence: `evidence/natural-hands-2.14-verification.json`; guide: `docs/NATURAL_HANDS_2.14.md`. Full logs, source snapshots, rejected visual iterations, regression evidence and final contact sheets are in `.qa-runs/natural-hands-2.14/`. Physical MIDI hardware was not tested; native QA audio was muted. These frame timings are short controlled samples, not a guarantee for every device. No schedule extension.

## Latest direct-user continuation — five free practice pieces, September 27
**Added all five verified editions to the existing Desktop app (2.13.0), then reopened it on Library.** The Library now visibly contains **10 saved pieces**. The user's latest 晴天 chord-arrangement position at **bar67**, accompaniment preference, Lang Lang companion and all **68 existing personal files** are preserved byte-for-byte. Exactly **39 new score/source/provenance files** were added, with unique filenames and no overwrites. No purchase or app-bundle replacement was needed.

| Added edition | Practice bars | Sounding notes |
|---|---:|---:|
| 你离开的事实 · The Truth That You Leave — 高至豪 | 115 | 1,570 |
| 龙卷风 · 邓紫棋版 — 周杰伦 | 71 | 1,818 |
| Moonlight Sonata · I. Adagio sostenuto | 69 | 1,144 |
| Gymnopédie No.1 | 78 | 455 |
| Prelude in C major · BWV846 | 35 | 549 |

### Sources and music verification
The user has no owned files and asked to avoid paying. Individual Everyone Piano viewers explicitly permit downloading their intact posted score images for personal learning; this supersedes the earlier paid-source-only finding. Saved all five Truth pages and six Tornado pages without removing watermarks. They are community piano editions for private local practice, not redistributed app/SaaS content or claims of exact studio arrangements. The three classics use primary Mutopia editions: Bach/Gymnopédie Public Domain, Moonlight CC BY-SA2.5 with Stewart Holmes attribution. Original PDFs and edition/licence notes are retained and available through Review → Original PDF.

Local recognition was corrected against all source pages, including independent spot reviews. Truth's printed D.S./Coda follows1–72,41–55,73–100, giving115 practice bars; its final8va and LH clef change are realized. Tornado's missing notes/rests, triplets, ties, accidentals and octave lines were corrected, including independently caught bar54/62 errors and the unusual printed B#2 in bars10/14. Every modern staff-bar totals4beats, ties connect correctly, and all corrected sounding events match parser output. The classics are cross-checked against primary LilyPond/reference MIDI; all source onsets are retained. Every final score round-trips exactly from its embedded XML. Generated staff notation now has appropriate beams; Moonlight has visible triplet3 groups.

### Native verification and installation
Final isolated 2.13.0 runs pass all five score payloads; first/middle/final-bar Number/Sheet/Falling views; both hand filters and pitch labels; sampled piano playback against the tempo clock; natural endings; source PDF endpoint hashes and every page rendering; and fresh-process Continue at the saved final bar. No renderer/request errors or sample fallback/cache misses occurred in those passages. The final file hashes match the native-tested fixtures. An auxiliary visual assertion guessed a nonexistent OSMD tuplet CSS class; the expanded screenshot directly confirms beamed triplets and visible3s. This is documented, not hidden as an app failure.

Normal-quit installation atomically added only the39 new files. Final reopening confirmed10 pieces and the latest personal bar67 resume, with all68 old files unchanged. Evidence: `evidence/song-library-20260927-verification.json`; full reports, original recognition, repair logs and hashes: `.qa-runs/song-library-20260927/`. Guide: `Practice Sheets/Added pieces - September 27 2026.md`. App code/assets and Claude's earlier work were unchanged; no schedule extension.

### Edition limits
These are complete practice editions with documented interpretation choices. Truth plays rolled chords together and keeps its nonnumeric final ritardando at the selected tempo. Tornado's grace microtiming is editorial and its bar50 glissando plays written endpoints. The classics simplify engraving/expression and use written fermata durations; Bach's final rolled chord is simultaneous. Original performance marks remain in the source PDFs. No original studio backing recordings or physical MIDI hardware verification were added in this content pass.

## Latest direct-user continuation — illustrated Library 2.13.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.13.0).** The redesigned Library is open on the user's Appassionata with its saved bar-3 resume, Lang Lang companion and five saved pieces. All **68 latest personal files** remain byte-for-byte unchanged through normal quit, installation and reopening. The recoverable previous 2.12.0 app is in `.qa-runs/library-illustrated-2.13/`.

### Visual and interaction changes
- Three original painterly illustrations replace the abstract waveform jackets: storm coast for Appassionata, sunlit room for 晴天 and moonlit conservatory with a sleeping cat. Assets are bundled locally; full-size originals and exact imagegen prompts are saved in `Assets/Library Art/`.
- A large illustrated Continue card keeps the saved bar, one primary action and saved passages. The statistics grid is removed from the default view. Collection cards retain full titles, compact bar/key labels and review notices; Details reveals descriptions, source, tempo, note count and history. Same-title arrangements keep stable distinct labels. Search and all existing library actions remain available.
- The Library companion responds to pointer, touch, Enter and Space with a finite greeting. Its name opens the existing conversation without sending a message. Artwork has gentle hover/focus zoom, stationary press geometry, stable loading dimensions and a decorative fallback. Live reduced motion removes decorative movement. Space on a Details disclosure no longer reaches global playback shortcuts.
- Visual QA identified inherited press/brightness effects on art buttons and stretched neighboring cards when Details opened. Both were corrected; the final native regression verifies stationary artwork and independent card heights.

### Verification
**354 unit/API tests pass.** The final package passes **8 native acceptance groups** with zero renderer errors: four responsive sizes, all six palettes, loaded images, unclipped controls, exact resume/saved passages, Chinese search and duplicate arrangements, details/focus/Space, failed/successful removal with original retention, invalid-to-valid import, empty collection, companion greetings/chat access and reduced motion. Desktop, mobile, theme and expanded-card screenshots were independently inspected. All **487 checked packaged source/assets/helper files** match the final build; all **2,992 installed files/symlinks** match the staged candidate. Owned QA apps are closed; the personal app remains open.

Evidence: `evidence/library-illustrated-2.13-verification.json`; guide: `docs/ILLUSTRATED_LIBRARY_2.13.md`; art provenance: `docs/LIBRARY_ART_2.13.md`. The scoped source patch, before copies, iteration screenshots and final reports are in `.qa-runs/library-illustrated-2.13/`.

This pass uses three atmospheric scene families, not a unique cover for every score. It preserves the 2.12 piano and earlier reader/keyboard work; physical MIDI, arbitrary PDF recognition and native-model conversation quality were not retested in this Library-focused pass. No schedule extension.

## Previous direct-user continuation — concert piano 2.12.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.12.0).** Verified the new Sound settings in the installed app: Yamaha C5 grand, Concert selected, the user's Hall preference preserved, Appassionata restored with resume at bar 3. All 68 latest personal Library, Exports and Practice Sheets files remain byte-for-byte unchanged after clean quit, installation and reopening. The previous 2.11.0 app is recoverable in `.qa-runs/concert-grand-2.12/`.

### Instrument and phrasing
- Replaced the primary single-layer MP3 instrument with **180 original lossless stereo Yamaha C5 recordings**, six touch levels at 30 pitches each; source and CC BY 3.0 licence bundled. It is not a Steinway instrument. Original decay tails remain intact, with attack-offset playback, register-dependent damper release and natural stereo positioning. Independent source analysis caught C8 recordings about 99 cents sharp; playback corrects that source, including its transposition to B7.
- A 512 MiB decoded-buffer cache warms upcoming notes at their actual playback velocity (including softened accompaniment). Three concurrent loads and 96 voices bound work; loop boundaries prewarm their return. This cache budget is not total app RAM. An uncommon cold live strike may use a nearby cached touch while the exact touch loads.
- **Settings → Sound → Concert / Written** controls interpretation. Both follow written timing and verified articulation. Concert gently voices inner chords and shapes explicit, bounded crescendos; Written preserves authored velocities. Appassionata retains all 136 sforzando note velocities, its existing tempo map and all original pitches/durations. Its 186 ending articulation marks now affect key release. Final released notes ring after natural completion; manual Pause/seek still stop them. Resuming within a written pedal span restores notes held by that pedal.

### Verification
- **353 full-suite tests passed**, followed by the additional C8/B7 source-tuning regression; **31 final focused audio tests passed**. All 180 recordings passed checksums and complete ffmpeg and real Chromium decoding.
- Five real waveform groups passed across A0–C8, including touch/timbre contrast, delayed attacks, pedal/release, ownership, cancellation and dense-polyphony headroom. The 512-note stress passage peaked at 0.956 with no clipping, 69 voices maximum and no sample fallback. B7/C8 tuning measured within 0.5 cent; other representative notes retained natural acoustic stretch within 35 cents.
- The actual Appassionata bars 558–569 rendered 151 source notes at 180 BPM: no clipping, nonfinite signal or cache fallback. A WAV preview is saved in `Assets/Audio Previews/`. The after version is louder at equal volume settings; this is not a level-matched subjective listening comparison.
- **18 packaged native groups passed**, including the existing 12 input/MIDI ownership/cancellation groups, phrasing persistence, natural ending/manual-stop separation, and three 9,600-note frame runs. Median 16.7 ms, p95 16.8–17.6 ms, maximum 33 ms; no renderer errors or sample fallback. Physical MIDI hardware was not used.
- Final package: 484 source/assets checked plus matching native helper; installed bundle's 2,992 files/symlinks matched the staged build. Consolidated evidence: `evidence/concert-grand-2.12-verification.json`; detailed source/runtime notes: `docs/CONCERT_PIANO_2.12.md` and `docs/PIANO_SAMPLES.md`.

# Luma Keys — installed and verified

Updated September 27, 2026 America/New_York.

## Current direct-user continuation — version 2.11.0

Installed and reopened the Desktop app with stable engraved-sheet following, coordinated keyboard materials and an illustrated Library. The Library is left open with the user's Lang Lang palette, five saved pieces and Appassionata bar-3 resume intact. All **68 latest personal files** remain byte-for-byte unchanged through installation and reopening; all **2,992 installed bundle entries** match the verified candidate. No personal practice or chat was sent by QA.

### Sheet playback
- Reproduced the reported Appassionata shake at bars193–200: the oversized grand-staff cursor repeatedly alternated the viewport between113.5px and83.5px. Following now aligns a system once, preserving manual scrolling within it. Stable scrollbar space and disabled browser scroll anchoring prevent width/position feedback.
- Replaced per-onset fresh iterators (which scanned from the beginning of the sonata) with two independent persistent iterators, and cached the cursor raster by appearance. Actual-OSMD playback within the passage produces no engraving or raster regeneration. Pickup forward/backward mapping and next/previous passages pass.
- Corrected the audible playback clock so output latency cannot briefly send the reader to the previous passage after starting or looping; tempo changes still follow the score map and negative count-ins remain valid.
- In comparable9-second packaged Appassionata samples, repeated within-system scrolling is gone; the final range sequence is193–200 then201–208, without the earlier185–192 flicker. Median frame interval stays16.7ms, p95 improves17.2→16.8ms, and intervals above33.4ms fall6→1. A250ms synchronous passage-engraving pause remains; this is not a claim of zero lag or universal hardware performance. The existing compact sheet height remains; oversized systems can be manually scrolled.

### Keyboard and Library
- Six room palettes now cover case, runway, felt, rail, key faces and captions. Manual colour choices stay authoritative. Input hit boxes, key/hand geometry and honey/blue teaching colours remain unchanged. Inactive white pitch numbers measure5.39–5.74:1 against their materials; pressed labels remain readable. No new per-frame effects or animations.
- Original six-motif score jackets, recital-program typography, compact metadata and readable saved-passage chips refine the Library. Artwork is stable per score and follows room colours. Search, separate same-title arrangements, import recovery, resume, saved passages, open and remove callbacks remain intact.

### Verification
**326 unit/API tests pass**, including6sheet-helper and3new audible-clock cases. Final native checks pass5integrated theme/library groups and12piano-input groups. Independent actual-OSMD checks cover the long score, navigation, held onsets, pickup and rewind. Six Library groups pass across seven widths; six keyboard groups include30manual-theme combinations. Final packaged playback and Library/Mozart screenshots were inspected; installed Library was visibly checked. The source/assets/helper integrity check covers301files.

Evidence: `evidence/reader-atelier-2.11-verification.json` and `.qa-runs/reader-atelier-2.11/`. The previous2.10.1 app is recoverable in that run directory. All owned QA browsers/apps/servers are closed; the updated personal app remains open. No schedule extension. Physical MIDI hardware, new PDF recognition and general-model conversation were not retested in this scoped pass.

## Previous direct-user continuation — version 2.10.1

Installed and reopened the Desktop app with the Progress text-overlap fix. The daily goal value now lives in the chart header (“Daily goal · 20 min”), outside the bars; this heading wraps on narrow screens, and the accessible chart description includes the goal. All 28 native chart states and a live goal change pass. Coverage includes seven empty/populated/outlier/goal scenarios, all six companions and widths 1280/900/390/320. At320, the unrelated existing document width remains340px in both old and new packages; the goal label/card stays within the viewport. No new page overflow occurs at390 and above. No renderer errors.

All 301 checked packaged files/helper match the build, all 2,992 installed bundle entries match the candidate, and all 68 latest personal files remain byte-for-byte unchanged through reopening. The installed Progress screen was visibly checked and is left open. The prior2.10.0 app is recoverable in `.qa-runs/progress-label-2.10.1/`. Only the Progress component, its scoped styles and package version changed. Evidence: `evidence/progress-label-2.10.1-verification.json`. No background QA processes remain.

## Previous direct-user continuation — version 2.10.0

Installed and reopened `~/Desktop/Luma Keys.app` **2.10.0**. The larger, interactive Lang Lang portrait is open in the companion conversation. All **68 latest personal files** in Library, Exports and Practice Sheets remain byte-for-byte unchanged through installation and reopening, including the user's latest exports and preferences. All **2,992 installed files/symlinks** match the verified candidate. The saved Appassionata bar-3 resume, Lang Lang, Falling notes, 100% speed, both hands and piano volume 1 are intact. No personal chat or practice was sent by QA.

### Companion and teaching
- Six expressive chat portraits respond to click, touch, Enter or Space with finite greetings; subtle gaze, blinking, thinking and reply gestures respect live reduced motion. The existing playing-stage gestures, hands, keyboard and sound engine remain intact.
- Teaching requests now produce short English/Chinese lessons from the written score, with readable rhythm, rests, chords, holds and pitch numbers. “Teach me this piece”, “Next step”, “Make it simpler”, next-bar questions and hand follow-ups retain the passage being discussed. Saved lesson steps describe progression, not measured mastery.
- Lesson actions prepare the exact passage, hand, speed or wait mode with playback paused and chat still open. Stale editions cannot execute old actions. General conversation uses native user/assistant roles and bounded history; social prompts no longer include raw note tuples.
- Paragraphs, emphasis and lists are readable without executing model HTML, links or commands. Scrolling into older messages stays put during streaming, including when scroll events are delayed. The earlier source-only shell refinement is included.

### Verification and installation
- **317 unit/API tests pass**, including 18 focused score-coach tests and 18 prompt tests. Final packaged checks pass **12 conversation groups and 7 real coaching groups**. The packaged piano-input regression passes 12 groups. Independent checks cover all six portraits, paused lesson actions, four responsive sizes, reduced motion, safe reply formatting and the streaming-scroll regression.
- The real packaged coaching run answers both screenshot greetings, replaces both screenshot teaching failures with score-grounded lessons, preserves Chinese hand/passage context and saves/reloads the mixed transcript exactly. A separate final mixed-model evaluation completes 13 turns (7 real native replies, 6 local lessons) without timeout or an identical repeated reply.
- A native scroll-snap failure was reproduced twice, corrected and retested. Suppressing scroll events reproduces the failure when only the new geometry guard is removed; the final native and independent checks pass. Earlier failures and harness corrections remain in the evidence.
- The package's 301 checked source/assets/helper files match the final build. Installation used a verified staged copy after normal quit, preserving the latest personal files. Recoverable previous app: `.qa-runs/companion-coach-2.10-20260927-124749/previous-installed-Luma Keys-2.9.0.app`.
- Final evidence: `evidence/companion-coach-2.10-verification.json`; guide: `docs/COMPANION_COACH_2.10.md`. All owned development/QA processes are stopped; the updated personal app remains open. No schedule extension.

### Limits
General on-device chat remains fallible, sometimes generic or slow; exact passage teaching uses application logic. The model cannot hear an acoustic piano or judge posture, tension or mastery. The final mixed evaluation took about 7–22 seconds to first text and up to 66 seconds for a full reply. Existing model-availability requirements still apply. Physical MIDI hardware and arbitrary new PDF recognition were not retested in this companion pass.

## Previous direct-user continuation — version 2.9.0

Installed and reopened `~/Desktop/Luma Keys.app` **2.9.0**. The redesigned Mozart conversation is open, ready to use. All **65 latest personal files** in Library, Exports and Practice Sheets remain byte-for-byte unchanged across installation and reopening. All **2,992 files/symlinks** in the installed app match the verified candidate.

### Conversations and design
- Six companions now share a saved conversation, with each reply retaining its speaker. A multiline composer, readable transcript, streamed responses, Stop, retry and preserved partial replies replace the one-answer task box.
- Real conversation uses the Mac's existing Apple Intelligence model through a bundled FoundationModels helper. No API credentials, model download, cloud connection or settings change was made. Availability is checked at runtime; local practice tools remain available when the model is not.
- Piece search, English/Chinese follow-up selections, resume positions, exact numbering explanations, written-bar guidance and practice commands remain deterministic. Action buttons retain target score fingerprints. Stale score actions and stale-context retries are disabled.
- Only a bounded current-score excerpt, active number mapping and recent conversation reach the model. Model text cannot execute app actions. The latest 60 messages are saved atomically under Library/companion/conversation.json with owner-only permissions; failed saves retain visible messages and retry, and failed initial reads cannot overwrite saved data.
- Library, Exercises and Progress have clearer typography, tighter spacing and quieter surfaces. Chat fits desktop, narrow and short windows, with reduced-motion support and proper focus/IME/MIDI isolation.

### Verification
- 289 unit/API tests passed; the final deterministic guidance-routing adjustment passed its focused tests.
- Final packaged 2.9.0 passed 12 native conversation groups, including controlled streaming/cancellation/error recovery, exact bar guidance, preserved legacy preferences and no file creation from an empty conversation read.
- Actual packaged English/Chinese model replies streamed successfully and survived reopening (6 checks). One earlier benign request was declined by the model; the app showed a retryable error without losing the question. A separate harness length assertion was corrected because a valid Chinese one-step answer was shorter than 15 characters.
- Final packaged accompaniment regression passed 11 groups; native piano-input regression passed 12 checks. No renderer errors were reported. MIDI was simulated; physical hardware was not tested.
- Final evidence: `evidence/conversation-2.9-verification.json`. The initial source snapshot, focused source patch, build/install logs and recoverable previous 2.8.0 app are in `.qa-runs/conversation-2.9/`. Installation preserved the latest live files, including user changes made during development.
- Reopened with the dev server stopped: Mozart, 晴天 (76 bars), 115% speed, both hands, Falling notes, piano volume 1 and backing off are intact. The conversation shows the saved bar-42 resume action. No personal practice or chat was sent by QA. The installed panel was visually checked; all owned dev/test processes are stopped and the updated app stays open.

### Limits
The compact on-device model is fallible. Native probes sometimes gave generic advice or an unlabelled practice pause instead of exact written-note timing; this is why precise bar Help and numbering use verified application logic. Generated conversation is not authoritative music instruction, does not hear or see the player, and can occasionally decline a benign request. Model availability requires compatible hardware, macOS 26+ and Apple Intelligence ready. Older macOS availability fallback is weak-linked and tested with simulated responses, not on older hardware. No physical USB piano or microphone was used in this pass.

## Previous direct-user continuation — version 2.8.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.8.0).** The new **伴奏** panel is open on the user's saved 晴天. Accompaniment is optional and initially off for each arrangement. All 68 latest personal Library, Exports and Practice Sheets files remain byte-for-byte unchanged.

### Optional accompaniment
- **From the score** offers Match the piece, Acoustic pop, Piano duet and Soft strings. Pop metadata, including 晴天 and 龙卷风, chooses acoustic backing automatically. Guitar, bass and piano use local samples; strings and the quiet drum pattern are synthesized. Thirty licensed guitar/bass samples, attribution and licence are bundled for offline use.
- Pitched backing comes from the written supporting hand, with an optional bass octave doubling. It preserves the selected score's harmony instead of guessing chords. In both-hand Listen, the piano omits only notes actually orchestrated; notes omitted by the sparse string layer remain on piano. Melody-only music explains the missing harmony; explicitly choosing Acoustic pop supplies a beat.
- **Audio recording** imports a matching MP3, WAV, M4A, OGG or FLAC file, up to 100 MB and four hours. Preview, recording BPM and first-bar offset allow alignment with the score. Practice-speed changes preserve pitch within a combined playback rate of 25–400%. Replacement and unlinking preserve copied assets for recovery. Files stay in `Library/accompaniment/`.
- Each saved arrangement has its own on/off state, style, linked recording and independent mix. The backing follows Listen and Play in time, count-in, tempo changes, resume, phrase loops and speed. Pause, seek, score changes and dialogs stop it; Wait for me keeps it silent. It never changes the score or counts generated notes as the user's answers.
- The compact panel uses the existing room palette. Numeric alignment fields accept normal sequential typing and commit on blur or Enter. Uploads lock conflicting actions; detached previews, pending media starts and queued notes stop reliably.
- Instructions and fidelity limits: `docs/ACCOMPANIMENT.md`. The included song scores remain unchanged.

### Verification and installation
- **239/239 unit/API tests passed.** Ten browser acceptance groups passed during development; the final packaged 2.8.0 passed **11 accompaniment groups and 12 existing input groups**, with no renderer errors. Native coverage includes exact legacy-preference preservation, independent same-title arrangements, no doubled piano part, sustained-note resume, loops, changing tempo, both count-ins, simulated MIDI, late-start cancellation, local file/range delivery, normal numeric typing, replacement/unlink locking and preview cleanup.
- Real Chrome offline renders verified every instrument, four sampled/transposed pitch probes within **3.11 cents**, delayed attacks, zero-volume silence, cancellation and disposal. A 24-note full-volume stress mix peaked at **0.718**, below full scale. A 14-second score-derived 晴天 backing scheduled all 75 events with at most six voices and zero sample fallbacks. These are signal measurements, not a claim of subjective listening or original-recording fidelity. All **30** bundled MP3s passed checksum, decode, duration, finite-sample and non-silence checks.
- Three native 9,600-note runs with Lang Lang and sampled Acoustic pop each measured 150 animation-frame intervals: median **16.7 ms**, p95 **17.7–17.9 ms**, maximum **18.6 ms**, none above 33.4 ms. This measures scheduling on this Mac, not all presented GPU frames or hardware. The 390px panel has no horizontal overflow; controls remain reachable. At 1280×800, Play ends at 788px and all 88 key targets remain. Final native and installed panels were visually inspected.
- Verification caught and fixed a native-fetch receiver bug that silently selected synthesis fallback, detached-preview playback, overbroad note suppression for strings, intermediate numeric-input rejection and a replacement/unlink race. Test harness corrections retained the exact behavior assertions for Listen/Perform count-ins and companion-tip status.
- All **2,991 files/symlinks** in the installed bundle match the verified candidate. The old app was quit normally before a process-guarded swap. Recoverable previous app: `.qa-runs/accompaniment-2.8/previous-installed-Luma Keys-2.7.0.app`.
- Reopened with the dev server stopped: 晴天 (76 bars), Falling notes, 100% speed, piano volume 1 and bar-23 resume are intact. Opening the 伴奏 panel shows Match the piece → Acoustic backing, off, at 45% mix, without writing personal preferences. No personal practice was played by QA.
- Final evidence: `evidence/accompaniment-2.8-verification.json` and `evidence/data-preservation-2.8.0.json`. Source baseline, focused patch, audio renders, bank audit and build/install logs live in `.qa-runs/accompaniment-2.8`. Owned dev/test processes are closed; the updated personal app remains open. No schedule extension.

### Scope limits
Built-in backing follows the existing piano arrangement; it is not a reconstruction of an original studio recording. For that sound, import a matching instrumental recording. One BPM and one offset cannot follow arbitrary rubato, different repeats or a different arrangement; there is no automatic beat detection or stem separation. The saved 龙卷风 arrangement still carries its existing from-memory, unverified-transcription notice. Physical MIDI hardware, microphone assessment and arbitrary PDF recognition were not newly tested in this accompaniment pass.

## Previous direct-user continuation — version 2.7.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.7.0).** The companion chooser is left open, ready for the user to choose. The latest saved music, controls and practice history remain intact.

### Companions and practice rooms
- Six selectable companions: miniature Beethoven, Lang Lang, Mozart and Liszt, plus Luma the cat and Mochi the rabbit. Original SVG portraits have distinct silhouettes, costume details, finite expressions and tempo-following gestures; live Reduce motion stops decorative animation.
- Preview-before-apply illustrated chooser with English/Chinese names, palette swatches and room descriptions. Beethoven has walnut/amber; Lang Lang midnight/porcelain; Mozart ivory/plum; Liszt oxblood/ink; Luma sage/cream; Mochi rose/cream. Matching optional Dry/Room/Hall reverb uses the existing piano audio engine.
- Matte room-tinted chrome, manuscript surfaces, fine rules and restrained motion now carry through the assistant, Library, Exercises and Progress. Each artist appears in a small architectural portrait scene on the non-playing screens. Right/left hand teaching colours remain consistent.
- The selected identity follows the toolbar, commands, playing tips, welcome and practice reports. All six share the working local search, saved-position resume and practice controls from 2.6; choosing a different character does not create a different AI model.
- Preview/cancel never changes settings. Applying changes the companion, palette and optionally reverb while preserving the exact reading position, score, hand, loop, speed and practice mode; playback stays paused. A manual colour choice overrides the room palette, with a one-click restore. Legacy custom colours and preference files remain unchanged until an explicit choice.
- Opening the chooser releases held computer/MIDI notes and pedals. A nested-dialog focus defect found during testing is fixed: Escape restores the launcher when the previous dialog's button no longer exists. Typing remains isolated from piano shortcuts.
- Standalone transparent artwork is saved in `Assets/Companions/`, with the reproducible exporter `scripts/export-companion-art.mjs`.

### Verification and installation
- **202/202 unit/API tests passed.** Browser companion acceptance passed eight groups. Native companion acceptance passed nine groups, including exact legacy-file preservation across initial load and reload. The final rebuilt package passed all nine again after the selected-navigation colour correction.
- Nine native assistant and eight native hand-guide/input groups also passed on 2.7 before that final CSS-only correction, with zero renderer errors. Tests cover all six preview/apply/cancel flows, exact beat/loop/hand/speed/mode preservation, optional room sound, custom colours, save/reload, bilingual search/resume, input ownership, focus, live reduced motion and 390px/1280px layout.
- Final native contrast measurements: selected Practice navigation **13.50:1**; sampled Mozart/Lang Lang screen descriptions, summaries and progress figures **4.55–5.81:1**. At 1280×800, all 88 keyboard targets remain and Play ends at 782px. The 390px chooser has no horizontal overflow, and its Choose action is fully reachable by scrolling. Final native screenshots and the installed chooser were visually inspected.
- With Lang Lang active, three native dense-score samples each recorded 150 animation-frame intervals: median **16.7ms**, p95 **17.7–18.1ms**, maximum **18.7ms**, none above 33.4ms. These are scheduling samples on this Mac, not a universal GPU or hardware guarantee. The last CSS correction only changes selected navigation text colour.
- All **2,991 files/symlinks** in the installed app match the final tested candidate. The old app was quit normally immediately before a process-guarded replacement. Recoverable prior version: `.qa-runs/salon-2.7/previous-installed-Luma Keys-2.6.0.app`.
- **All 68 latest personal files remained byte-for-byte unchanged through installation and reopening.** The app visibly restored 晴天 (76 bars), Falling notes, 100% speed, volume1, and bar-23 resume; recent practice still includes the starter at bar4 and concert arrangement at bar64. No personal practice was played by QA.
- Final evidence index: `evidence/salon-2.7-verification.json`; preservation report: `evidence/data-preservation-2.7.0.json`. Initial failure evidence is retained: one development hot-reload interrupted a test; a frozen rerun isolated the real focus issue, now fixed. Visual review also caught stale green panels and the walnut selected-navigation contrast; both were corrected and verified in the final native package.
- Source baseline, focused implementation patch, build logs and installation manifest are in `.qa-runs/salon-2.7`. Owned dev/test processes are closed; the user's updated app stays open. No schedule extension or reset of Claude's existing work.

### Scope limits
The companions perform defined local practice tasks using saved music and score-based guidance. They do not impersonate the artists' personal teaching methods or search the internet for scores. Physical MIDI hardware, microphone assessment and PDF recognition were not newly tested in this visual/profile iteration; existing recognition and suggested-fingering limits still apply.

## Previous direct-user continuation — version 2.6.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.6.0).** The user asked for a cute miniature cartoon Beethoven who can find pieces, return to saved practice and guide playing. The installed app is left open on Beethoven's response identifying the user's last saved 晴天 position: **bar 23 of 76**.

### Beethoven
- Original SVG character: tousled hair, small tailcoat, red scarf, score and baton. A finite blink/listening tilt and a tempo-following baton give it expression. Reduced motion stops decorative animation. The character is memoized; guidance is built once per score/hand, then selected by bar during playback.
- One toolbar entry opens a paper-coloured panel with the current score, short written-music tip, command input, quick tasks and recent practice. A small stage cue stays above the keys and does not cover the instrument. Compact widths shorten the entry to the portrait; screen-reader practice status remains available.
- Local English/Chinese title and composer search; matching arrangements remain separate choices, including identical titles with stable accessible Saved copy labels. Missing music offers import; deleted current scores are not reintroduced into the saved library list.
- Resume uses the existing practice journal. Opening a saved result clears an old phrase loop, honors real pickup/changing bar boundaries and stays paused. Commands can seek, repeat bars, change speed/hand/mode, open Library/Exercises/Progress/settings or show number help. Bars and action values are validated; actions tied to a replaced score are rejected.
- Opening the panel pauses playback, releases held computer/MIDI input and pedals, focuses the question and blocks piano shortcuts while typing. IME Enter is guarded. Escape returns focus. A delayed graded-results popup cannot replace an open Beethoven panel.
- Playing tips distinguish chords, leaps, black keys, rests and held notes. Notes carried over a bar line are never called an empty-bar rest. Tips describe the written music and do not pretend to hear an acoustic piano.

### Verification and installation
- **197/197 unit/API tests passed.** The initial guide test exposed boundary snapping at a note release; explicit release-boundary handling fixed it and the full suite passed.
- Eight browser groups passed before the last copy/layout polish. The final packaged **2.6.0 passed nine Beethoven acceptance groups and eight existing hand-guide/input/modal groups**, with no renderer errors. Coverage includes bilingual/ambiguous/exact-title search, real saved pickup-bar resume, command bounds, modal input ownership, Chinese IME, report-timer cancellation, reduced motion, 390px panel and 1280×800 controls.
- At 1280×800 there are 88 keyboard targets and Play ends at 782px; Import uses one line. The 390px native panel has equal content/client widths of 348px and no horizontal clipping. Final native screenshots were visually inspected.
- Three native dense-score samples (9,600 notes, DPR1) each recorded 150 animation-frame intervals over 2.5s: median 16.7ms, p95 17.9–18.3ms, maximum 18.7ms, none over 33.4ms. These measure scheduling on this Mac, not all presented GPU frames or hardware.
- All **2,991 files/symlinks** of the installed bundle match the tested candidate. The old 2.5 app was quit normally immediately before a process-guarded swap; it remains recoverable in `.qa-runs/beethoven-2.6/previous-installed-Luma Keys-2.5.0.app`.
- **All 68 latest personal files remained byte-for-byte unchanged through installation and reopening.** The user had practised and added files during development; the final latest snapshot was preserved rather than restoring the initial 64-file baseline. The app restored 晴天, Falling notes, 100% speed, volume1 and its bar-23 resume. Beethoven also displays the existing starter bar4 and concert arrangement bar64 history. No personal practice was played by QA.
- Final index: `evidence/beethoven-2.6-verification.json`. Assistant, regression, timing and preservation reports are linked there. Source snapshot and focused patch are in `.qa-runs/beethoven-2.6`. Owned dev/test processes are closed; the updated personal app remains open. No schedule extension.

### Scope limits
Beethoven is a local command assistant with defined practice tasks, not an open-ended conversational model or internet score search. Guidance uses the score and existing input modes; microphone-based acoustic assessment and physical MIDI hardware were not newly tested. Existing PDF-recognition and suggested-fingering limits still apply. Imported musical content and Claude's earlier edits were preserved.

## Previous direct-user continuation — version 2.5.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.5.0).** The user asked to replace the low-end green/glowing background, remove canned AI-style wording, and make the non-playing screens cuter. The new app was visibly verified after installation and left open on Library.

### Design and copy
- Flat charcoal navigation with a simple selected underline, quieter buttons and space for native window controls. Practice keeps its dark instrument and the 2.4 hands/keyboard.
- Paper-coloured Library, Exercises and Progress screens with dark type, sage controls and small apricot/lilac surfaces. Original cat/bunny SVG scenes show books, a metronome and plants; saved companion selection reaches every non-playing screen. Tail/ear responses are finite and suppressed by reduced motion.
- Replaced the old gradient/halo pets in Settings, welcome and reports with matching illustrations. No decorative pet overlay was added to the piano stage.
- Rewrote app-owned status messages, titles, coaching, exercise descriptions and export footer. Examples: “Review score,” “Importing score…,” “Companions,” “Metronome,” “Finger numbers.” Removed unsupported uniqueness/unlock/count-in promises. Imported score descriptions remain the user's data.
- Light dialogs now have readable results, instructions, tables and review warnings. Narrow Settings uses stacked controls; custom exercise tempo retains room for its dropdown; notifications fit narrow windows. Pet and accent selections expose pressed state.

### Verification
- 182 unit/API tests passed. Eight browser acceptance groups and **18 native groups** passed: eight extended design workflows, eight finger-guide/input/modal workflows and two forced-navigation/cancelled-transition workflows.
- Tested real score import/review/search, a recorded practice session and bar-2 Continue, exercise generation, saved theme/goal/companion state, report text, keyboard navigation/focus return, 390px screens/dialogs, reduced motion, and 1280×800 practice controls. Final native images were inspected.
- Native measured contrast: exercise summary 5.40:1; report/help 5.07:1; review cells 12.65:1. At 1280×800, Play ends at 782px and all 88 fixed keyboard targets retain 68px width.
- Final evidence: `evidence/studio-2.5-verification.json`, `native-studio-2.5-qa.json`, `native-hand-guide-2.5-qa.json`, `native-transition-2.5.json`, and their screenshots. The initial narrow Settings failure is retained as `studio-2.5-initial-mobile-overflow-failure.*`; it was fixed and passed in the final package.
- The installed package matches all **2,991 files/symlinks** of the tested build. The previous 2.4 app is kept in `.qa-runs/studio-2.5/previous-installed-Luma Keys-2.4.0.app`.
- **All 64 latest personal files stayed byte-for-byte unchanged through replacement and reopening**, including two arrangements saved during this iteration. The app restored 晴天 (76 bars), Falling notes, 95% speed, volume1 and the existing practice history; all six library pieces are present. No personal practice was played by the tests.
- All owned dev/test processes closed. The user's updated app stays open. No schedule extension.

### Scope limits
This was a visual and copy iteration. Imported musical data was preserved; the two newly saved arrangements were not assessed for transcription accuracy here. No new physical MIDI or PDF-engine verification is claimed. Prior recognition and fingering limits still apply.

## Previous direct-user continuation — version 2.4.0
**Installed and reopened `~/Desktop/Luma Keys.app` (2.4.0).** The user likes the current design and asked for clearer, more instructive hands and a better keyboard. Claude's existing work and personal music are preserved. The installed app matches the tested package in all **2,991 files/symlinks**.

### Hands and keyboard
- More articulated fingers and knuckles, a connected palm that adapts to wider chords, shorter relaxed reach and better separation of idle fingers. Played fingertips retain exact key coordinates; held fingers stay down while others move. Prepare/contact marks show the intended landing point.
- A compact per-hand guide pairs pitches with suggested fingers and separates **Place / Play / Hold / Next**. A chord can hold one finger while another plays. Missing or conflicting suggestions explicitly say **choose finger**.
- **Finger guide** opens two interactive hand illustrations and distinguishes finger numbers **1–5** from pitch numbers **1–7**. Opening it pauses playback, releases input and blocks computer/MIDI playing until close. Focus returns to its button. Delayed saved settings can hide the guide without leaving input locked.
- Satin ivory and ebony surfaces, clearer key fronts and middle-C marking. The physical keyboard targets remain fixed. Live reduced motion keeps the cues and suppresses glides, lifts and decorative motion.
- Compact-window fixes keep Play reachable and restore the next numbered-score line preview. At 1280×800, the no-runway reading area is 239px with 160px keys; the current line is complete, the next begins below, and Play ends at 780.5px.
- Interrupted view animations no longer produce an unhandled rejection. Only the optional animation-ready promise is handled; update failures remain observable. See the [ViewTransition specification](https://www.w3.org/TR/css-view-transitions-1/) for the distinct ready/update/finished promises.

### Verification and evidence
- **182/182 unit/API tests passed.** Production build and arm64 packaging passed.
- **52 existing native acceptance groups plus 2 focused navigation groups passed during this iteration.** Stage 17, guide 8 and hand-motion 6 passed before the final three-line animation cancellation fix. The final rebuilt package then passed reader 9, input 12 and forced-skip/replacement navigation 2 with zero page errors. The last fix did not change the hand model or cues. Concurrent edits to the shell/design styles were preserved and included in the final build; final reader/input/navigation, production Retina timing and visual inspection cover that build.
- Coverage includes exact contacts/held chords, repeated attacks, stationary hitboxes, pointer access through hands, phrase/hand scope, unsupported fingering, live reduced motion, small windows, dialog/input ownership, actual 16-note PDF recognition and original-sheet preview, saved pitch correction, 50,000-note navigation and simulated MIDI.
- Native dense/tape samples each recorded 150 rAF intervals in 2.5s, median 16.7ms and p95 17.2–17.7ms. Native hand-motion samples recorded 150 each with p95 16.8–17.2ms and no intervals over 33.4ms. Final production Retina/DPR2 checks recorded 151 intervals per sample, median 16.7ms, p95 16.8ms and zero over 33.4ms in two falling-note positions and number-score view. These measure scheduling on this Mac, not every presented GPU frame or all hardware.
- Both saved **晴天** arrangements passed import, play/pause, seek, numbered reading and stationary-keyboard checks. Updated previews: `evidence/instructive-2.4-sunny-songbook.png` and `instructive-2.4-sunny-concert.png`.
- Final index: `evidence/instructive-2.4-verification.json`. Detailed reports include `native-instructive-2.4-qa.json`, `native-keyboard-stage-2.4-qa.json`, `native-beauty-2.4-qa.json`, `native-reader-qa.json`, `native-input-qa.json`, `native-transition-2.4.json` and `retina-2.4-final.json`.
- Earlier failures are retained. They exposed a real compact-layout regression and the unhandled view-transition cancellation, both repaired. Test startup/reload/capture focus handling was corrected without relaxing layout or frame gates. The timed-input target was moved to the middle of the existing late window; delivered beat 1.26756 produced the expected amber result. A slow dense sample occurred while the personal app was also playing; after it was closed, three focused samples and the full stage passed. Concurrent playback is a plausible contributor, not a proven sole cause.
- Physical MIDI hardware remains untested; MIDI ports were simulated. PDF recognition can need correction. Fingerings are suggestions, not teacher-verified technique.

### Personal data and installation
- All **62 latest personal files** match across final restart (`evidence/data-preservation-2.4.0.json`). Music/import/export files remained unchanged throughout. Preferences legitimately changed during the user's practice while development continued; they were preserved, never reverted to the initial snapshot.
- The personal 2.3 app was first paused at Sunny Day bar 49 and quit normally. It was reopened during QA and recorded another session, leaving bar 1 with bars 1–49 practised, 95% speed and volume 1. That latest journal/settings snapshot is the final preservation baseline.
- The first bundle swap encountered that reopened old process. Its original resources were temporarily restored, but native UI inspection repeatedly timed out. After protecting the latest persisted data, only that confirmed old PID was stopped with TERM; no force-kill was used. The verified 2.4 bundle was reinstated after confirming the old process exited. The fresh app then visibly loaded Sunny Day, Falling notes, 95% speed and volume 1; its new Finger guide opened/closed correctly. It is left paused.
- Source baseline: `.qa-runs/instructive-2.4/source-2.3-before.tar.gz`; focused patch: `implementation.patch` in the same directory. Previous app: `.qa-runs/instructive-2.4/previous-installed-Luma Keys-2.3.0.app`. Logs, intermediate data snapshots and installation manifest are retained there. Future installs must recheck for a reopened personal process immediately before swapping bundles.
- The expired overnight schedule was not extended. No unrelated files or existing Claude changes were reset. All owned test apps and development servers are stopped.

## Previous direct-user continuation — version 2.3.0
The user returned after Claude's improvements and asked for more beautiful hands, keyboard and animation, plus 龙卷风 (邓紫棋 piano version) and 晴天 (周杰伦). This pass preserves Claude's 2.2 layout, sound, library, settings and practice journal.

**Installed and reopened `~/Desktop/Luma Keys.app` (2.3.0).** Native UI inspection confirmed the new finger caption and artwork, the saved Appassionata, Falling notes, 100% speed, volume 1, and Resume at bar 402. All 62 existing Library/Exports/Practice Sheets files remain byte-for-byte unchanged after normal quit, installation and relaunch.

### Appearance and motion
- Slimmer illustrated hands with tapered, jointed fingers, a connected thumb, quieter matte shading, smaller finger badges, and a gentler wrist fade. The drawings remain articulated canvas graphics rather than fixed hand images.
- Continuous finger lift/contact eliminates the measured 5.6px contact jumps. Quintic easing gives position changes a smoother arrival and departure. Repeated notes lift and strike again; held fingers remain on their exact keys.
- Refined ivory/ebony surfaces, shallower eased key presses and finite hand-coloured landing ripples. The 88 physical hit targets stay fixed. The keyboard never pans or zooms during playing.
- Live macOS Reduce motion disables hand glides/lifts, beat pulse, ripples and cap transitions immediately. Pausing freezes the hands; seeking displays the destination without an invented sweep across the keyboard.
- A restrained caption distinguishes finger numbers 1–5 from pitch numbers 1–7. Required keys expose suggested fingers in their accessibility description. The reading guide now describes the actual honey/blue colours and suggested fingering.

### Correctness
- Fingering keeps every still-held note in later chord states, preventing an older held finger from being reassigned after several intervening onsets.
- Same-onset unison voices share one suggested finger and retain the longest hold. The hand timeline retains that hold too. A reattack using another finger clears the previous same-pitch assignment.
- Shapes the model cannot support can omit new suggestions instead of pretending one occupied finger can press another key. Fingering remains a suggestion, not a teacher-verified technique or a measurement of the player's anatomy.

### Verification
- **168/168 unit/API tests passed**, including 13 hand-pose/timeline tests and 11 fingering tests. Production build and arm64 desktop packaging passed.
- **44 native groups passed on 2.3.0:** hand beauty 6, keyboard stage 17, reader 9, input 12. These include repeated attacks, held chords, stable geometry and canvas identity, pointer input through hands, live reduced motion, pause/seek, 50,000-note navigation, actual local PDF recognition/original preview, corrected-note saving and MIDI/input ownership scenarios.
- Browser material 7 and input 12 groups passed; all 30 piano samples contain non-silent signals and focused keyboard input releases correctly. Both saved 晴天 variants passed import, play/pause, seeking, numbered reading and stationary-keyboard checks with no page errors.
- Native hand acceptance at 1480×980, DPR1, measured three 2.5-second samples of a 9,600-note score: **150 frames each, median16.7ms, p9517.6–17.7ms, zero intervals over33ms**. Native stage/tape also measured150 frames. These are rAF scheduling measurements on this Mac, not a guarantee about every presented GPU frame. Browser DPR2 timing and slow intervals are retained separately.
- Early development runs were not all clean: one was interrupted by a Vite page reload during an edit; a narrow repeated-attack observation failed once during concurrent build/testing and did not reproduce with unchanged assertions. One native input run unexpectedly lost its page during a loop; no quit/install operation was active. Its diagnostic retry, with owned-window show/focus and bounded process logs, passed all12 gates, showed no crash/render-gone/uncaught exception, and exited0 only during cleanup. The cause of that first closure remains unconfirmed; no speculative app-code fix was claimed.
- Physical MIDI hardware was not available; MIDI tests use simulated ports. Recognition remains dependent on the source PDF and can require correction.

### Requested music
- **晴天 is already installed in two arrangements**, both preserved. Songbook:76bars/1,229notes/♩66. Concert:66bars/1,539notes/♩72. Saved MusicXML exactly reproduces their playable events; the concert's key-change warning remains. This verifies stored data consistency, not fidelity to a commercial recording.
- **龙卷风 is pending a source score.** No matching file exists locally. A matching paid arrangement by pichia was found at https://www.mymusicsheet.com/sheet-music/281631. The user was asked for their PDF/MusicXML/MIDI or chosen licensed source. No purchase, preview extraction, placeholder score or invented transcription was made. See `docs/REQUESTED_SONGS.md`.

### Saved artifacts and preservation
- Tests and screenshots: `evidence/native-beauty-2.3-qa.json`, `native-keyboard-stage-qa.json`, `native-reader-qa.json`, `native-input-qa.json`, `native-input-diagnostics.json`, `beauty-2.3-song-audit.json`, `beauty-2.3-song-ui.json`, and `beauty-2.3-sunny-songbook.png` / `beauty-2.3-sunny-concert.png`.
- `evidence/data-preservation-2.3.0.json` records all62 hashes, the unchanged relaunch, and **2,991 matching files/symlinks** in the installed and tested bundle.
- Claude's initial source/assets snapshot: `.qa-runs/beauty-2.3/claude-2.2-source-before.tar.gz`; focused implementation patch: `.qa-runs/beauty-2.3/implementation.patch`. Existing uncommitted Claude work was preserved rather than reset or committed as this pass's work.
- Previous installed app: `.qa-runs/beauty-2.3/previous-installed-Luma Keys-2.2.0.app`. Build/unit/browser logs remain in that run directory. Test apps closed; the development servers stopped; the personal updated app is open and paused.
- This was a direct user request on September26. The expired overnight schedule was not extended.

## Previous direct-user continuation — version 2.2.0
The user asked for three things:
- "for the hand gesture, I want it demonstrate what the correct hand gesture for playing the bars should look like, also stop the zooming in and out of the keyboard, it's really confusing and not coherent, have it big and fully comprehensively coherent"
- "the play is little bit laggy and not smooth, make the piano animation screen bigger, the color should be more nature and more stylistic"
- Later, of the first hand drawing: "make the hand better, this is terrible" and "please make the hand better, this is bad".

Installed the tested **~/Desktop/Luma Keys.app** (2.2.0). The personal app was not running, so there was nothing to quit; the new version was installed and opened.

- **A still keyboard.** The 1.8 camera (zooming and panning to the coming notes) is gone.
  - The keyboard is fitted once per piece to the piece's whole range, edge to edge: the Appassionata's F1–C7 is 40 white keys, about 36 px each in the default window. It is refitted only when the window changes size.
  - Nothing about it moves during playback; the stage checks assert this.
  - On a phone-sized window the keys keep 40 px, the strip scrolls by hand, and offscreen notes get direction buttons.
- **The hands** (`src/fingering.mjs`, `src/hand-pose.mjs`, `src/hand-draw.mjs`).
  - **Fingering.** A suggested fingering for every note, computed per piece: an ergonomic dynamic programme after Parncutt et al. (1997). It weighs finger-pair stretches, crossings, weak fingers, black keys, held notes and the time available to move. It gives textbook fingerings for scales, arpeggios and chords, and fingers the Appassionata's 7,246 notes in about 50 ms.
  - **Pose.** A timeline of each hand's chords gives, at any moment, each finger's key, whether it is down, about to play or resting, and the hand's position. The hand glides to its next position just before it is needed (sooner for long leaps), held keys keep their fingers, and a hand with nothing to play fades back.
  - **Drawing.** Each hand is painted on its own canvas: anatomical proportions, tapered fingers with joints and nails, knuckles, a thumb on its side, soft shading and a shadow on the keys. The finger numbers sit on the nails: filled means pressing, ringed means next, small means resting.
  - The canvases slide by transform, so a hand moving without changing shape costs nothing to paint.
  - **Hands** in the keyboard header shows or hides them; the choice is saved as `reading.keyHands`.
- **Natural colours** (`src/stage.css`).
  - A walnut stage lit warmly at the now line, ivory and ebony keys behind a red felt strip, a wooden rail for the palms and a brass now line.
  - Honey is the right hand and slate blue the left: runway notes, lit keys, the hands' badges and the number score's inks.
  - The theme accents are softened, and **Concert grand** (brass on walnut) is a new theme. The user's theme is left as it was.
- **A bigger stage.** In Falling notes the title shares one line with its details and the stage header is slimmer. The runway grows from 376 to 419 px at 1480×980; the keys stay 225 px tall, over the new rail.
- **Smooth playback.** A full trace of the packaged app showed the GPU saturated: ~24 ms per frame waiting in SwapBuffers.
  - Cause: blurred shadows on the 88 keys, re-rastered constantly, plus box-shadow and opacity transitions as keys lit up, plus the Play button's infinite glow animation.
  - Fix: hard-edged insets and gradients, and no transitions on keys or notes. The now line's beat glow now changes only its opacity. The runway is anchored once per piece, and the hold meter scales rather than resizes.
  - Falling notes in the packaged app: 240/240 frames in 4 s, 0 dropped at bars 40, 110 and 500 (was 124–225 frames, 15–96 dropped). Number score: 236–240 frames.
- **Tests.**
  - **Unit:** 156/156. New: fingering (scales, five-finger tunes, arpeggio crossings with no thumb on black keys, chords, held keys, stretch costs) and hand poses (held keys carried, resting fingers, the glide and its lift, held keys staying down, drawn geometry, leaps setting off sooner).
  - **Browser:** 12/12 on a fresh library. The first run found three issues, all fixed and then rerun:
    - A hand at the keyboard's end widened the scrollable strip; the key bed now clips.
    - Keys are capped at 68 px again.
    - The fit is pixel-aligned so both end keys are wholly in view.
  - `keyboard-stage` now asserts that the keyboard stands still while playing, and checks the hands: fingertips on C4/C3, thumbs inward, a 27-frame glide before a C4 → C6 leap, and the Hands toggle kept after a reload.
  - `reader` checks that the full 88-key range fits at 1280 px, and that on a phone the offscreen notes are named and revealed.
  - **Packaged app:** 8/8 on 2.2.0 (17 keyboard-stage checks, including the hands and the still keyboard). native-continuity timed out once taking a screenshot (a capture that waited 15 s for a frame) and passed when run again.
- **Personal data.** All 48 personal Library/Exports files are byte-for-byte unchanged before the install, just before the app was replaced, and after installing and relaunching (`evidence/data-preservation-2.2.0.json`).
  - The installed app matches the tested build in all 3,454 bundle entries and reads the settings with no recovery issues. The user's settings are kept (Moon garden theme, Falling notes, runway on, Room, goal 20); the hands are on by default.
  - The previous 2.1.0 app is kept at `.qa-runs/accept-2.2/previous-Luma Keys-2.1.0.app`.
- **Known limits.**
  - The fingering is a suggestion from an ergonomic model, not an editor's; it cannot know a hand's size or a teacher's preference.
  - Chords of six or more notes in one hand finger their outer five.
  - The hands are drawn from above, so the fingers' curve is suggested by shading rather than seen from the side.

## Previous direct-user continuation — version 2.1.0
The user asked to "continue to improve". Installed the tested **~/Desktop/Luma Keys.app** (2.1.0). The personal app was quit normally for the install and reopened on the new version.

- **A richer piano** (`src/audio.js`).
  - `toneFor` gives each note a tone for its pitch and touch: louder and brighter the harder it is played. A per-voice low-pass opens from about 2 kHz (pp, middle C) to about 9 kHz (ff). The samples are single recordings, so a soft touch now sounds darker, not just quieter.
  - Notes are placed across the stereo field by pitch (±0.3, low on the left).
  - A room reverb runs on a shared bus: a deterministic synthetic stereo impulse (`roomImpulse`) with pre-delay, early reflections and a darkening tail.
  - **Settings → Sound** offers Dry, Room (1.3 s, the default) and Hall (2.6 s). The metronome click skips the room.
- **Dynamics on the runway** (`dynamicMarks` in `src/keyboard-stage.mjs`), drawn behind the notes.
  - The written dynamics come down the left edge, from the notes' written loudness: the loudest note at each moment (accents aside), smoothed over a beat either side.
  - A marking (pp … ff) appears where a level settles for two beats or more. A cresc./dim. hairpin appears where a few short steps rise or fall from one level to the next; a rest between levels is not a hairpin.
  - The Appassionata gets 78 marks: ff at bar 1, p at 5, a crescendo over bars 10–12 to f, a diminuendo to pp at 19. Its written-out repeat matches the first time through.
- **Speed ladder.** "Speed up each pass" in the phrase row makes Listen & follow play a repeated phrase 5% faster each time round, up to 100%. The speed changes exactly at the wrap, where the transport is re-anchored anyway. Checked: 50 → 55 → 60 → 65% over three passes of bar 1 with the piano sounding throughout.
- **Saved passages** (`savePassage` / `removePassage` in `src/journal.mjs`).
  - **Keep bars a–b** saves the phrase as a passage for the piece, up to 20, kept in the journal.
  - Passages show as chips in the phrase row (click to repeat, × to forget), as gold marks along the top of the piece map, and on the Library's Continue card, which opens the piece already repeating the passage.
- **Focus mode.** The arrows in the keyboard's header hide the top bar and the title, so the runway and keys take the whole window. The button or Esc brings them back.
- **Ocean deep**, a fourth theme (navy with sky blue).
- **Details.** The piece map rests a little taller on tall windows. The phrase row's bar fields fit three-digit bars, and the reading guide and shortcuts describe the additions.
- **Performance** (production build, 2× density, Appassionata). Falling notes 180/180 frames in 3 s; Number score 170–176, the same as 2.0 and 1.8.
- **Tests.**
  - **Unit:** 144/144. New: tone and room impulse; dynamics marks (levels, a swell as one hairpin, a rest, an accent); passages; ocean and room settings.
  - **Browser:** 12/12 on a fresh library, first run.
  - **Packaged app:** 8/8 on 2.1.0.
- **Personal data.** All 48 personal Library/Exports files are byte-for-byte unchanged through the normal quit, the install and the relaunch (`evidence/data-preservation-2.1.0.json`).
  - The installed app matches the tested build in all 3,454 bundle entries and reads the settings with no recovery issues.
  - The previous 2.0.0 app is kept at `.qa-runs/accept-2.1/previous-Luma Keys-2.0.0.app`.
- **Known limits.** Dynamics and accents are inferred from the written loudness, not read as symbols. Hairpins that don't arrive at a new level are not shown.

## Previous direct-user continuation — version 2.0.0
The user asked: "can you make the app better, not just the content of the keyboard's, including it as well, do a full scale upgrade".

Installed the tested **~/Desktop/Luma Keys.app** (2.0.0). The personal app was quit normally for the install and reopened on the new version.

- **One design system for every screen.** `src/design.css` is loaded last and scoped under `.app`.
  - It defines the tokens: ink tinted per theme, radii, easing, and a card surface with an inner light and the theme's glow.
  - It restyles buttons, selects (custom arrow), toggles (vivid, springy), `kbd` keys, dialogs (spring entrance, blurred backdrop), the toast (a pill) and the report card (an accuracy ring; a glow at 90%+).
  - The top bar's navigation has icons and a pill that glides to the chosen screen.
  - Cards arrive one after another. None of the motion runs under reduced motion.
- **Practice journal** (`src/journal.mjs`, stored in `preferences.json` as `journal`, read field by field like the other settings).
  - Kept: minutes per day and per piece, sessions, the bars played through (merged ranges; a repeated phrase counts once it has come round) and where each piece was left.
  - Bounded to 400 days, 200 pieces and 200 ranges per piece.
  - Recorded when playback stops, including at a normal quit.
  - A daily goal (5–120 minutes, default 20) was added to reading settings.
- **Library.**
  - A **Continue** card shows the open (or last practised) piece: its outline, the bars played through, where it was left, time practised, sessions, and **Continue at bar …** / **From the beginning**.
  - Every piece is a card with its outline as a cover, time practised, share of bars played through and the last graded run.
  - Your pieces are ordered by most recent practice.
- **Progress.**
  - Tiles: a ring of today's minutes against the goal, days in a row (practice days and graded runs), this week, and all time.
  - A 14-day chart with the goal line and a six-month calendar.
  - Each practised piece with time, sessions, its outline with the bars played through and where it was left, and **Continue**.
  - The graded Play in time runs (chart, levels, recent runs) follow below.
- **Exercises:** the twelve levels as cards (the recommended and selected levels lit), beside the sticky options panel.
- **Settings:** one dialog of cards.
  - Reading, Timing, **Daily goal**, **Colour**: each theme shown as a little practice scene.
  - Companion & help, with the new **Keyboard shortcuts** list, which **?** also opens.
  - The app version and where the data lives.
- **Practice screen.**
  - **Piece map** (`src/piece-map.mjs`, `src/PieceMap.jsx`): the whole piece as two ribbons, right hand over left, lit up to the playhead. It marks a repeated phrase and the bars played through. Pointing shows the bar and time, and it opens taller while pointed at.
    - The slider underneath still does the seeking, so clicks, drags and arrow keys work as before.
    - Tall windows give it a full-width row in the dock. Windows ≤880 px tall fold it into the one transport row, with icon-only modes, so the runway keeps its room.
  - Time and bar readout.
  - The speed is in 5% steps (25–125%), with tortoise and hare buttons and the **[** / **]** keys.
  - **,** and **.** step through notes.
  - **Resume at bar …** beside the details when a piece was left part-way.
  - **The other hand plays softly** (on by default, a button beside the hand menu) when practising one hand, in Listen & follow and Play in time.
- **Keyboard.**
  - A gold **sustain-pedal lane** on the runway's right edge: "Ped." where it goes down, a hook where it lifts. A **Ped.** lamp in the header lights while the pedal should be held.
  - **Accents** (a note louder than the same hand's music on both sides by 0.1 velocity or more) land with a gold edge and a **>**. The Appassionata has 184 of them in 82 bars; its 18 pedal spans all show.
- **Sheet music:** eight bars at a time across the page in the desktop layout (four when narrow), larger when the keyboard is hidden.
- **Reading guide** rewritten for the keyboard, the map, the pedal and accents, and the journal.
- **Performance.**
  - Measured on the production build at 2× density against 1.8's packaged build. Both views play at 60 fps: 171–174 frames in 3 s for the number-score view, against 173–174 for 1.8.
  - A `:has()` rule that checked an inline style attribute first cost ~5% of frames. The keyboard rewrites inline styles every frame, so Chrome kept re-checking it. Replaced by a class.
- **Tests.**
  - **Unit:** 139/139, including new tests for the journal (10), the piece outline (3), accents and the pedal (2), settings round-trips with the journal and goal, and field recovery.
  - **Browser:** 12/12 on a fresh library.
  - **Test changes:**
    - The sheet checks expect eight-bar passages.
    - The runway alignment and pause/resume checks now allow for the audio output's latency. This Mac is currently on Bluetooth headphones (0.26 s). The visuals deliberately follow what is heard, which the old checks assumed was instant.
    - `window.lumaClock()` now reports `latency`.
  - **Packaged app:** 8/8 on 2.0.0.
    - The first packaged run hung at launch. The new `src/journal.mjs` was missing from `package.json` `build.files`, so the packaged server could not load its settings module.
    - Added it, plus a unit test (`tests/packaging.test.mjs`) that walks the server's imports and fails if any is left out of the package.
  - **Unit, final:** 140/140.
- **Personal data.** All 48 personal Library/Exports files are byte-for-byte unchanged through the normal quit, the install and the relaunch (`evidence/data-preservation-2.0.0.json`).
  - The installed app matches the tested build in all 3,454 bundle entries (the same Electron 44.4.5 as 1.8.0; 1.8's figure of 2,991 counted differently).
  - The relaunched app reads the settings with no recovery issues, and its journal starts empty.
  - The previous 1.8.0 app is kept at `.qa-runs/accept-2.0/previous-Luma Keys-1.8.0.app`.
- **Known limits:**
  - The journal starts with 2.0: earlier practice appears only in the all-time total (1.x kept totals, not days or pieces).
  - Accents are inferred from the written loudness, not read as symbols.

## Previous direct-user continuation — version 1.8.0
The user asked to keep improving the app. Then, specifically:
- "expand the scale of the keyboard, make it larger, and still keep the script, but then have the hand gesture indication as well, make it nice"
- "make all of the color theme more vibrant and better as well"

Installed the tested **~/Desktop/Luma Keys.app** (1.8.0). The personal app was quit normally for the install and reopened on the new version.

- **A larger keyboard that follows the music.** A camera frames the notes sounding now and coming up (both hands), with keys as large as they fit (up to 68 px). Before, the whole piece's range was fitted: 42 white keys for the Appassionata, so keys were about 34 px.
  - Any four beats of the Appassionata need a median of 22 white keys (27 at p75, 31 at p90). Keys are now usually 50–68 px.
  - Behaviour, from `cameraFrame`, `clampCenter` and `inView` in `src/keyboard-stage.mjs`:
    - It zooms out at once when the next four beats need it.
    - It zooms in only as far as the next ten beats also fit, and only after that has held for 1.2 s, so it never breathes.
    - It pans only when the coming notes would leave the view, and then to where the next bars fit, so it settles.
    - A new piece is framed at once. It never moves while a pointer holds an onscreen key.
    - Scrolling by hand pauses it until the music moves on. Offscreen notices glide to their key.
  - Implementation: eased every animation frame and written straight to the strip, never through React.
  - Measured in a 12 s Appassionata sample: one zoom in, one zoom out, a few small pans. The first version breathed (in, then out a second later); fixed.
- **Hand positions ("hand gesture indication").** `handZones` works out each hand's position: the notes it plays from now to a beat ahead, or its next notes while it rests. It also finds the next jump: its first later note more than a fourth outside that span, within the visible look-ahead.
  - A shelf under the keys has a row per hand (right above, left below). A capsule with a hand icon spans the keys the hand covers now. A coming jump shows as a dashed capsule at the new position, with a dashed arrow, both stronger as the move approaches. Positions glide.
  - The same span glows on the runway floor where its notes land.
  - The shelf sits in normal flow under the keys, so short windows keep both rows.
- **The number score is kept**: the strip beside the runway, and the tape without it, are unchanged.
- **Vibrant themes.** One layer, loaded last, restyles all three themes:
  - Moon garden: green-black with emerald.
  - Lavender dusk: indigo with violet.
  - Rose nebula: plum with magenta.

  Each gets a glow in its colour, a vivid accent (nav pill, Play button, selected mode and view, primary buttons), a tinted keyboard stage and runway, and a strike line in the accent colour. Hand colours are now vivid green (right) and violet (left) in every theme, carried through the keys, runway, hand shelf and number-score inks. The theme picker swatches were updated.
- **Performance.** On the production build at 2× pixel density (as the app runs), the Appassionata plays at 60 fps in both views (95th-percentile frame 17 ms). The hand visuals cost nothing measurable.
  - Dev-server numbers overstate the cost, because React's development checks dominate.
  - A forced layout in the camera (reading the scroll position back after writing it) was removed.
- **Not shipped:** the half-started "hear the other hand" and focus-mode settings were removed rather than left without a UI. Speed preferences now accept 5% steps (the menu is unchanged).
- **Tests.**
  - **Unit:** 124/124, including tests for camera framing and hand zones.
  - **Browser:** 12/12. `keyboard-stage-qa` now makes 17 checks: Twinkle's keys are large (55–70 px); a C2–C7 piece is framed (32 px); and a coming C4 → C6 jump is announced by a ghost capsule and an arrow.
  - **Test changes for the camera:**
    - Material accepts keys up to 70 px.
    - Reader waits for the camera's glide to a revealed key.
    - Chord reading waits for the phone-width layout to settle; it had failed once intermittently.
  - **Packaged app:** 8/8 on 1.8.0, including keyboard stage with 17 checks. The installed app matches the tested build in all 2,991 files and links.
- **Personal data.** All 48 personal Library/Exports files are byte-for-byte unchanged through the normal quit, the install and the relaunch (`evidence/data-preservation-1.8.0.json`). The previous 1.7.0 app is kept at `.qa-runs/accept-1.8/previous-Luma Keys-1.7.0.app`.
- **Known limits** are unchanged from 1.7.0.

## Previous direct-user continuation — version 1.7.0
The user asked for a bigger, better piano display that is easier to read in a hard piece, with better visuals, transitions and animations, and said they don't necessarily need the number score. Their screenshot showed the Appassionata's big chords making the score scroll above a squeezed runway; they had switched the runway on. They also asked for the Appassionata finale exactly as Beethoven wrote it: his repeat written out and the Presto faster. Installed the tested **~/Desktop/Luma Keys.app** (1.7.0); the personal app was quit normally for the install and reopened on the new version.

- **The piano display first.** With the runway on, the keys are 150–250 px tall (23% of the window height) and the runway takes most of the view.
  - The number score beside the runway became a strip: one line fitted to the width, never scrolling. Its height is sized per piece (the typical line fits at full strip size, within 21% of the window).
  - In the strip, chords are stacked bare numbers; the runway and keys show the octave. It moves on to the next line with a short slide.
  - **Falling notes** gives the whole view to the piano display. Runway off, the number score is still the 1.6 tape.
- **Easier to read in hard music.**
  - The runway zooms to the music: the piece's 10th-percentile note stays about 26 px tall. The Appassionata's sixteenths get 104 px a beat and over two bars of look-ahead, up from about one.
  - Notes a hand strikes together are tied by a bar where they land.
  - The next chord is outlined and glows; while waiting (Wait for me, or stopped) it is the chord to play now.
  - A splash of the hand's colour rises from each key as its note lands.
  - Bar numbers sit on tabs at the left edge, short notes show just their number, and the keys have more depth.
- **Motion.**
  - View switches, the runway toggle and hiding the keyboard glide with View Transitions; the keyboard stage morphs to its new size.
  - The strip slides between lines, and cue notes lift in while stepping.
  - None of it plays under reduced motion.
- **Tempo changes are played.** New `src/tempo.mjs` holds a score's tempo map (score seconds ↔ beats).
  - It drives the transport, audio scheduling, metronome, count-in (at the tempo where a performance starts), falling notes, stage clock, time display, and grading windows (per note, at its own tempo). The practice speed scales every tempo.
  - MusicXML `<sound tempo>` and MIDI tempo events import as `tempos`; practice files validate them. The header shows the opening and closing tempo (`♩ = 144 → 180`).
- **The sustain pedal is played.** MusicXML pedal marks and MIDI CC64 import as `pedals` spans. In Listen playback a note released under the pedal rings until the pedal lifts. Written lengths are unchanged in every display.
- **Appassionata III, as written.**
  - **Structure.** Re-expanded from the same Humdrum source with its full expansion list (A, B, B1, B, B2, D, D1, D, D2, E, E1, E, E2, F): 569 bars, about 7 min 42 s.
    - Bars 1–117: introduction and exposition. 118–299: development and recapitulation. 300–307: first ending.
    - 308–489: the repeat. 490–497: second ending, "Sempre più allegro" from 494.
    - 498–569: Presto at ♩ = 180 (the source's MM), with its two short repeats written out.
  - **Verification**, attack by attack against the source with music21 (ottava passages at sounding pitch):
    - Every one of the source's 7,184 distinct attacks is present.
    - 55 unisons struck by two voices play as one key.
    - The app's 62 extra attacks are chord notes that converter21's object model wrongly marks as tied; the kern confirms them (bar 39: only C is tied, E♮ and G are struck).
  - **Written instructions followed.**
    - "Ritard." at bars 226 and 416 eases to 75% over two bars before "a Tempo"; "Sempre più allegro" accelerates in quarter-beat steps into the Presto.
    - 36 cresc./dim. ramp note by note toward the next marking (1,527 notes).
    - 111 sf/sfp accents now accent their own notes (247 attacks) relative to the level in force, where they used to become lasting levels.
    - 18 pedal spans.
  - **Library and files.**
    - The entry was updated in place: same id (so practice history still links to it), title and composer, with a new description and practice tips for the new bar map.
    - The previous entry is kept at `.qa-runs/accept-1.7/appassionata-1.6-no-repeats.json`.
    - The MusicXML in `Practice Sheets/` was replaced; the no-repeat file is kept beside that backup.
  - Measured in the app: ♩ 144 at bar 30, about 119 through the ritard at 226, about 160 accelerating at 494, and 180 in the Presto.
- **Also.**
  - Number-score note cards are memoised, so the strip view's 95th-percentile frame while playing fell from 50 ms to about 34 ms. Falling notes runs at 18 ms.
  - The tape and strip take a repeat's own lines only while playing, so bars around a paused repeat stay reachable.
- **Tests.**
  - **Unit:** 122/122, including 7 new tests: the tempo map, tempo import and validation, per-note grading windows, and pedal spans and release. The old test expecting "pedal not applied" now checks the imported pedal.
  - **Browser:** 12/12 on a fresh library. `keyboard-stage-qa` now makes 16 checks:
    - The strip: one whole line with no sideways scroll, smaller than the runway (134 vs 185 px at 1280 × 800).
    - A tempo change measured at ♩ 120.3, then 180.1.
    - The runway zoom: 104 px a beat, 24 px sixteenths, a 284 px chord tie, and the opening chord marked next.
    - Frame rate: dense score 16.7 ms median and 33 ms at the 95th percentile; tape 16.7 and 33.
  - **Test changes for the strip.** Phrase practice now walks the strip's lines to check all 18 dense rests, with no sideways scroll. Sight reading accepts a strip of at least 110 px.
  - **Packaged app:** 8/8 on 1.7.0, including keyboard stage with 16 checks. The installed app matches the tested build in all 2,991 files and links.
- **Personal data.** Of 48 files, only the intended Appassionata entry changed. Everything else is byte-for-byte unchanged through the normal quit, the install and the relaunch (`evidence/data-preservation-1.7.0.json`). The previous 1.6.0 app is kept at `.qa-runs/accept-1.7/previous-Luma Keys-1.6.0.app`.
- **Known limits.**
  - Gradual tempo words (ritard., accelerando) are played as quarter-beat steps.
  - Bars are numbered straight through, so after the written-out repeat they no longer match a printed edition's numbers.
  - Physical MIDI hardware remains untested.
  - Latency compensation trusts the output latency macOS reports.
  - The app does not listen through a microphone.

## Previous direct-user continuation — version 1.6.0
The user asked to cut out everything unnecessary and make the score and the keyboard really visual and helpful while playing. Their own setting has the note runway off, so that layout got the most care. Installed the tested **~/Desktop/Luma Keys.app** (1.6.0); the personal app was quit normally for the install and reopened on the new version.

- **Less on screen.**
  - The piece header is one line of details under the title; the at-a-glance chips moved behind an ⓘ button.
  - What to play next (and after it), the status, the written dynamic, the runway switch and the hide button share one line in the keyboard stage's header. The keyboard header's title, legend, 88-key locator, Follow and octave buttons are gone; the keyboard follows by itself.
  - The control dock is one row; the practice hints and the companion line left the practice screen (the companion stays on the welcome and report cards).
  - Keys print a faint number, names only on C; a key in play shows everything.
  - In the studio the number score's gutter is just R and L in the hands' colours, and a duration is written where the rhythm changes or a bar begins, not under every note of a run.
- **The number score as a tape (runway off or keyboard hidden).** The score takes all the room left over and shows it as lines, each holding as many bars as fit the width at readable spacing (no sideways scrolling; a bar too dense for a line is split between onsets). The line being played is on top and always whole; the next lines sit below, the last one fading at the edge if it is cut. On reaching the next line the tape scrolls: the finished line slides out of the top (0.34 s) while the next moves up from where the eye already found it. A repeat's lines start at its first bar and wrap round. Note size is chosen once per piece and window so it does not jump, and shrinks only where one line of big chords would not otherwise fit. Logic: `readingLayout`, `readingLineAt` and `readingContent` in `src/reading.mjs`.
- **Beside the runway** the score stays one compact line and, while playing, turns as its last bar begins: that bar moves to the front, so what follows is already in view. (The 1.5 work-in-progress rolled the view every bar, which moved the music under the eyes more than once a second in the Appassionata.)
- **Past, now and next** in the score: played notes fade, the sounding note is filled in its hand's colour, the next one is outlined, with a sage cursor.
- **Keys you cannot miss.** The keys to play now take their hand's colour in full, black keys included (they were a dim tint). The chord after them is ringed solidly instead of a faint dashed line. Without the runway, Play in time counts in with a large beat number beside the cue.
- **Smaller windows.** At 900–1180 px wide the practice modes show icons (names kept for assistive tech and tooltips) so the dock stays one row, and the title stays on one line. The keys keep their 1.5 height. At the 1050 × 720 minimum the line being played is still whole; lines of big chords are drawn smaller there.
- **Also fixed.** On phones the app bar's second row (the screen tabs) overlapped the page, because a later fixed 60 px height overrode it.
- **Tests.**
  - **Unit:** 115/115, including three new tests for the tape layout (bar-line breaks that fit the width and cover every bar, dense bars split at onsets, repeats) and for durations written where the rhythm changes.
  - **Browser:** 12/12 suites on a fresh isolated library. `keyboard-stage-qa` now makes 14 checks; the four new ones: the one-line score turns at its last bar (bars 1–4, then 4–7); the tape (lines fit the width, the current line is whole on top with the cursor, moving on slides the next line up, a run writes its duration once a bar, 16.7 ms median frames while playing a 9,600-note score); the count-in beat beside the cue; the next keys lit in full.
  - **Packaged app:** 8/8 suites on the packaged 1.6.0 (keyboard stage with all 14 checks, sight reading, reader, input, phrase practice, continuity, material, quit/save). The installed app matches the tested build in all 2,991 files and links.
- **Caught and fixed during acceptance.**
  - A short repeat set while paused pinned the one-line page to the repeat's first bar, hiding the pickup bar the phrase suite clicks. The pin now applies only while playing.
  - The score read its header's height on every render, forcing a layout pass each frame while playing. It is now measured by a resize observer: the dense score's 95th-percentile frame is back to 33 ms (it had reached 67 ms), and the tape's is 17–33 ms.
  - A finished tape line vanished before the next slid up, leaving a blank band for a third of a second. It now scrolls out of the top as the next line moves in.
- **Personal data.** All 48 personal Library/Exports files are byte-for-byte unchanged through the normal quit, the install and the relaunch (`evidence/data-preservation-1.6.0.json`). The previous 1.5.0 app is kept at `.qa-runs/accept-1.6/previous-Luma Keys-1.5.0.app`.
- **Known limits** are unchanged from 1.5.0.

## Previous direct-user continuation — version 1.5.0
The user asked for the keyboard visual to become the main indicator, synchronised with the music as they play, with the score still important. Installed the tested **~/Desktop/Luma Keys.app** (1.5.0). The personal app was quit normally for the install and reopened on the new version.

- **Keyboard stage.** Practice is now one view that fits the window: header, score, keyboard stage, control dock. The score keeps its natural height (a compact number score in this layout); the stage takes the rest. Below 900 × 620 the old stacked flow remains.
- **Fitted keys.** Keys are sized per piece so its whole range is visible (30–58 px; never under 40 px on narrow screens). Wider pieces scroll with Follow notes and the offscreen notices, as before. Logic: `src/keyboard-stage.mjs` (`fitKeyboard`).
- **Note runway, in time with what is heard.** Notes fall onto their keys, with bars ruled and numbered at the visible edge. One animation frame moves the track from the audible clock (`piano.audibleTime()`: context time minus the reported output latency). The count-in shows notes arriving. The track is re-placed in a layout effect whenever React re-anchors the notes, so it never jumps. **Note runway** hides it (saved as `reading.keyLane`); **Falling notes** makes it tall.
- **Key lights.** Sage marks the right hand and lavender the left.
  - A key is tinted when it is next.
  - It glows from its top edge as its note approaches.
  - While music moves, it fills with colour and drains as the note should still be held.
  - Brightness follows the piece's written loudness range, and the header shows the dynamic in force when the score has dynamics.
  - With a MIDI piano, pressed keys shade by velocity.
  - The chord after the current one is outlined dashed.
- **Feedback on every press.** `judgePress` uses the grader's own windows:
  - Wait for me: hit or miss.
  - Play in time: on time, early or late, or miss. Count-in presses are not judged.
  - Listen: hit, without ever scolding free play.

  A green, amber or rose flash appears on the key, with a spark rising above it; both are finite, and static under reduced motion.
- **Library additions this session.**
  - **晴天 (Sunny Day).** The hqgq.com songbook arrangement, hand-checked against the PDF (Audiveris misread about a quarter of the bars), with the repeat written out: 76 bars.
  - **晴天 · Concert Arrangement.** An original advanced arrangement, G → A major, 66 bars.
  - **Beethoven, Appassionata III.** 361 bars. Source: Craig Sapp's Humdrum encoding of the Durand/Dukas edition, expanded without repeats and converted with converter21. Every bar was checked against the source; music21's dynamic values were rescaled to MusicXML's percentage-of-forte convention.
  - MusicXML and PDFs are in `Practice Sheets/`.
- **Tests.**
  - **Unit:** 112/112, including 9 new tests in `tests/keyboard-stage.test.mjs`.
  - **Browser:** 12/12 suites on an isolated development library. The new `scripts/keyboard-stage-qa.mjs` makes 10 checks: one view at 1280 × 800, fitted keys, runway alignment with the audio clock (worst 1.7 px at 34 px/beat), draining hold and growing approach, dynamics p → f, Wait and Play-in-time verdicts, the saved runway toggle, the tall view, reduced motion, and 16.7 ms median / 33 ms 95th-percentile frames on a 9,600-note score.
  - **Packaged app:** 8/8 suites on the packaged 1.5.0 (keyboard stage, sight reading, reader, input, phrase practice, continuity, material, quit/save). The installed archive matches the tested build.
- **Assertions updated to the new design.** Keys "stay 42 px wide" became "fitted 30–58 px, ≥ 40 px narrow". The score "is at least 200 px" became "is never clipped".
- **Caught and fixed during acceptance.**
  - Duplicate React keys between a key's attack and flash layers.
  - A flex sizing loop: the studio sized itself to the 88-key strip, inflating the keys and hiding offscreen notices.
  - The focus ring has to sit on the key button.
  - A possible one-frame runway jump when notes re-anchored.
- **Personal data.** All 48 personal Library/Exports files are byte-for-byte unchanged through the install and relaunch (`evidence/data-preservation-1.5.0.json`). That count is the original 39 plus 9 created by this session's imports.
- **Known limits.**
  - Pedal marks are not applied in playback.
  - Tempo changes use the first tempo (raise the speed for the Appassionata Presto).
  - Latency compensation trusts the output latency macOS reports.
  - Physical MIDI hardware remains untested.
  - The app still does not listen through a microphone.

## Previous direct-user continuation — version 1.4.0
The user asked for the interface to be completely rearranged and improved like a real app. Installed the tested **~/Desktop/Luma Keys.app** (1.4.0); the personal app was not running during the install.

- **Four screens behind one top bar.** Practice, Exercises, Library and Progress replace the reading page with its Library/Lessons tabs. The top bar keeps Import a score, the settings gear and a MIDI status pill that lights when a keyboard is connected. The old greetings, cover cards and the exercise dialog are gone.
- **Practice** is built around the score: a compact piece header (title, composer, length, tempo and key; the Number score / Sheet music / Falling notes switch; New exercise; review, export and help), the score, a two-row control dock (what to play next with the status line, the transport and the three modes; then the timeline with hand, speed and volume), the keyboard guide and a shortcut line. `N` makes a new exercise at the saved level.
- **Exercises** lists the twelve levels with run counts, best and recent accuracy, a progress bar, Recommended and Cleared tags and a Start button per row, beside a sticky panel with the level's options, Start exercise and the level's practice tips. Selecting a row updates the panel.
- **Library** lists your pieces as rows with source, review status, key, bars, tempo, note count and the last graded result, with Open and Remove, then the starter pieces; the current piece is marked. Search filters both lists.
- **Progress** shows streak, runs today, the average of the last ten, graded runs and the next level; a bar-and-line chart of the last thirty runs (notes right, on time); a per-level table; and the recent runs, each with Open, which regenerates the exact exercise from the seed now stored with every run.
- **Settings** is sectioned into Reading, Timing and Appearance & help (with a Companion tips switch); progress moved to its screen. The reading guide describes the new screens and modes.
- **Second pass, on the user's request for something high-end, usable and still cute:** a larger type scale everywhere it is read from the piano bench (score labels, cue, modes, lists); an **at a glance** row of chips under the title (key signature with its sharps or flats, meter, tempo, each hand's range, and watch-outs computed from the notes: eighths or sixteenths, dotted rhythms, off-beat entries, accidentals with bars, the largest leap with its bar, chords, meter changes, pickups; `src/reading-prep.mjs`); a read-ahead **then** cue beside the next notes; the companion (Luma or Mochi) under the score with one situation-aware line (`src/coaching.mjs`); a compact first-run welcome card with Start Level 1 and Import; the report card gains the companion and two or three rule-based coaching tips that name their numbers (late by n ms, the costliest bar, the leap to look at, slow down or move up) and celebrates 90%+ quietly; level rows show their ingredients (keys, meters, hands); a logo mark; per-theme tints of the whole surface; screen and dialog entrances and a breathing Play button while playing, all disabled under reduced motion; and the old dialog eyebrow copy is gone.
- Structure: screens live in `src/screens/` (Exercises, Library, Progress) and the shell styles in `src/shell.css`, loaded last so they settle the layout over the older reader rules. The acceptance suites were updated to the new navigation (Library rows with Open, the Practice tab, the Exercises panel, the Progress tiles).
- **103/103 unit/API tests pass** (four new: the at-a-glance analysis, coaching tips and companion lines, reopenable history entries). **All 11 browser suites pass** on the isolated development server after the acceptance scripts were pointed at the new navigation: sight-reading 5 groups (now also the welcome card, at-a-glance chips, read-ahead cue, coaching tips, celebration, companion line, Progress reopening a run and the Library rows), reader 9, phrase 10, input 12, material 7, resume-audio 4, overlap 3, chord 3, sheet-focus 3, notation 6 and review 6. **All 7 packaged-app suites pass on the installed 1.4.0** (sight-reading, reader, input, phrase, continuity, material and the quit/save scenarios). The installed archive matches the tested release; all **39 personal Library/Exports files remain byte-for-byte unchanged** (`evidence/data-preservation-1.4.0.json`). One regression was caught and fixed during acceptance: the Play button's breathing animation scaled the button while playing, which made it an unstable target; it now pulses a glow only. Suites that assume a fresh library (Twinkle open, no welcome dismissed) need a clean preferences file, because the app now remembers the last exercise; the checks were made conditional on the saved state.
- Known limits are unchanged from 1.3.0.

## Previous direct-user continuation — version 1.3.0
Installed the tested **~/Desktop/Luma Keys.app** (1.3.0). The personal app was not running during the install, so no process was closed; open it to use 1.3.0. The user asked for the app to become genuinely useful for sight reading and practice efficiency; this pass adds unseen music on demand and reading at a pulse with feedback.

- **New music every time:** **New exercise** in the top bar makes an original piece from a seed, engraved as MusicXML through the same importer as any file, so the number score, the staff view, playback, wait mode and exports share one model. Twelve levels each add one idea (C-position right hand → left hand → skips and rests → both hands with long bass notes → G/F major and 2/4 → eighths → hands together over root-fifth patterns → D/B♭ with leaps and dotted rhythms → block chords with voice leading → Alberti and arpeggio bass → chromatic neighbors, syncopation and 6/8 → sixteenths over an independent bass). Key, hands, length, meter and tempo can override the level. Rhythm comes from beat cells so bars are always complete and beams stay in their beats; melodies are constrained walks with chord tones on strong beats and a budgeted approach so every piece ends on the tonic; hands keep separate registers. **Another like this** and **Keep in library** sit under the title. Flat keys are spelled with flats (B♭, not A♯) across the score, keyboard, cue, review and printable export.
- **Play in time:** a third practice mode. Play counts one bar in (pickups shorten it), the click keeps the pulse, the cursor moves at the practice speed and the piano stays silent while you play. Input onsets are timed against the audio clock, not the animation frame. The report card grades pitch within four tenths of a beat (≥250 ms) and "on time" within a tenth (≥100 ms), lists missed and wrong notes by bar, shows early/late tendency in milliseconds, colours each bar, and offers **Repeat bars a–b** (sets the phrase loop), **Play it again**, **Next exercise** and **Try level N+1** after three clean complete runs (≥90% pitch, ≥60% on time). Pausing part-way grades only the notes reached.
- **Level path and progress:** Lessons shows the twelve levels with run counts, best and recent accuracy and the recommended next level; Start makes an exercise at that level. Settings shows a day streak, runs today, graded runs, the next level and the last five runs. Every graded run is kept in a bounded history inside the settings file, recovered field by field like the rest of the settings.
- **Settings that stay:** key labels, Number 1, count-in, metronome, hidden keyboard guide, music view, speed, mode, hand, exercise choices and the last piece or exact exercise seed are restored on the next launch. **Number 1 follows the key** (off by default) makes 1 the tonic of each piece. A failed piano-sample download is now retried on the next Play instead of silencing the app until relaunch.
- **99/99 unit/API tests pass** (11 new: six generator tests covering every level × twelve seeds, four grading tests, one settings-recovery test). **All 68 browser flow groups pass** on the isolated development server: 5 new sight-reading groups (dialog and level-path generation with engraving, a clock-accurate Play in time run graded 100% with every bar clean, a flawed run graded per bar with the repeat offered and history saved, restored settings and last piece after reload, flat spellings and Number 1 follows the key), plus reader 9, phrase 10, input 12, material 7, resume-audio 4, overlap 3, chord 3, sheet-focus 3, notation 6 and review 6.
- **All 7 packaged-app suites pass on the installed 1.3.0** with the development server stopped and isolated, muted data: sight-reading 5 groups, reader 9, input 12, phrase 10, continuity (sustained-audio, overlap and chord groups, all passing), material 7, and the 3 quit/save scenarios. The first packaged run failed four suites on one narrow-layout assertion: the new three-way mode control had been told not to wrap and overflowed the 390 px layout. Wrapping was restored below 600 px, the browser suites re-passed, and the app was repackaged and reinstalled before this final run.
- The older dashboard-era scripts (settings-qa, backup-qa, rhythm-qa, bar-map-qa, lessons-qa, large-score-qa, browser-qa, extended-qa) still target elements removed in 1.1.0 (old navigation, next-note card, meter hint outside Settings) and fail on selectors before exercising anything; they were not used for acceptance and are unchanged. Note for future QA: because mode and speed now persist, suites that assume Listen mode need a clean preferences file (resume-audio-qa first failed only because the shared exploration library had Play in time saved, and passed once reset).
- Installed archive matches the tested release; all **39 personal Library/Exports files remain byte-for-byte unchanged**: `evidence/data-preservation-1.3.0.json`. The development server and QA instances are stopped.
- Evidence: `evidence/sight-reading-unit-tests.txt`, `evidence/sight-reading-qa.json`, `evidence/native-sight-reading-qa.json`, `evidence/package-1.3.0.log`, the refreshed reader/phrase/input/material/continuity/notation evidence, and screenshots `sight-reading-exercise.png`, `sight-reading-sheet.png`, `sight-reading-results-clean.png`, `sight-reading-results-flawed.png`, `sight-reading-levels.png` (browser and native-* variants).
- Known limits: exercises are major-key, one chord per bar, method-book style; timing is measured when a key event reaches the app, so a MIDI keyboard's own latency is not compensated; physical MIDI hardware remains untested; the app still does not listen through a microphone. Design notes: `docs/SIGHT_READER.md`.

## Previous direct-user continuation — version 1.2.0
Installed the tested **~/Desktop/Luma Keys.app**. **Quit and reopen the existing personal app to load 1.2.0.** Native window automation returned `noWindowsAvailable` / `timeoutReached`; the old personal process was left running rather than forcibly terminated. Its local API remained healthy. This direct user request followed the overnight deadline; the expired schedule was not extended.

- **Practice a small phrase directly:** Repeat these bars selects the numbered manuscript's visible whole bars. Click a bar number then Shift-click another to set a range, or edit the player's existing bar fields. Quiet marks on the paper show the repeat, with a compact stop control.
- **Reliable acoustic stepping:** Next/Previous cycle inside the repeated phrase; Start over returns to its first bar. Changing hand/mode or saving reviewed notes retains that context. Browsing outside the phrase turns repeat off and returns to the whole piece. Manual navigation does not invent correct-note counts or sessions.
- **Accurate close notes:** precise onset lookup fixes skipped/misidentified rapid notes, including real 128th-note MusicXML fixtures. The position slider preserves fractional beats. Actual Wait input rejects a wrong nearby pitch and advances through each required onset correctly.
- **Counted silence:** rests show their quarter-note duration, split at actual bar boundaries. Two-line labels and bounded spacing keep short rests legible. Adaptive spacing is still a reading aid, not a rhythmic scale.
- **Less interface when reading at a piano:** Hide keyboard guide folds it into a compact strip. Computer/MIDI ownership remains independent; hidden keys are inert and out of Tab order. The choice survives Library/Lessons navigation during the current session. Falling notes temporarily reveals the keyboard. The choice does not yet persist after quitting.
- **88/88 unit/API tests passed. All 48 flow groups passed in browser and packaged 1.2.0:** 10 new phrase/focus/rest groups, 10 sustained-audio/overlap/chord groups, 7 material groups, 12 input groups and 9 reading groups (including real PDF recognition, correction, export and 50,000-note navigation). The packaged app also passed all 3 normal/failed-save quit scenarios. Native checks ran with the development server stopped and isolated, muted data. Physical MIDI hardware remains untested.
- Two initial native continuity attempts were interrupted: a window closed in the first; a screenshot timed out in the second after all overlap behavior assertions had passed. Their logs are retained. Added bounded lifecycle diagnostics and focus for only the owned QA window; the final unchanged musical assertions and screenshots passed with no recorded errors and exit code 0. The earlier interruption causes were not established, and no product behavior was changed to mask them.
- Claude was prompted for another read-only review, but its CLI returned **Not logged in** with zero model tokens. It did not review this version. Independent code review and actual flows caught and corrected lost collapse state, review/phrase mismatch and clipped rest labels. See `docs/CLAUDE_PHRASE_REVIEW.md`.
- The installed archive matches the tested release; all **39 personal Library/Exports files remain byte-for-byte unchanged**. Evidence: `evidence/data-preservation-1.2.0.json`. Test apps and the development server are stopped; the personal process remains running on the prior loaded version until reopened.
- Acceptance evidence: `evidence/phrase-unit-tests.txt`, `evidence/phrase-practice-qa.json`, `evidence/native-phrase-practice-qa.json`, `evidence/native-continuity-qa.json`, `evidence/native-continuity-diagnostics.json`, `evidence/native-material-qa.json`, `evidence/native-input-qa.json`, `evidence/native-reader-qa.json`, and `evidence/close-qa.json`. `phrase-*.log` retains commands/results; `resolved-phrase-collapse-failure.*` preserves the fixed first-run UI failure. New screenshots include `native-phrase-practice-selected-phrase.png`, `native-phrase-practice-score-only.png`, `native-phrase-practice-rest-durations.png`, and `native-phrase-practice-narrow-score-only.png`.

## Previous overnight verification and fixes — version 1.1.2
Preserved the user's concise, matte sight-reading layout. Installed and reopened **~/Desktop/Luma Keys.app** after checking the personal app was idle and using normal Quit.

- **Held-note playback:** the previous package was silent when Listen started midway through a sustained note. Resume and phrase entry now start its remaining duration once, with the existing articulation/release tail, clipped to the selected ending. Carry-only phrases play each loop and show HOLD; Wait mode still asks only for new written onsets. Actual sample-source scheduling was measured in browser and native app. Baseline: `evidence/resume-audio-baseline.json`.
- **Clearer two-hand reading:** full chord stacks expand the page naturally instead of hiding the left-hand row inside a 232px scroll region. Wait mode marks earlier sustained notes with a quiet hold annotation; only the newly required onset receives the current accent. Complex chords may require ordinary page scrolling to reach the keyboard/transport; note sizes stay readable.
- **Truthful motion:** overlapping voice releases and live-key releases no longer replay the attack animation. New notes and playback/loop epochs do; all 88 key buttons retain stable identities. The isolated before/after trace is saved in `evidence/overlap-motion-baseline.json` and `evidence/overlap-motion-fixed.json`.
- **Reliable PDF retry:** full regression testing exposed public terminal status appearing while the final receipt was still committing and the engine slot remained reserved. Terminal status now publishes with slot release after persistence settles. A gated-write regression reproduces the old behavior and passes after the correction; it retains engine ownership during finalization. Original failure: `evidence/recognition-publication-race-baseline.txt`.
- **83/83 unit/API tests pass**, including new motion/resume and recognition-publication cases. **38 flow groups pass in both browser and packaged 1.1.2**: 10 continuity/chord/audio groups, 7 material groups, 9 reader groups and 12 input groups. Native PDF lifecycle also passes normal Quit, window close and forced termination of isolated QA instances, each recovering/retrying 16 exact starter notes with no orphaned engine. The development server was stopped for native testing.
- Claude performed the requested read-only review with tools/MCP disabled. Its confirmed reading/motion findings informed the fixes; it did not edit, run tests or review the later corrections. Scope and remaining suggestions: `docs/CLAUDE_MOTION_REVIEW.md`.
- Installed archive matches the tested release. All **39 personal Library/Exports files remain byte-for-byte unchanged**, including after reopening. The personal app is open; development/QA apps are stopped. Evidence: `evidence/data-preservation-1.1.2.json`.
- Acceptance evidence: `evidence/continuity-unit-tests.txt`, `evidence/native-continuity-qa.json`, `evidence/native-material-qa.json`, `evidence/native-reader-qa.json`, `evidence/native-input-qa.json`, `evidence/recognition-close-qa.json`; the corresponding browser results and continuity logs are retained. Chord visuals: `evidence/native-chord-reading-held-notes.png` and `evidence/native-chord-reading-reduced-mobile.png`.
- Known interpretation/recognition limits below remain. Physical MIDI hardware remains untested. This pass finished before the original 8 AM Eastern deadline; the schedule was not extended.

## Previous user-directed material and motion update — version 1.1.1
The user requested more interesting animation and a less plastic interface. Keep the concise sight-reading direction.

- Installed and reopened **~/Desktop/Luma Keys.app**. Confirmed the new appearance in the actual personal Desktop window: warm graphite, grained ivory manuscript paper, serif score typography, restrained accents, matte ivory/ebony piano keys and simpler control surfaces. The full transport fits within the tested 1280×800 viewport.
- A played key's inner cap depresses with a finite resonance stroke; the actual 88 buttons, fixed 42px white-key width, pointer capture and native scrollbar gutter remain stable. Contiguous repeated C4 playback notes retrigger the effect by event identity without replacing their key button. Wait-mode targets stay quiet until actual input.
- Numbered notes receive a brief ink accent, held continuations remain steady, and passage contents enter over 260ms. Cursor position remains transport-driven. Reduced-motion changes cancel live page motion and disable decorative effects while preserving note cues, input and navigation.
- **71 unit/API tests passed**, plus **7 material/motion groups, 9 reading groups and 12 input groups in both browser and packaged 1.1.1**. Native reading includes real starter PDF recognition, source preview, corrections, full-range chords and a 50,000-note score. Tests used isolated libraries and muted playback; no physical MIDI hardware was used.
- The tested release and installed archive match. All **39 personal Library/Exports files remain byte-for-byte unchanged**, including after normal Quit/reopen. The prior personal window was verified idle before normal Quit; no force termination was used. The updated personal app is open. Development server and isolated QA instances are stopped.
- Evidence: `evidence/native-material-qa.json`, `evidence/material-qa.json`, `evidence/native-reader-qa.json`, `evidence/native-input-qa.json`, `evidence/material-unit-tests.txt`, `evidence/data-preservation-1.1.1.json`. Visuals: `evidence/native-material-desktop.png`, `evidence/native-material-mobile.png`; silent animation example: `evidence/material-motion-preview.webm`.
- This refinement does not change recognition or audio interpretation limits. The existing overnight deadline remains 8 AM Eastern; do not extend it or restore the older dashboard.

## Previous user-directed redesign — version 1.1.0
The user clarified that this should be a concise **sight-reading tool**, not a piano dashboard. This direction takes precedence over the earlier dashboard presentation. Do not restore pets, progress cards, greetings or a sidebar to the main reading workspace.

- Installed **~/Desktop/Luma Keys.app** and opened the updated app. The default is now a large, light numbered score, a compact next-note cue, a readable keyboard window and transport. Library and import stay in the top bar. Settings holds companions, themes, progress, tonic/label choices, count-in, metronome and lesson tips.
- Number score shows four bars (two in a narrow window), with separate hands, explicit pitch/octave, chords, silence and quarter-note durations. Hand selection hides the unused row. Dense passages retain readable spacing and bounded onset groups; a carried note shows its remaining duration and seeks within the current passage. Page navigation and bar jumps use real pickup/changing-meter boundaries. Manual Previous/Next note supports acoustic-piano practice without awarding fake correct-note counts.
- All 88 keys remain reachable in a scrolling window at **42 pixels per white key**. The overview and octave arrows show location without squeezing the playable keys. Offscreen chord pitches have explicit direction buttons. Follow works through held computer/MIDI-style notes but does not move a key under an active pointer. Arrow keys move piano focus; Enter/Space plays it.
- Optional **Sheet music** shows a compact four-bar engraving with an onset cursor; **Falling notes** remains a secondary view. Original notation is identified as unchanged by manual note corrections; Number score and playback use those corrections. Fixed OSMD implicit-pickup page boundaries, shared iterator state clearing cursor notes, stale cursor images and normalized-pickup timestamp mapping.
- Removed the greeting, daily-goal card, pet card, separate settings/legend panels and sidebar from the reading workspace. Dialogs make the background inert. Desktop and 390px layouts were visually checked. The Play control is visible in the default 1280×800 view.
- Native testing found macOS overlay scrollbars intercepted the bottoms of keys. A dedicated scrollbar gutter now keeps the full key surface clickable; the packaged pointer-hold scenario passes. Diagnostic evidence: evidence/resolved-native-key-scrollbar.json and .png.
- Claude reviewed the new number-reading and keyboard code with tools/MCP disabled. Codex addressed its four findings about near-equal onsets, tight note spacing, held-note duration/seek and legato follow. Claude did not edit, run tests, or review later corrections. Report: docs/CLAUDE_READER_REVIEW.md.
- **71/71 unit/API tests pass**, including eight reading tests. All **9 reader flow groups pass in browser and packaged 1.1.0**: navigation, labels, wait mode, original staff cursor, pointer/held-key follow, A0+C8 extremes, narrow layout, 50,000-note score, numbered export, real 16-note PDF recognition/original display and saved pitch corrections. All **12 input regressions** pass in browser and native app. **3 native quit/save scenarios** pass. **3 focused sheet-cursor groups** and **6 existing long-notation review groups** also pass.
- The final packaged reader, input and close runs passed with development servers stopped. Installed archive matches the tested release. All **39 personal Library/Exports files remain byte-for-byte unchanged**: evidence/data-preservation-1.1.0.json. Only isolated test apps were closed; the installed personal app was opened after verification.
- Current test entry points: scripts/reader-qa.mjs, scripts/native-reader-qa.mjs, scripts/input-qa.mjs, scripts/native-input-qa.mjs, scripts/close-qa.mjs, scripts/sheet-focus-qa.mjs and scripts/notation-qa.mjs. Some older dashboard-specific scripts retain historical selectors; do not confuse them with current reader acceptance. Evidence: reader-unit-tests.txt, reader-qa.json, native-reader-qa.json, native-input-qa.json, close-qa.json, sheet-focus-qa.json, notation-qa.json and reader-*.log. Screenshots: native-reader-desktop.png, native-reader-sheet.png, native-reader-mobile.png and native-reader-pdf-reading.png.
- This is a beginner numbered reading aid, not automatic fingering or complete interpretation of every printed marking. PDF notes still need review. Physical MIDI hardware remains untested. The existing overnight schedule is unchanged and must end at 8 AM Eastern.

## Previous overnight improvement — version 1.0.8
- Installed and verified the Desktop update. Open **~/Desktop/Luma Keys.app** to use it.
- Reproduced five input failures in the previous packaged app: computer notes ignored after clicking Play, delayed Play resuming after Start over, delayed notes surviving blur or MIDI disconnect, and a stale sustain indicator after Pause. Baseline: evidence/input-baseline-1.0.7.json.
- Piano inputs now track separate owners for computer keys, onscreen pointers/buttons, MIDI ports and MIDI channels. Releasing one input cannot release another input's held note. Harmless MIDI state changes keep held notes; reconnecting does not duplicate listeners. Separate pedals preserve sustain until all pressed pedals are released.
- Stop, loss of focus and disconnection invalidate pending note starts. Cancelled audio startup cannot restart playback or cancel a newer request. Play reads current settings after samples load. Computer letters work after clicking Play or focusing a slider; text fields remain safe to type in. Command-key transitions recover omitted letter releases without cutting MIDI notes.
- Listen-mode loop boundaries now stop only scheduled accompaniment, preserving live held notes and sustain. Finishing wait mode lets the final correct note ring until release. Pause and Start over still clear all voices, owners and pedal indicators.
- A fourth read-only Claude pass identified loop/pedal, startup-state, modifier, slider-focus and final-note issues; Codex implemented and verified the follow-up. Claude did not edit files, run tests or review the later corrections. Report: docs/CLAUDE_INPUT_REVIEW.md.
- **63/63 unit/API tests pass.** All **12 new input scenarios pass in both browser and packaged 1.0.8**, including measured cancellation of delayed audio, mixed input ownership, loop-held notes and final-note release. Simulated MIDI is explicitly marked; physical MIDI hardware remains untested.
- All **28 native core checks** pass, including real 16-note PDF recognition, original viewing, lesson/review/library/settings flows. All **3 packaged settings/quit scenarios** pass, preserving active practice time and the latest theme and keeping the app open on the simulated failed-save choice. All 30 sampled sounds and the existing extended/MIDI/rhythm regressions pass.
- A metronome test initially watched a second, unused audio module after development hot reload. The harness now observes the module already loaded by the UI. Compound-meter timing, odd-meter loop accents and click cancellation pass; the diagnostic is preserved in evidence/rhythm-hot-reload-observer-baseline.json.
- Installed archive matches the tested release; all **39 personal Library/Exports files remain byte-for-byte unchanged**. No personal app close/kill command was issued. At the final process check the earlier personal PID was no longer present, so no claim is made that it remains running. Evidence: evidence/data-preservation-1.0.8.json.
- Evidence: evidence/overnight-unit-tests-1.0.8.txt, evidence/input-qa.json, evidence/native-input-qa.json, evidence/native-input-verified.png, evidence/overnight-native-1.0.8.log, evidence/overnight-close-1.0.8.log, evidence/overnight-package-1.0.8.log. Shared regression harness: scripts/input-checks.mjs; pure input tests: tests/input.test.mjs.
- MIDI input implements note-on/off, velocity and CC64 sustain. Other controller messages, including CC120/123 panic, remain outside this subset; local Pause/Start over clears voices. Missing Command-key release events were constructed in the test, not measured on a physical keyboard/controller combination.

## Previous overnight improvement — version 1.0.7
- Installed and verified the new Desktop app. The personal app remains open; reopen when convenient to load this update.
- Reproduced a real PDF lifecycle failure: normal Quit left the native Audiveris process running under PID 1, and reopening returned a missing-job error. Baseline: evidence/pdf-close-baseline.json.
- PDF imports now keep local receipts and original files. **View imports** restores live progress after a renderer reload. You can close the panel and keep practicing; background completion waits for **Review notes**. **Cancel recognition** stops the reader, **Retry recognition** uses the retained PDF, and **Dismiss** hides only the notice.
- A small engine-owning runner stops Audiveris when the desktop disconnects, including the tested force-quit case; it escalates to SIGKILL after three seconds if SIGTERM is ignored. Normal Quit/window close await recognition shutdown after saving settings. Reopening explains interruption and offers retry. Only live child handles owned by the app are signalled; stored PIDs are never used to stop processes.
- The single-engine slot is reserved before filesystem work; retries use separate output folders. Ordered atomic receipts fix concurrent dismiss/retry races. Planned score IDs are recorded before saving so already-committed parts can be recovered after a crash without a duplicate retry; partial saves explain how many parts survived. Originals are installed atomically after the receipt exists. A startup handshake distinguishes engine-launch failure from unreadable notation.
- A third read-only Claude pass reviewed the initial PDF candidate. Codex addressed its lifecycle/race/logging/commit concerns and added the requested packaged and force-kill tests. Claude did not edit files or run tests, and did not review the subsequent corrections. Full report: docs/CLAUDE_PDF_REVIEW.md.
- **59/59 unit/API tests pass.** New tests cover overlapping starts, cancel, fresh retries, concurrent dismiss/retry, malformed receipts, missing originals, timeout, engine launch failure, interrupted score commits, and SIGKILL of a harness whose native-engine fixture ignores SIGTERM.
- The final packaged app passes **28 native integration checks** and all **3 existing settings/quit scenarios**. Separate PDF lifecycle tests pass normal Quit, window close and force quit: each leaves zero owned engine/runner processes, preserves the original PDF hash, and reopens/retries to all 16 exact starter pitches. Packaged reload/cancel/background-completion/dismiss flows also pass, with no renderer errors.
- Installed archive matches the tested release; all **39 personal Library/Exports files remain byte-for-byte unchanged**. The personal app was not closed. Evidence: evidence/data-preservation-1.0.7.json.
- Evidence and harnesses: evidence/recognition-close-qa.json, evidence/recognition-qa.json, evidence/overnight-unit-tests-1.0.7.txt, evidence/overnight-native-1.0.7.log, evidence/overnight-recognition-close-1.0.7.log, evidence/overnight-close-1.0.7.log, the pdf-*-recovered/native-pdf-lifecycle screenshots, tests/recognition.test.mjs and scripts/recognition-close-qa.mjs.
- Scope: receipt recovery applies to imports started in 1.0.7 onward; old saved scores/originals remain intact. Cancelling discards that recognition attempt, so Retry starts reading again. The tests establish these interruption paths on this Mac, not a guarantee against disk damage or every system failure. PDF accuracy still requires review.

## Previous overnight improvement — version 1.0.6
- Installed and verified the new Desktop app. The personal app remains open; reopen when convenient to load this update.
- Reproduced invalid saved volume interrupting startup and truncated settings being silently replaced. Settings now recover each field independently: valid theme, companion, mute and progress survive; invalid values receive defaults and a clear notice. The audio engine also rejects non-finite gain values and bounds volume to 0–1.
- Opening the app never writes settings merely because they were loaded. The first actual save of recovered values keeps the original bytes in **Library / Settings recovery**, then replaces preferences atomically. Invalid API writes and failed recovery-copy attempts leave the original untouched. Tests include invalid UTF-8 bytes, partial legacy settings, numeric-string progress and impossible dates.
- An unreadable settings file leaves a persistent notice that progress/changes are temporary, with **Reload saved settings** once file access is restored. Music loading is independent. During initial settings loading, preference and practice controls wait so early edits cannot be overwritten.
- Normal desktop Quit and window close now record the active session's minutes and wait for pending settings writes before closing the server. A real save failure offers **Keep open** or **Close without saving**. The former behavior lost an active session and a just-changed theme; both are reproduced in evidence/settings-close-baseline.json and fixed. Force termination/power loss cannot execute the close handler.
- A second, read-only Claude pass reviewed the initial recovery candidate with tools/MCP disabled. Claude found three low-severity lifecycle cases; Codex addressed and tested all three. Claude did not edit files or run tests. The report distinguishes that review from subsequent Codex corrections: docs/CLAUDE_SETTINGS_REVIEW.md.
- **52/52 unit/API tests pass**, plus browser recovery/startup and all 30 sampled-audio checks. The final packaged app passes **28 native checks**, including actual 16-note PDF recognition, original viewing, lesson/long-score review, backup recovery, saved settings, mute, numeric progress, delayed loading and unreadable-file recovery. Native playback is muted only in its isolated QA instance.
- A separate packaged exit harness passes normal Quit, window close, and failed-save Keep open/retry. The immediate exits saved active practice minutes and the new theme; the failure-choice selection was simulated inside the isolated test instance. Evidence: evidence/close-qa.json and evidence/overnight-close-1.0.6.log.
- Installed archive matches the tested release. All 39 personal Library/Exports files remain byte-for-byte unchanged, and the personal app was not closed. Evidence: evidence/data-preservation-1.0.6.json.
- Other evidence: evidence/overnight-unit-tests-1.0.6.txt, evidence/settings-baseline.json, evidence/settings-qa.json, evidence/native-qa.json, evidence/overnight-native-1.0.6.log, and settings/native-settings screenshots. Harnesses: scripts/settings-qa.mjs, scripts/close-qa.mjs, tests/preferences.test.mjs.

## Previous overnight improvement — version 1.0.5
- Installed and verified the new Desktop app. The personal app remains open; reopen when convenient to load this update.
- Reproduced two failures before changing code: a valid-looking JSON backup with missing metadata blanked the review screen, and damaged saved dates could stop the entire library API. Evidence is in evidence/backup-baseline.json and backup-baseline-failure.png.
- Backups now validate the complete playback metadata, including total duration, bar count, display text, flags and note volume. Invalid pitches/rhythms receive an actionable error before saving. Older backups receive chronological note ordering, unique editable note IDs, default velocities/warnings, derived bar labels and enough duration to play every note. Inferred timing is flagged for review; lost silent bars cannot be reconstructed from notes alone.
- Every library file is checked independently. Damaged entries are omitted from the playable list while a persistent recovery notice identifies the file and reason. Healthy scores still load. The files remain untouched; **Check library again** restores entries after their files are repaired. No automatic deletion or replacement occurs.
- All import formats and saved note reviews now use the same validation. The studio uses the canonical saved result. Valid built-in lessons and independent Bach/Joplin scores keep their notes, durations and bar counts; the existing personal starter score remains readable.
- **48/48 unit/API tests pass.** Browser and packaged-app tests cover legacy import/edit/export, rejected null notes, damaged library files, unchanged source bytes, recovery without restarting, and a narrow-screen notice. Existing review regressions pass. The 50,000-note test still imports in about 0.71 s and saves in 0.36 s on this headless run; frame pacing remains hardware/environment dependent.
- Packaged 1.0.5 passed actual 16-note PDF recognition/original viewing, sampled-audio timeline advancement, lessons, 256-bar notation navigation and all new recovery flows with the dev server stopped. The native QA instance now mutes its own output during overnight playback; the personal app's volume is unchanged.
- Installed archive matches the tested release. All 39 personal Library/Exports files remain byte-for-byte unchanged. The personal app was not closed.
- Evidence: evidence/overnight-unit-tests-1.0.5.txt, evidence/backup-qa.json, evidence/backup-compatibility.json, evidence/native-qa.json, evidence/overnight-native-1.0.5.log, evidence/data-preservation-1.0.5.json and backup/native-backup screenshots. Regression harness: scripts/backup-qa.mjs and tests/backups.test.mjs.

## Previous overnight improvement — version 1.0.4
- Installed and verified the new Desktop app. The personal app stayed open; reopen when convenient to load the update.
- Long scores now display in passages of up to 16 bars, with Previous/Next and a **Review from bar** jump shared by the note table and engraved sheet. Review opens at the current practice bar. The displayed bar range stays in a loading state until that actual passage is drawn, preventing a stale score image after a jump.
- Narrow windows scroll the notation sideways instead of compressing notes together. The renderer keeps the complete score context for clefs, keys and ties, and cleans up its resize observer when closed.
- Fixed valid MusicXML without an XML declaration failing to engrave. The preview reads a local XML Document rather than allowing the rendering library to guess whether a string is a URL. Invalid embedded notation shows a clear fallback; notes remain editable and subsequent valid scores still render.
- New MusicXML/PDF imports retain explicit closing rests and rest-only final bars; reviewing/saving no longer trims them. Short final bars are not padded with invented silence. The key-change warning now correctly explains that labels keep the selected tonic. Older saved imports are preserved; re-import them to obtain corrected ending durations.
- **44/44 unit/API tests pass.** Independent Bach/Joplin exports verify sustained voices, ending chord/rests, key-change passages and direct review navigation. A 256-bar / 4,352-note synthetic book reaches middle and final passages. Existing note-editing and Für Elise regressions pass.
- On this Mac's headless browser test, the initial Joplin passage used 2,266 DOM nodes versus 12,636 for the former whole-score view, and about 1,939 pixels of sheet height versus 8,812. This is a bounded rendering improvement, not a claim about every book, scan or machine.
- Packaged 1.0.4 passed native playback, export, actual 16-note PDF recognition/original viewing, lesson practice, long-score navigation, closing-rest playback, and invalid-notation recovery with the dev server stopped. Installed archive matches the tested release; all 39 personal Library/Exports files remain unchanged.
- Evidence: evidence/overnight-unit-tests-1.0.4.txt, evidence/notation-qa.json, evidence/notation-baseline.json, evidence/overnight-native-1.0.4.log, evidence/native-qa.json, evidence/data-preservation-1.0.4.json and native-notation screenshots. Independent fixtures and hashes are in tests/fixtures/README.md. The resolved no-header rendering failure is preserved in evidence/resolved-notation-header-failure.*.
- Development watching now excludes QA data, personal Library/Exports and build/evidence folders, so writing an exported HTML sheet does not reload a running UI test.

## Previous overnight improvement — version 1.0.3
- Installed and verified the new Desktop app. The personal app process was left open; reopen when convenient to load this version.
- Corrected the built-in Für Elise opening against the public-domain Mutopia/Breitkopf & Härtel score. It now contains 53 notes across both hands, the two-sixteenth pickup, 3/8 meter, correct bass octaves and rests, and a short first ending. The former demo incorrectly flattened the rhythm and placed bass notes in the right-hand melody.
- Added engraved two-staff notation and a three-step practice path. The pickup is app bar 1; bass enters in app bar 3. Corrected MusicXML, printable HTML, and a visually checked two-page numbered PDF are saved in Practice Sheets. This is a short excerpt played once; pedal and expressive interpretation remain simplified.
- Fixed overlapping short falling notes. Fast passages now use a closer preview; blocks retain proportional duration and separation. Repeated E5 notes were checked for overlap in both browser and packaged app. Very small blocks suppress text while the next-note panel and keyboard retain labels.
- **41/41 unit/API tests pass.** Lesson engraving, left-hand wait mode, numbered export, existing loop/keyboard regressions, and a synthetic 50,000-note import/review/seek/playback test pass. In the measured headless Chrome run, large-score import took about 0.67 s and review save about 0.36 s. Frame timing is recorded; this is not a guarantee of smooth full-book engraving or all hardware.
- The packaged app passed audio, export, lesson practice and actual 16-note PDF recognition with the dev server stopped. Installed archive matches the tested release, and all 39 personal Library/Exports files remain byte-for-byte unchanged.
- Evidence: evidence/overnight-unit-tests-1.0.3.txt, evidence/lessons-qa.json, evidence/large-score-qa.json, evidence/overnight-native-1.0.3.log, evidence/data-preservation-1.0.3.json, and native-elise screenshots. Source and interpretation details: docs/RESEARCH.md and docs/sources/fur-elise-mutopia.ly.

## Previous overnight improvement — version 1.0.2
- Installed new Desktop app; personal app remained open. Reopen when convenient to load the update.
- Imported MusicXML and MIDI now preserve written pulse groups: 6/8 and 9/8 dotted beats, 5/8 fractional bar accents, cut time, and explicit additive groups. Metronome/count-in use the audio clock with look-ahead scheduling; Pause, Stop, and loop reset cancel queued click oscillators.
- Pickup count-ins lead into the pickup's place in the bar. A compact meter hint shows pulses per bar. Tempo is labeled `♩ =` to distinguish quarter-note tempo from the audible compound pulse.
- Cross-staff voices preserve pitch/timing and receive a hand-review warning. Hand choice still follows written staves until edited; it is not inferred as certain.
- **38/38 unit/API tests pass.** Browser audio measurements confirm 6/8 clicks every 0.75 seconds at quarter-note tempo 120, correct 5/8 loop accents, and click cancellation. Changing-meter practice, all 30 piano samples, and simulated MIDI/sustain still pass.
- Packaged 1.0.2 passed playback, export, actual 16-note PDF recognition, and original-PDF viewing with the dev server stopped. Installed archive matches tested release; all 39 Library/Exports files remain unchanged.
- Evidence: evidence/overnight-unit-tests-1.0.2.txt, evidence/rhythm-qa.json, evidence/overnight-native-1.0.2.log, evidence/native-qa.json, evidence/data-preservation-1.0.2.json. Research references and interpretation limits are in docs/RESEARCH.md.
- Older imported scores retain their existing timing. Re-import them to gain pulse metadata. Ungrouped odd meters use their written subdivision; a performer's preferred grouping is not inferred.

## Previous overnight improvement — version 1.0.1
- Installed and verified new Desktop app. The existing personal app process was left running; quit and reopen when convenient to load this version.
- MIDI meter changes now produce explicit bar boundaries shared by practice loops, bar labels, review and printable exports. Held notes preserve every bar they span. MusicXML final bars also retain their actual length.
- Wait mode stays inside the selected phrase. Empty selected-hand phrases give useful guidance; falling notes and next-note hints show only the chosen phrase.
- New MIDI notes across a bar line are no longer snapped into the same chord. Quarter-note metronome accents follow the bar map.
- UI and native tests now use isolated libraries. Native tests have a separate Electron instance lock and can coexist with the personal app. Fixed serving original PDFs from libraries inside hidden parent folders, discovered by this isolation check.
- **30/30 unit/API tests pass**, plus the new changing-meter browser flow and review/extended regressions. Latest packaged build passed sampled audio, actual 16-note PDF recognition, and original-PDF rendering with the dev server stopped.
- Confirmed Library and Exports remain byte-for-byte unchanged (39 files); installed app archive matches the tested release. See evidence/overnight-data-preservation.json.
- Evidence: evidence/overnight-unit-tests-1.0.1.txt, evidence/bar-map-qa.json, evidence/native-qa.json, evidence/overnight-package-1.0.1.log. The resolved hidden-folder preview failure is preserved as evidence/overnight-hidden-folder-failure.*.
- Earlier MIDI imports need re-importing to gain the new meter map. Existing user scores were not rewritten.

## Delivered
- Standalone Apple Silicon macOS app: **~/Desktop/Luma Keys.app** (about 590 MB; includes Electron, Java/Audiveris, piano samples and PDF rendering resources).
- Complete source, assets, practice sheets and documentation: **~/Desktop/Luma Keys/**.
- Default first-run experience: Twinkle, Little Star; 4 built-in lessons; one verified C-major starter PDF score; mint theme with Luma; fresh practice counters.
- Local PDF recognition with progress and review, MusicXML/MXL/MIDI/JSON import, editable notes (add/remove/pitch/rhythm/hand), original PDF page rendering and engraved MusicXML.
- Accurate number/solfege/octave labels, falling notes, sampled grand piano, listen mode, wait-for-note mode, hand selection, speed/count-in/metronome, phrase loops, computer keys and USB MIDI input/sustain.
- Companions (cat/bunny), 3 moods, local progress, printable numbered HTML and JSON export to Desktop/Luma Keys/Exports.
- Claude enhancement pass implemented and independently validated; report: docs/CLAUDE_REVIEW.md.

## Verification actually completed
- **88/88 unit and API regression tests pass.** See evidence/phrase-unit-tests.txt (earlier delivery results are preserved).
- Production build and Apple Silicon packaging pass. Desktop copy tested with the development server stopped.
- Browser flow coverage passes: playback/pause/seek, 30 samples decoded, correct/wrong note handling, loop wrapping, labels/ranges, saved themes, import/engraving/review/library/search, and 390px responsive layout.
- All 30 samples contain non-silent audio; on-screen keys support pointer and Enter/Space input.
- Actual starter PDF → Audiveris → MusicXML round trip matched all **16 pitches and durations**. Original PDF is visibly rendered as a canvas. A more complex official Schubert example produced 277 notes and exposed recognition warnings.
- Current native reader, input and save/quit tests pass. See evidence/native-reader-qa.json, evidence/native-input-qa.json, evidence/close-qa.json and native-reader screenshots. Older delivery evidence is preserved in Git.
- Simulated MIDI note-on/off and CC64 sustain pass. **No physical MIDI keyboard was connected/tested.**
- npm audit reports **0 vulnerabilities** (evidence/dependency-audit-final.json).
- On laptop-size windows Play and Connect piano are visible without scrolling.

## Overnight follow-up
The heartbeat `luma-keys-overnight-build-polish` ended at **2026-09-25 08:00 Eastern**. Subsequent work follows direct user requests; do not extend that schedule. See docs/OVERNIGHT.md.

Useful next checks: progress across renderer reload/midnight, note-review ergonomics in smaller laptop windows, and dense-passage frame pacing in a visible native window. Malformed settings, slow startup, normal native exit, failed-save recovery, PDF interruption/retry and mixed/delayed piano inputs are now covered. Backup metadata and isolated corrupt-library recovery are now covered. Independent real MusicXML exports, 256-bar notation navigation, the 50,000-note JSON timeline and the Für Elise opening have been verified; arbitrary scanned full-book recognition remains unproven. Changing-meter MIDI loops, compound/odd-meter clicks, and a constructed cross-staff fixture also pass. Improve only where new evidence justifies a change. Keep the app usable and repackage validated changes with scripts/package-desktop.sh. Preserve all user Library and Exports data. **Never rerun scripts/prepare-starter-library.mjs**; it is guarded as an initial-delivery-only cleanup. `scripts/update-elise-assets.mjs` safely refreshes only the shipped Für Elise files in Practice Sheets.

## Known limits
PDF recognition is not perfect; every imported scan requires review. Repeats/navigation play once in written order. Later tempo changes and score pedal/ornament markings are simplified with warnings. MIDI hand assignments and humanized-chord grouping are estimates. Fixed Do remains C=1 by default; imported tonic metadata does not change labels automatically. The app does not listen to acoustic pianos through a microphone or infer fingerings. This is a local personal Mac build, not an App Store release.

## Development state
The development server and temporary agent-browser test sessions were stopped after verification. Native tests run in project-local .qa-runs directories and clean up their own data; no test closes the personal app. The 1.2.0 update is installed, but the existing personal process was left open after native window automation timed out. The user needs to quit and reopen once to load the tested update. The installed app starts its own loopback server and does not depend on development servers. Source uses local Git checkpoints. Runtime state lives in Library; build files can be replaced without deleting practice data.
## October 11 — sound recovery and large-score freeze fix 2.44 installed

Continued the user's improvement request with the recent silence report first.
Practice Tools → Sound now has **Test sound** and **Recover audio**. Audio startup
has a three-second deadline, validates the running context, and shares concurrent
resume requests. An interrupted context pauses playback and offers recovery.
Recovery saves first, reloads the audio system and restores the exact piece,
beat and repeat range paused; failed saves keep the current window open. Testing
does not create a practice session and is disabled during microphone listening.

A native 50,000-note import exposed a separate real freeze: the hand-planner
worker timed out at 20 seconds and moved the whole calculation to the renderer.
Large-score failures now stop there and show **Retry hand guide** while playback
and navigation stay responsive. Small exact fallbacks remain. The formerly frozen
reader/PDF-correction story passes all nine checks. This is a hand-guide reliability
fix, not a new visual redesign.

**Verification:** 40 focused audio and 55 storage/backend/microphone/packaging tests
passed; 29 planner/coach/continuity tests passed after the freeze fix. The broader
suite was 939/940, with a companion process-fixture startup timeout under load
(that case passed in isolation). Exact packaged audio passed eight groups and
hand failure/retry passed three. Seven of eight final native stories passed;
grand's rerun passed all 18 functional checks with no renderer errors or remaining
voices, but still failed its unchanged frame benchmark. Dense animation measured
66.7–83.3 ms median; the old 2.43 baseline also failed its stage frame target.
That performance limitation remains open, and neither report is relabelled green.

Installed `~/Desktop/Luma Keys.app` 2.44.0, exact ASAR
`5cd5bf4b1c8492c28f25f4fc5244dbb5514b0441768be7d6dafed246633b5448`.
All 537 checked source/package inputs and 3,035 bundle entries match; all 109
personal music/settings/progress files were unchanged through installation and reopening. Previous
2.43 app and non-chat backup are retained in `.qa-runs/audio-recovery-2.44/`.
The app visibly reopened with Sunny Day paused, Resume bar 48, Listen/Both/50%,
Ocean and Lang Lang. Test sound and Recover audio are present in the installed
Tools drawer's accessibility tree. First launch was slow; no startup-speed claim.
Evidence: `evidence/audio-recovery-2.44-verification.json`.
The Mac's built-in speaker volume was 6%; left
unchanged. Software signal output was verified, physical audibility and acoustic
piano detection were not. Pending recovery/backend changes are included; see
`docs/RECOVERY_2.44.md` and `docs/AUDIO_RECOVERY_2.44.md`. No new schedule.
