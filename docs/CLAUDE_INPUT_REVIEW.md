# Claude follow-up: piano input

September 25, 2026. The user requested a Claude enhancement pass. Claude reviewed the initial 1.0.8 input candidate through the installed CLI with all tools and MCP connections disabled. It did not edit source or execute tests. Raw output: `evidence/claude-input-review-1.0.8.json`.

No blocking findings in `InputNotes`, `bindMIDIInputs`, or the async owner-invalidation path. The baseline regressions look correctly addressed. These five issues are still worth fixing before 1.0.8:

**1. Medium: listen-mode loop wrap desyncs the pedal and cuts held input notes**
- **Location:** `App` rAF `update()`, `if (s.loop) { piano.stop(); ... }`.
- **Problem:** `piano.stop()` sets `piano.pedal = false` and kills every voice. It leaves `pedalInputs`, the `sustain` state and `inputNotes` untouched.
- **Result:** On every loop wrap while the user holds the pedal, audio stops sustaining but the label still says "sustain". Sustain stays off until the pedal is lifted and pressed again. Keys held through the wrap go silent but stay shown as pressed.
- **Fix:** At the wrap, stop only scheduled playback voices, not all voices. Or call `piano.sustain(pedalInputs.current.size > 0)` afterwards and skip voices owned by `inputNotes`.

**2. Medium: `start()` uses stale settings after the await**
- **Location:** `start()`, everything after `await piano.init()`.
- **Problem:** `mode`, `countIn`, `notes`, `phraseGroups`, `loop`, `loopA` and `loopB` come from the click-time closure. Only `modal` is re-read, via `handlers.current`. The await can last seconds on first sample load.
- **Result:** Suppose the user switches Listen → Wait during loading, and changing mode does not call `stop()`. Then `from` becomes `-countInLength`. The rAF loop now sees `mode === "wait"`, so nothing advances, and no `chordGroup` sits at a negative beat. Wait mode is stuck. A hand change during loading gives `t.index` from the wrong notes array, which skips notes.
- **Fix:** After the request check, read everything from `state.current`, or have those setters cancel a pending `playRequest`.

**3. Medium: macOS drops letter keyups while Cmd is held, so computer notes stick**
- **Location:** Global `down`/`up` handlers in the keyboard `useEffect`.
- **Problem:** On macOS (this is the darwin desktop build), releasing a letter while Meta is held delivers no `keyup`. Example: hold A, press Cmd, release A, release Cmd. The `computer:KeyA` owner is never released and the note sounds until window blur. The `e.metaKey` early return only guards keydown.
- **Fix:** In `up`, on `e.key === "Meta"`, call `releaseInputSources("computer:")` and clear `computerNotes`.

**4. Medium: a focused range slider silently disables computer notes**
- **Location:** Global `down` handler, `/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)`.
- **Problem:** After dragging "Song position" or "Piano volume", focus stays on an `<input type="range">`. Every mapped letter is then ignored until the user clicks elsewhere. This is the same user-visible symptom as the 1.0.7 "A after clicking Play" bug, reached by seeking before practice.
- **Fix:** Only suppress for text-entry inputs, e.g. exclude `type` values `range`, `checkbox`, `radio` and `button`. Also check `e.target.isContentEditable`.

**5. Low: completing the piece in wait mode cuts the final note**
- **Location:** `noteOn`, wait-mode `else { stop(); ... }` branch.
- **Problem:** `stop()` runs right after `entry.voice = piano.play(...)`. It calls `piano.stop()`, which fades the last correct note out in about 80 ms, and it clears `pressed` while the key is still held.
- **Fix:** For this path, end the transport without `piano.stop()` and without clearing input notes. Let `noteOff` release the note normally.

**Minor, non-blocking**
- The keyboard-effect cleanup calls `midiRef.current?.dispose()` but never nulls `midiRef.current`. After an HMR or dev remount, `connectMIDI` then calls `refresh()` on a disposed binding, which is a no-op, so MIDI stays dead until reload.
- `bindMIDIInputs` ignores CC 123/120 (All Notes Off / All Sound Off). A controller panic or octave-shift that sends them leaves held owners stuck until blur. You could map them to `handlers.disconnect(channel)`.

## Primary-agent follow-up

Codex separated scheduled playback cleanup from live voices: loop boundaries preserve held inputs and the shared sustain state, and completing wait mode leaves the final note sounding until release. Computer notes now work from range sliders; Command-key transitions clear only computer owners even when a letter key-up is absent. Async Play reads current transport settings after audio becomes ready. Mode and hand changes already cancelled startup through Stop; the new test verifies this and also checks a count-in toggle during loading. MIDI cleanup clears the binding reference for a development remount.

These corrections came after Claude's review; Claude did not review the final code. The shared browser/native harness measures source-stop calls, delayed audio cancellation, loop-held notes, final-note release, mixed owners and modifier transitions. MIDI devices and missing-keyup events are simulated; physical hardware has not been tested. MIDI controllers other than note-on/off and CC64 remain outside the implemented input subset, including CC120/123 panic messages. Local Pause/Start over clears the app's voices. Final validation is recorded in STATUS.md.
