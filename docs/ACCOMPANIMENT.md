# Accompaniment

Open **伴奏** in the Practice controls. Opening the panel pauses practice. Each saved score or starter piece has its own accompaniment setting, initially off. Different imports or arrangements keep separate settings. Save a generated exercise with **Keep in library** before adding accompaniment.

## Backing from the score

Choose **From the score**, select a style, and turn on **Enable accompaniment**.

| Style | What it plays |
| --- | --- |
| Match the piece | Acoustic backing for recognised pop titles or composer metadata, including Sunny Day and Tornado; written piano for other scores. |
| Acoustic pop | The written supporting part on plucked guitar, a quieter bass line drawn from its pitches, and a generated drum pattern following the meter and written activity. Bass notes may sound one octave lower. |
| Piano duet | The written supporting hand on piano, played softly. |
| Soft strings | A quieter selection of the supporting hand's notes, with fewer attacks and at most four held pitches. Short, dense passages may be simplified or have no string layer. |

Practising the right hand uses the left hand as the source; practising the left uses the right. With both hands selected, the left hand supplies the backing. In Listen & follow with both hands selected, the piano guide omits only notes that the backing actually plays, so those notes are not doubled. Notes left out of the orchestration stay on piano; for example, Soft strings can sustain selected notes while the piano keeps a faster left-hand figure. The existing **Play the other hand softly** guide is replaced while accompaniment is enabled.

Pitched backing comes from the selected score's notes. The app does not fill in a chord progression from its key signature. Written rests remain silent, held notes can continue across bars, and the accompaniment follows the score's bar lengths and tempo changes. Percussion is a generated practice pattern, not a transcription of a recording's drums.

Acoustic pop uses locally bundled nylon-guitar and fingered-bass samples, so it works offline. Sample credits and the CC BY 3.0 licence are included in [the sample bank](../public/backing-samples/README.md).

A melody-only score has no separate written harmony to arrange. Choose **Acoustic pop** explicitly for a quiet beat; Piano duet and Soft strings remain silent when their source hand has no notes. The panel explains this rather than supplying guessed chords.

## Use an audio recording

For a particular version's instrumentation, use a matching instrumental or backing recording.

1. Select **Audio recording**, then **Choose audio**. Accepted types are MP3, WAV, M4A, OGG and FLAC, up to 100 MB and four hours. The file is copied into this app's local Library.
2. Use the preview player to locate the start of the score in the recording. Previewing does not start the piano transport.
3. Set **Recording tempo** to the recording's quarter-note BPM. Its initial value comes from the score; check it against the recording. Tempo is not detected automatically.
4. Set **Bar 1 starts in the audio at** to that position in seconds. This is the beginning of the app's first bar, including any written opening rest or pickup, rather than necessarily the first loud note.
5. Enable accompaniment, close the panel, and press Play. Compare a short passage near the start and another later in the piece. Adjust tempo if alignment drifts; adjust the offset if the same timing gap persists.

The audio must follow the same arrangement and bar order as the score. A repeated chorus, extra introduction, different ending or live pause can put it out of alignment. This version uses one recording BPM and one start offset; it does not analyse beats, separate vocals or instruments, or follow rubato in a recording. A file with tempo changes may need external preparation or a different backing track.

Practice speed changes use pitch-preserving media playback. The combined score tempo, recording tempo and practice speed must keep the recording's playback rate between 25% and 400%; the app reports unsupported combinations. Timing uses a media player and can have decoder or output-device jitter. It is not a sample-accurate multitrack editor.

## Playback and volume

- Accompaniment runs in **Listen & follow** and **Play in time**. It stays paused in **Wait for me**, where the cursor may wait indefinitely for an input note.
- Pause, seeking, changing pieces and opening a practice dialog stop accompaniment. A repeated passage returns the backing to the same passage start. Press Play to continue.
- **Accompaniment volume** is separate from the piano volume. Turning down the piano does not mute the backing.
- Imported audio stays as recorded: no key transposition, vocal removal or microphone input is involved.
- **Replace audio** links another local file. **Unlink this audio** removes the arrangement's link; it does not delete the copied audio file from the Library.

## Arrangement fidelity

Backing from the score preserves the selected arrangement's pitches and rhythm; orchestration can change their tone and density. It is not the original studio backing track. The Sunny Day songbook, chord and concert versions have different textures and, in the concert version, different form, so choose a recording that matches the version being practised.

The saved Tornado arrangement's description notes that its tune was written from memory and was not checked note by note against the recording. Generated backing inherits those written notes. Review or correct the score when a passage differs from the version you intend to learn.

## Local files

Imported audio and its metadata are stored in `Library/accompaniment/`. Per-arrangement style, volume, enable state and audio alignment are stored under the reading preferences in `Library/preferences.json`. Back up the whole Library to retain the audio together with its settings. Original files selected for import are not modified.
