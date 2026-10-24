# Offline grand piano recordings

Luma Keys includes **Salamander Grand Piano V3**, recorded by **Alexander Holm** from a **Yamaha C5** grand piano. This bank adds six independently recorded touch levels in place of the older single-layer MP3 bank. It is not a Steinway recording. A comparable Steinway source with explicit permission to redistribute its sample files was not verified during this acquisition.

## Source and permission

- [Upstream sample distribution](https://github.com/sfzinstruments/SalamanderGrandPiano), pinned to revision `3382bf9496bba2486f5ab0de55a264d1dfc38404`.
- [Original archive](https://archive.org/details/SalamanderGrandPianoV3), linked by the upstream repository.
- [Upstream licence](https://github.com/sfzinstruments/SalamanderGrandPiano/blob/3382bf9496bba2486f5ab0de55a264d1dfc38404/LICENSE): **Creative Commons Attribution 3.0 Unported**, also [published by Creative Commons](https://creativecommons.org/licenses/by/3.0/).
- FLAC distribution and SFZ v2 remapping: **kinwie**. Optional retuning: **Markus Fiedler**. Attack-offset metadata: **Jeff Learman**.

The licence permits sharing and adaptation, including commercial redistribution, with appropriate attribution and a licence link. The original attribution, complete licence, and description of Luma Keys' selection/renaming are bundled in `public/piano-samples/ATTRIBUTION.md` and `LICENSE.txt`.

Only instrument recordings are included. No songs, song recordings, commercial sample-library content, account access, or purchases were involved.

## Included bank

| Property | Included |
| --- | --- |
| Original velocity layers retained | 1, 4, 7, 10, 13, 16, out of the source's 16 layers |
| Recorded pitches per layer | 30, in minor thirds from MIDI 21/A0 to MIDI 108/C8 |
| Total files | 180 |
| Recording format | Stereo, 48,000 Hz, 24-bit, lossless FLAC |
| Compressed audio bytes | 270,686,231 (258.15 MiB) |
| Natural recording lengths | 2.626–25.863 seconds |
| Complete bank decoded as Float32 stereo at 48 kHz | 943,056,232 bytes (899.37 MiB) |
| Layer 10 alone, decoded | 162,083,552 bytes (154.57 MiB) |

Audio bytes are unchanged from the pinned upstream release. There is no gain normalization, trimming, downmixing, resampling, or lossy recompression. Files were renamed to `v<layer>/<midi>.flac`. The intermediary piano keys use pitch shifting during playback; these are 30 recorded pitches per layer, not 88 individually sampled keys.

The six layers preserve a broad range of attacks and timbres, including the softest and hardest source layers. They reduce packaged size compared with all 16 layers. This bank does not include the separate hammer, pedal-noise, or string-release recordings from the source; the engine supplies its own note-off and room processing.

## Manifest and playback integration

`public/piano-samples/manifest.json` contains version, name, source, licence, and a `samples` array. Every sample has:

- `id`, `midi`, `layer`, `url`, `sha256`, and `bytes`.
- `duration`, `frames`, `channels`, `sampleRate`, `bitsPerSample`, and `decodedBytes`.
- `velocity` in 0–1 and the original `velocityLow`/`velocityHigh` MIDI range.
- `gain:1`, preserving the source recording level.
- `attackOffset` in seconds and `attackOffsetFrames`: the upstream optional faster-touch start offset, not a modification of the file.
- `naturalTuneCents:0` and optional upstream `retunedTuneCents`. The files are the natural recordings; retuning is an explicit engine decision.
- The original `sourceUrl`, `sourcePath`, and Git blob hash.

Velocity centres use the source SFZ's actual ranges, which are not evenly spaced:

| Layer | Original MIDI range | Manifest velocity |
| --- | --- | --- |
| 1 | 1–26 | 0.10629921 |
| 4 | 37–43 | 0.31496063 |
| 7 | 51–56 | 0.42125984 |
| 10 | 73–80 | 0.60236220 |
| 13 | 97–104 | 0.79133858 |
| 16 | 121–127 | 0.97637795 |

The engine must select or interpolate between these sparse layers and handle the gaps. The manifest does not prescribe a volume curve. The source SFZ uses `set_hdcc$VELTRACK=0.73`, `amp_veltrack_oncc$VELTRACK=-100`, and curve 2; the upstream README describes this as 73% velocity tracking. This is source-sampler control metadata, not a direct gain multiplier for Web Audio.

Recorded loudness already changes substantially with the layer. For C4, the first two seconds have these measured RMS levels: **−36.90, −29.72, −26.81, −23.88, −21.36, −19.94 dBFS**, from layer 1 to 16. Applying a full velocity-squared envelope again can over-attenuate soft notes. Final loudness, interpolation, release, pedal, polyphony and mix headroom require engine-level audio checks.

Do not eagerly decode all 180 samples at startup. Use a bounded cache and warm notes needed for the current passage. The byte estimates assume 48 kHz Float32 stereo; an AudioContext with another sample rate can produce a different decoded allocation. The bank is entirely local after packaging and has no runtime download requirement.

## Acquisition and validation

Audit files are under `.qa-runs/concert-grand-2.12`:

- `upstream-tree.json`, source README, full licence, SFZ and its small mapping files preserve provenance.
- `downloads.json` and `SHA256SUMS` record all 180 original-file identities. Every downloaded file matched the upstream Git blob hash and declared size.
- `bank-summary.json` gives memory totals by layer and durations/memory by pitch.
- `decode-signal-audit.json` records a complete ffmpeg decode and signal scan of every file: **180/180 decoded, nonsilent, finite and within Float32 −1…1 bounds**. All are stereo 48 kHz/24-bit according to FLAC metadata; ffprobe independently checked a representative C4 file.
- Maximum individual-sample peak: **−1.475 dBFS**; quietest peak: **−41.531 dBFS**. This does not imply that a polyphonic mix cannot clip.
- The first audit used integer-valued ffmpeg extrema against float bounds, causing an invalid test assertion despite successful decoding. That result is preserved in `decode-signal-audit-integer-units.json`; the corrected audit explicitly converts the analysis stream to Float32 before measuring extrema. Source recordings were not modified.

These checks validate file provenance, format, integrity and signal presence. They do not claim subjective listening quality or complete application playback correctness. Browser decoding, instrument scheduling, pedal/release behaviour and the final mix are checked separately by the app's audio QA.

## Playback correction in 2.12

Independent per-channel spectrum checks found every original C8 recording near4433–4434Hz, about99cents above C8. Luma Keys applies **−99cents to source MIDI108**, including when that recording supplies B7 through transposition. Source FLAC files and the original optional `retunedTuneCents:-38` metadata stay unchanged; the corrections are not added together. Other registers retain their natural recorded stretch. Evidence: `high-pitch-source-analysis.json` and the real Chromium waveform report in the 2.12 QA folder.

The engine selects one nearest touch recording per attack, preserving stereo phase instead of mixing unrelated recordings. Original attack offsets reduce leading silence. A512MiB decoded-buffer LRU cache retains the30core samples and warms the next passage; this is a buffer-cache budget, not a claim about total app RAM. At most3 recordings load/decode concurrently and96 voices sound at once. A cold, uncommon live note can use the nearest cached touch immediately while its exact touch recording warms for subsequent strikes; scheduled playback prewarms its passage.
