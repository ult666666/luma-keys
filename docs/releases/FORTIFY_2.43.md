# Fortify · 2.43

The user asked to "continue to fortify everything". This pass hardens the places where the app could still fail as a whole, then restores the packaged-app regression net that had drifted since the 2.39 interface, so the next change is checked against the app as it is today.

## A part that fails no longer takes the app down

Before 2.43 an exception while drawing any part of the interface (a WebGL problem in the 3-D hands, an engraving error, an odd field in a score) unmounted the whole window and left it blank. Each major part now has its own boundary (`src/ErrorBoundary.jsx`): the keyboard and hands, the number score, the sheet music, the original PDF, the Exercises, Library and Progress screens, the companion chat, the accompaniment panel and the roaming companion. A part that fails shows a short notice ("The keyboard and hands hit a problem. Your music, settings and practice are safe.") with **Try again**, and everything else keeps working. Opening another piece is a fresh start for the score-bound parts. The roaming companion simply disappears if it fails. A fault outside every part shows a full-window notice with **Reload Luma Keys** instead of a blank window. Each fault goes to the diagnostics log as a `renderer-error` with its part and message, never music or chat.

## Settings written by a newer version survive an older one

`preferences.json` holds the practice journal. Before 2.43, every settings write replaced the file with exactly the fields this version knows, so opening the Library with an older copy of the app (or going back to one) silently dropped anything a newer version had added. The server now carries forward fields it does not recognise, at the top level, in `stats`, `reading`, the journal and each journal day and piece that is still present, on every write (`mergeUnknownPreferences` in `src/preferences.mjs`). Fields it does know still change and delete as before.

## Opening the app no longer rewrites the settings file

Before 2.43 every launch rewrote `preferences.json` even when nothing changed (STATUS recorded it at the 2.40 install): hydration recorded the companion's last-seen day, and a legacy colour flag was derived differently on load than on save, so the first comparison always differed. Launching now writes nothing until something changes; the companion's bookkeeping day alone never triggers a write. Valid, partly damaged, null and truncated settings files all stay byte-for-byte as they were through launch and reload (checked in the packaged app).

## A Library folder that cannot be opened

If `Desktop / Luma Keys / Library` cannot be created or read (macOS has not allowed access to the Desktop folder, a file sits where the folder should be, or the disk is read-only), the app used to show a raw stack trace and quit. It now explains the cause in plain words, names the folder and the one fix (System Settings › Privacy & Security › Files and Folders; move the file; make the disk writable), says nothing has been changed or deleted, and offers **Try Again** and **Quit** (`library-access.cjs`). Try Again starts the app normally once the cause is gone.

A Library that can be read but not written now opens too. Before, a read-only Library without an `imports` or `accompaniment` folder stopped startup: the imports folder is now optional, PDF recognition treats a missing one as no saved imports, and the accompaniment folder is created only when a track is added (Multer no longer creates it when configured). The existing notice says the Library cannot be written; saving into it fails with an error the page shows, and nothing is written.

## The regression net, restored

The 2.39 interface (four screens, drawers for volume, repeat range and review, a docked companion, temporary chat) had left most packaged-app stories failing on their first or second step since 2.2–2.38. They were repaired to follow the current interface, and where a behaviour was deliberately redesigned the story now asserts the new behaviour with a comment saying since when. Shared helpers: `scripts/settings-ui.mjs` (Settings dialog, Colours group, companion salon) beside the existing drawer, MIDI and Library helpers; `companionChat` in `scripts/maestro-checks.mjs` for the docked chat.

Redesigns the stories now check rather than fight:

- The app opens on the Practice screen; lessons are Library starter pieces; meter and tips are in Settings; colours are a reading choice and older files open neutral.
- White keys are as large as the 3-D hands' proportions allow (a key is never wider than its length divided by 4.5); at 1280×800 Twinkle's keys are about 28 px, all in view.
- The score comes first above a shorter piano, so the runway is short at 1280×800 and shows a beat and a half ahead in the number view, about five beats of Twinkle in Falling notes.
- A press moves the key down at once (no animation, for smooth dense playback); each attack mounts a fresh splash over its key, hidden when the 3-D hands show the landing; a wrong note brightens the keys to play once instead of raising a runway spark; the keyboard focus ring is drawn on the key's face.
- A short early stop in Play in time is a pause with a notice, not a report card.
- Playback is expressive by default; stories that measure exact written lengths choose "As written".
- The companion chat is a docked panel, temporary by design, minimised by Escape.
- Held keys are checked by the 3-D contact point: on the key, within half a millimetre in 3-D, and not drifting.

Three scripts are one-off acceptance suites pinned to the versions they accepted and are not part of the regression net: `native-conversation-model-qa` (2.9, real chat model), `native-coach-qa` (2.10, a dated run folder and saved chat history, which 2.35 made temporary) and `native-library-illustrated-qa` (2.13).

## Limits

The boundaries contain rendering faults; a fault inside an event handler or the audio clock is logged by the existing page fault reporting but has no notice. The boundaries were exercised in the development build by injecting faults (keyboard and Library contained, Try again restored, logged); production builds have no injection hook. The Library-folder explanation was checked in the packaged app with a file in the folder's place; the macOS privacy denial itself was not reproduced. Measurements come from this Mac.
