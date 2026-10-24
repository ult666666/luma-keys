# Clean audio · 2.19

This release targets two reproduced software problems: harsh peaks on loud chords, and false attacks when resuming inside a pedal-held passage.

## Playback

Piano, generated accompaniment and imported recordings meet at one protected output. Their individual volume controls remain independent. The final dynamics stage leaves space for the combined sound before a high emergency ceiling. The previous separate waveshapers could distort each part and still overload when the parts were added together.

The original six-layer stereo grand recordings, their tuning, score dynamics and selected room remain. This is an output and playback correction, not a replacement instrument or noise reduction applied to the recordings.

## Resume and transport

Resumed held notes use the position they would have reached in their recorded decay. They no longer all restart from the hammer strike. A short fade joins that waveform; samples that have already ended stay silent. Written new notes keep their scheduled time, with a half-millisecond fade at the very start to prevent a nonzero sample boundary from clicking. Tempo changes and practice speed determine the elapsed sample position.

Stopping an active metronome click fades its current level over four milliseconds. Future clicks are canceled before they start. Pause, seek, loop and speed changes retain their independent input ownership and cancellation behavior.

## Evidence and limits

The original engine's actual Appassionata coda at full piano volume reached 1.182 before its waveshaper; a bounded final signal hid the resulting distortion. A dense repeated-chord stress fixture with accompaniment reached 1.419 after the separately limited outputs were summed. Another read-only score audit found 48 pedal-held continuations that previously restarted together at one Appassionata resume point.

Final rendered-waveform, native package, preservation and installation results are recorded in `evidence/clean-audio-2.19-verification.json`. These checks measure software-generated signals. They cannot rule out distortion or interference in a particular speaker, headphone, Bluetooth connection or audio device.

Implementation references: [Web Audio API specification](https://webaudio.github.io/web-audio-api/) and [AudioParam automation](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime).

## Release status

The candidate passed 410 unit/API tests, six native acceptance groups and 36 matched waveform renders. The Mac was locked at delivery, so version2.19 is staged but not yet installed over the running Desktop app. Installation should follow the normal save-and-quit flow after unlock.
