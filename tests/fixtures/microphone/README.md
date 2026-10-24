# Microphone DSP fixture scope

These are local PCM tests, **not an acoustic-microphone accuracy study**. They do
not exercise a physical piano, room, microphone, OS capture path, or UI latency.
No recorded personal audio or trained weights are stored here.

Run `node --test tests/microphone-detector.test.mjs` from the project root. The
synthetic checks need only Node. The real piano checks additionally need `ffmpeg`
on PATH; they explicitly skip when it is unavailable. Production detection has
no ffmpeg dependency.

`pcm.mjs` synthesizes deterministic harmonic tones, noise, and silence, or decodes
the existing `public/piano-samples/v{layer}/{midi}.flac` recordings. These are
Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0; see
`docs/THIRD_PARTY_NOTICES.md` and the bank's original attribution. Nearest samples
are transposed for intervening keys in the same manner as the app's playback
rate. Multiple individually decoded recordings are mixed to create chord and
re-strike cases. Peak normalization simulates a usable microphone input level;
it does not model a room. The sample library and the synthesized timbres are
independent of the detector: no sample-derived templates are in production DSP.

## Measured October 3, 2026

The detector's 14 test groups passed locally, with none skipped:

- 111 single-note synthetic cases: every chromatic pitch C3–C6, using a sine,
  ordinary decaying harmonics, and an odd-harmonic-heavy timbre. All 111 produced
  the exact expected pitch once.
- 39 real recording cases: 13 pitches C3–C6 across velocity layers 1, 10, and 16.
  38 produced the exact pitch once. The quietest C6 recording produced no event:
  its pitched attack has faded into low-frequency mechanical sound before stable
  confirmation. The regression requires it to wait instead of guessing.
- Seven three-second recorded held notes produced exactly one event each. The
  same seven notes, mixed with a new strike at 600 ms while their tails continue,
  produced exactly two events each. One synthetic C4 held/re-strike pair also
  passed. This is not proof that arbitrarily soft or rapid re-strikes work.
- Three recorded major triads (C3/E3/G3, C4/E4/G4, G4/B4/D5) matched atomically.
  Nine recorded omission/wrong-key/extra-independent-key cases produced zero
  matching events. Four synthetic complete chords and four such negative cases
  passed too. The detector does not accumulate separate attacks into a chord.
- Eight isolated wrong-key/wrong-octave/register cases did not match C4. A strong
  second harmonic and a missing-fundamental negative did not become C4 hits.
- 117 recorded reset-during-decay cases (39 recordings × reset at 100, 400,
  or 1000 ms) produced no event after reset. Reset retains acoustic level history;
  discarding that history was found to falsely rearm beating piano strings.
- Quiet, broadband noise, a click, and invalid PCM produced no events. PCM
  chunking at 128 or 733 samples gave identical results at 44.1, 48, and 96 kHz.
  The test set also covers stale pending attacks after target changes and IDs
  remaining unique across reset.

The initial middle-velocity recorded pitch sweep confirmed events approximately
180–252 ms after the detector's onset timestamp. This is DSP confirmation time,
not physical attack-to-screen latency; capture, queues, and rendering add delay.

## Supported targets and limits

Expected targets are C3–C6 and at most three distinct pitches. Octaves/twelfths
and hollow fifth dyads are explicitly unsupported: shared overtones make this
small harmonic analyzer ambiguous. Dense or pedalled playing, rolling chords,
large tuning offsets, background speech/music, reverberation, very unequal chord
levels, rapid repeats, and soft attacks need physical evaluation. Confidence is a
signal-quality heuristic, not a calibrated likelihood of a correct performance.

A particularly important **known false-positive limit** remains: an unexpected
upper octave (or other coincident harmonic) added to a played note can be hidden
inside that note's natural overtones. Exploratory equal-level C4+C5 mixtures
matched a C4 target for both recorded and synthesized timbres. Gating octave
*targets* prevents a missing octave from completing that target; it cannot certify
that no unexpected octave was added to an otherwise supported target. The same
identifiability problem appears with missing bass fundamentals in mixtures.
The product must not describe this DSP as strict rejection of every extra key,
full piano transcription, or established real-world acoustic reliability.

Repeated synthesized tones can also interfere destructively when combined with
an exactly phase-coherent tail. In an exploratory 13-note repeat sweep, four such
cases missed the second attack; there were no extra attacks. The recorded repeat
fixtures above all passed. Sustain/pedal and softly played re-strikes should be
expected to produce conservative misses.
