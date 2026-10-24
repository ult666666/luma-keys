# Grand piano and phrasing · 2.12

The primary instrument is now Alexander Holm’s sampled **Yamaha C5**: six recorded touch levels, 180 unchanged lossless stereo recordings. It is not a Steinway sample set. Notes between recorded pitches are transposed; the original full decay tails remain available. Source and licence: [PIANO_SAMPLES.md](PIANO_SAMPLES.md).

## In the app

Open **Reading settings → Sound**. **Concert** is the default: it keeps the score’s tempo and notes, gives inner chord voices a little less weight, and shapes explicitly marked crescendos conservatively. **Written** retains the score’s original dynamics. Both apply unambiguous staccato, staccatissimo and tenuto markings and use the new sampled grand. Your own keyboard or MIDI playing follows your touch, independently of this setting.

**Dry**, **Room** and **Hall** control the space around the piano. Existing room and volume choices are preserved. Try Hall when listening to a full movement, and Dry when checking short notes or rhythm.

Appassionata’s existing Presto change, quiet passages, forceful chords and sforzando accents remain. The ending contains short final chord attacks followed by rests; their key holds stay short while the sound decays naturally. Concert shapes the written crescendo at bars 558–561 as an interpretation. It does not add notes, random timing or a new tempo curve. The underlying saved score is unchanged.

## Playback details

The app warms upcoming touch recordings before playback and keeps a 512 MiB decoded-buffer cache, with at most three concurrent loads and 96 voices. This budget covers cached sample buffers, not the app’s entire memory usage. An uncommon cold live note responds immediately with a nearby cached touch and warms its exact touch for subsequent strikes.

Pause, seek, switching pieces and cancelled starts still stop scheduled notes. Reaching the end of a piece allows the last released notes to ring. Resuming inside a written pedal span now restores notes still sustained by the pedal, even if their written key hold has already ended. Finger/MIDI ownership remains separate from automatic playback.

## Verification

The 2.12 QA folder contains source checksums, sample decoding, waveform analysis, source-tuning evidence, expression audits, unit results and native application tests. The actual Appassionata excerpt renders 151 notes from bars 558–569 at the score’s 180 BPM. Its after render is louder than the previous instrument at the same volume setting; these are not level-matched subjective listening comparisons. Signal measurements alone do not prove human-performance realism.

An audition file is saved at `Assets/Audio Previews/Appassionata III - grand piano coda.wav`.
