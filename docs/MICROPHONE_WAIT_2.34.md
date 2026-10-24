# Play a real piano in Wait mode

Choose **Connect piano → Start microphone**, then allow microphone access when macOS asks. Luma Keys switches to Wait and starts listening. Play the highlighted key, or play all highlighted chord keys together. A clear fresh match moves the score, falling notes, keyboard and hand guide to the next target. A ringing note does not count as another press.

Start with a short, one-hand exercise, a quiet room and the pedal up. Put the Mac or selected microphone near the piano. The signal meter shows whether sound is arriving. **Stop microphone** releases the input. Leaving Practice, switching to Listen/Perform, hiding the app or disconnecting the microphone stops capture. Pausing or opening a dialog disarms matching; the visible microphone indicator remains on until capture stops.

The app's piano, accompaniment, metronome and companion-game output stay muted during capture. Existing volume settings are preserved. USB / MIDI remains available through the same input dialog and supports the full keyboard and larger chords.

## Companion

Correct and incorrect detected attacks trigger the existing companion reactions. Short, silent cues are spaced out so they do not cover the music continuously. **Pet tip** asks for help with the current target; a stuck target can also trigger a tip. If the local model is ready and chat is idle, it can add a short generated coaching line in the background. The matcher never waits for a model reply; busy, unavailable, timed-out or cancelled requests leave the immediate cues available. Opening chat cancels stale background coaching.

The model receives only bounded piece and note metadata, not microphone audio. Immediate reactions do not depend on model inference. This is an integration with the existing local model, not newly trained weights, and it cannot judge posture, touch or expression from this detector.

## Beta scope

- C3–C6, one note or simple chords of up to three distinct pitches.
- Complete chords are checked as one attack; separately played notes do not accumulate into a chord.
- Octave/twelfth targets, hollow fifth dyads, more than three notes and notes outside the supported range stay pending with guidance to use one hand or MIDI.
- Very quiet/high notes, fast or rolled chords, pedal, room echo, background sounds, tuning differences and uneven chord balance may cause the listener to wait.
- An extra octave can blend with a piano note's natural overtones and falsely match. This lightweight detector cannot certify every extra or missing key. Use MIDI when exact all-key checking matters.

Audio is processed locally in an AudioWorklet and Worker. It is not written to disk or sent to the companion model. Permission must be requested explicitly; saved preferences never turn capture on automatically.

## Verification

The detector fixtures include 111 synthesized single notes, 39 recorded notes at three dynamics (38 recognized; the softest C6 correctly remains uncertain), real recorded triads, wrong pitches/octaves, omissions, extra independent notes, held tones, repeated strikes and 117 resets during decay. All 39 eight-second held recordings emitted no duplicate attacks. See [fixture scope](../tests/fixtures/microphone/README.md) for the exact cases and negative findings.

Initial recorded-note confirmation took about 180–252 ms after the detector's onset timestamp. That excludes microphone, queue and display delay and is not an end-to-end latency promise.

Packaged testing uses a generated WAV through Chromium's fake microphone with an isolated library and muted output. It does not access the Mac's physical microphone. **Actual acoustic piano, room and hardware reliability remains unverified.** Acceptance reports and final installation evidence are saved under `.qa-runs/microphone-practice-20261003` and `evidence/microphone-wait-2.34-verification.json`.

The installed 2.34.0 package passed four native scenarios containing 12 checks: matching/repeats/chords, permission and disconnect recovery, target changes and MIDI fallback, a 500 ms interface stall, stale queued attacks, and a delayed companion response. The companion response in that test was explicitly stubbed; it verifies that inference cannot block advancement or deliver an obsolete tip, not model quality. The existing local model is reused.

109 focused automated checks pass. A broader serial run passed 842 of 847 checks; five recognition process-timeout fixtures subsequently passed in the unchanged isolated 8-test recognition suite. Early native testing exposed a capture-backlog disconnect during interface work; bounded queues, fresh-frame recovery and stale-attack rejection fixed it before the accepted package. Original reports remain saved.

Installed and visually reopened on October 3, 2026. All 3,035 bundle entries match the accepted candidate; all 108 personal files remain unchanged after reopening. The input chooser is open, with microphone capture still off. The previous 2.33.0 app and a fresh personal backup remain in the QA folder. An existing cold-launch/inspection delay remains: the first app inspection timed out, then the restored app opened successfully without a force quit.
