# Luma Keys documentation

Start with the [project README](../README.md) for what the app does and how to run it.

## Guides and design notes

- [Architecture](ARCHITECTURE.md): the processes and their boundaries, good files to start reading, and the repository layout.
- [User guide](USER_GUIDE.md): every screen and control, with a summary of recent releases.
- [Hand motion design](HAND_MOTION_DESIGN.md): how the hands move between positions, with the timing model, guards, test plan and walkthroughs of real passages.
- [Browser QA](BROWSER_QA.md): how to build the app and run the five sight-reading stories against an isolated library.
- [Piano samples](PIANO_SAMPLES.md): the sampled Yamaha C5 grand, its source and licence, and the playback corrections.
- [Research](RESEARCH.md): why the app is local, how a PDF becomes a lesson, and the sources behind the notation, rhythm and input decisions.
- [Sight reader](SIGHT_READER.md): the reading workspace, from the numbered score to generated exercises.
- [Accompaniment](ACCOMPANIMENT.md): optional backing for a piece, how to set it up, and its fidelity limits.
- [Requested songs](REQUESTED_SONGS.md): pieces that were asked for and the scores still needed.
- [Third-party notices](THIRD_PARTY_NOTICES.md): attribution and licence texts for bundled samples, models, fonts and libraries.
- [Engine checksums](ENGINE_CHECKSUMS.txt): SHA-256 checksums for the Audiveris download and the Tesseract English data.

The folders hold supporting files: [design/](design) has the pianist anatomy study used as a reference for the 3-D hands, [screenshots/](screenshots) has the images in the README, and [sources/](sources) has the LilyPond source of the built-in Für Elise lesson.

## Release notes

One note per feature release, newest first. The file names keep the version number.

- 2.46, [hand refinement](releases/HAND_REFINEMENT_2.46.md): the skin keeps its prepared variation, and finger shafts read apart from the joints.
- 2.45, [hand refinement](releases/HAND_REFINEMENT_2.45.md): a resting thumb that opens the hand, more defined knuckles and cleaner nails.
- 2.44, [recovery](releases/RECOVERY_2.44.md): restore removed pieces, earlier versions and earlier settings from inside the app.
- 2.44, [sound checks](releases/AUDIO_RECOVERY_2.44.md): Test sound and Recover audio in Practice tools.
- 2.43, [fortify](releases/FORTIFY_2.43.md): a failing part of the window no longer blanks the app, and the packaged-app tests run again.
- 2.42, [hand motion](releases/HAND_MOTION_2.42.md): thumbs reach their keys in wide stretches, and free fingers settle instead of trembling.
- 2.41, [solid storage](releases/SOLID_STORAGE_2.41.md): atomic, flushed saves, recovery copies and a bounded diagnostics log.
- 2.40, [trouble spots](releases/TROUBLE_SPOTS_2.40.md): bars that keep slipping are remembered, marked on the piece map and drilled.
- 2.38, [hand anatomy and posing](releases/HAND_GUIDE_2.38.md): clearer knuckles and tendons, a lower arch for melodies and an open free thumb.
- 2.37, [hand guidance](releases/HAND_GUIDE_2.37.md): clearer finger badges and next-note cues around the moving hands.
- 2.36, [hand guide](releases/HAND_GUIDE_2.36.md): the rigged MRTK hand mesh with a more compact playing posture.
- 2.35, [temporary chat](releases/TEMPORARY_CHAT_2.35.md): the companion conversation lives only in app memory.
- 2.34, [microphone Wait](releases/MICROPHONE_WAIT_2.34.md): play an acoustic piano and the score advances when it hears the right keys.
- 2.33, [exercises](releases/EXERCISES_2.33.md): a compact shelf of twelve graded lessons in three groups.
- 2.32, [practice](releases/PRACTICE_FLOW_2.32.md): falling notes, keys and hands share one audible clock, and plans are prepared in a worker.
- 2.31, [progress](releases/PROGRESS_2.31.md): a compact daily summary with a goal ring and one activity view at a time.
- 2.30, [natural pianist hands](releases/HAND_REDESIGN_2.30.md): a redesign of the 2.29 hands, shipped inside 2.31.
- 2.29, [pianist hands](releases/HAND_ART_2.29.md): a generated hand study used to refine the live hands.
- 2.28, [chat speed](releases/CHAT_SPEED_2.28.md): the local model stays loaded between messages.
- 2.27, [colours](releases/COLOURS_2.27.md): a palette picker beside the companion, applied across the app.
- 2.26, [practice](releases/PRACTICE_ART_2.26.md): a softer finish on the hands, cover colours in the piano frame and five-second jumps.
- 2.25, [Library flow](releases/LIBRARY_FLOW_2.25.md): a compact header, a Continue card, clearable search and filters.
- 2.23, [expressive playback](releases/EXPRESSIVE_COMPANION_2.23.md): a playback plan for each piece and a companion that comes along.
- 2.21.1, [plain copy](releases/PLAIN_COPY_2.21.1.md): decorative slogans removed from the interface.
- 2.21, [companion picker](releases/COMPANION_PICKER_2.21.md): six compact companion cards with colour previews.
- 2.20, [companion conversation](releases/COMPANION_INTELLIGENCE_2.20.md): a local language model run by llama.cpp, with no account or cloud service.
- 2.19, [clean audio](releases/CLEAN_AUDIO_2.19.md): no harsh peaks on loud chords and no false attacks when resuming under the pedal.
- 2.18, [practice workspace](releases/PRACTICE_CLARITY_2.18.md): the score and the piano share the main workspace.
- 2.17, [mini companion](releases/COMPANION_MINI_2.17.md): the conversation moves to a compact side panel.
- 2.16, [cartoon covers](releases/CARTOON_COVERS_2.16.md): fourteen original cover illustrations.
- 2.15, [song covers](releases/SONG_ART_2.15.md): a distinct illustration for each work in the Library.
- 2.14, [natural hands](releases/NATURAL_HANDS_2.14.md): a cupped playing shape, an articulated thumb and curved fingers.
- 2.13, [illustrated Library](releases/ILLUSTRATED_LIBRARY_2.13.md): the Library is arranged around returning to a piece.
- 2.13, [Library art](releases/LIBRARY_ART_2.13.md): how the Library illustrations were made, with sizes and checksums.
- 2.12, [concert piano](releases/CONCERT_PIANO_2.12.md): the sampled Yamaha C5 grand with written articulation and phrasing.
- 2.10, [companion lessons](releases/COMPANION_COACH_2.10.md): the companion explains the score in short passages.

## Development history

[history/](history) keeps review notes, a feasibility study, studio plans and the overnight run instructions from development. They were written during development with AI coding assistants and describe the code as it was then. Current behaviour is in the [user guide](USER_GUIDE.md) and the design notes above.
