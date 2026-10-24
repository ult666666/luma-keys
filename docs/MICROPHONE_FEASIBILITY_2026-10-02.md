# Implementation update — October 3, 2026

The research below preceded implementation. Local microphone Wait is now implemented as a conservative beta; current setup, supported notes, known octave ambiguity and validation limits are in [Microphone Wait 2.34](MICROPHONE_WAIT_2.34.md). No physical acoustic-piano validation is claimed.

---

# Playing the correct key to advance Luma Keys

Research and source inspection, October 2, 2026. No microphone feature was implemented or tested during this investigation.

Automatic advancement is practical. Digital-piano MIDI provides explicit key events; acoustic-piano microphone input requires pitch and attack detection. For microphone input, beginner single-note practice is the strongest first release. Dense, fast, pedalled piano needs substantially more validation.

## What exists in the app

`src/midi-input.mjs` receives MIDI note-on, note-off and sustain messages. `src/App.jsx`'s `noteOn` function compares the actual MIDI pitch against the current practice group in Wait mode. Correct pitches enter a matched set. Once every required pitch has been matched, the position advances to the next group, loops when appropriate, or stops at the end. A wrong pitch produces miss feedback. Chord pitches can currently be collected sequentially; this does not enforce simultaneous performance.

`src/input-notes.mjs` tracks held notes and their input owners. A sustained note does not repeatedly create new presses. This is valuable for repeated-note exercises, but acoustic re-attacks under sustain must be detected independently of whether the old sound has stopped.

The current desktop permission handler permits MIDI only. Help text explicitly says the app does not listen through a microphone. Physical MIDI responsiveness and acoustic recognition were not measured in this investigation.

## How microphone advancement would work

For an expected middle C, the app would wait for a newly played C4, confirm the pitch and octave with sufficient confidence, highlight the hit, then advance. Number and solfege labels are presentation; recognition compares the underlying pitch. An expected chord requires evidence for every required pitch rather than whichever note is loudest.

Proposed pipeline:

1. The user enables microphone practice and grants macOS/app permission. Brief calibration estimates room noise and tuning.
2. An AudioWorklet collects timestamped audio. A separate worker or native process performs heavier analysis so it does not block drawing or the audio callback. Web Audio supports microphone streams and custom processing on the audio rendering thread. This is an architectural recommendation for this Electron app, not a implemented detector. [Web Audio standard](https://www.w3.org/TR/webaudio/)
3. A single-pitch estimator plus an attack detector produces new-note events for simple exercises. YIN is a low-latency fundamental-frequency estimator, but its single-pitch output is not a complete chord recognizer. [YIN paper](https://pubmed.ncbi.nlm.nih.gov/12002874/)
4. For chords, evaluate a streaming piano-specific model that estimates multiple pitches and new attacks. Confirm detections across a small number of frames; keep ambiguous input waiting instead of guessing a hit.
5. A shared matcher accepts confirmed events and updates the sheet, falling notes and finger guide once. Maintain input timestamps and reject stale events after seeks, loops or score changes. Require a new attack for repeated notes, and use an adjustable short collection window for rolled chords.

The existing `noteOn` function also plays a sampled piano note. A microphone adapter must separate assessment from sound generation: copying an acoustic note into the speakers can cause duplicate sound and feed the detector again.

## What the research establishes

A 2024 piano transcription study reports model latency configurations from 128 to 320 milliseconds, with lower accuracy at the shortest contexts. These are research measurements, not total microphone-to-screen latency on this Mac. [Efficient piano transcription](https://arxiv.org/html/2404.06818v1)

A 2025 minimum-latency study identifies costs from buffering, feature extraction, inference and postprocessing. Removing future context improves delay but sacrifices accuracy, especially for low notes. This supports measuring the whole pipeline before promising an instant response. [Minimum-latency study](https://arxiv.org/html/2509.07586v1)

Fast computation alone is insufficient: the 2023 Onsets and Velocities paper describes a theoretical delay exceeding nine seconds and a live setup truncated to four seconds. Its small frame step must not be advertised as an equivalent response delay. [Onsets and Velocities, latency section](https://arxiv.org/html/2303.04485v2)

Spotify Basic Pitch is an open-source, polyphonic audio-to-MIDI tool with several available runtimes. Its documented file-transcription workflow makes it an evaluation candidate rather than evidence of a ready-made responsive Wait-mode detector. [Official Basic Pitch repository](https://github.com/spotify/basic-pitch)

Matchmaker provides open-source live audio and MIDI score alignment. This is relevant for a continuous Follow mode, where the sheet tracks a performance with tempo changes. Estimating score position does not itself certify that every expected chord pitch was played correctly; strict Wait mode still needs pitch validation. [Matchmaker repository](https://github.com/pymatchmaker/matchmaker), [2025 evaluation paper](https://arxiv.org/abs/2510.10087)

## Proposed product behavior and limits

Keep MIDI as the preferred input for a compatible digital piano. For an acoustic piano, offer microphone practice with a visible listening indicator, a small input meter, adjustable sensitivity and explicit uncertain-note feedback. Keep the detector local and independent of the companion LLM.

Start with one hand and one newly struck note at a time. Then evaluate ordinary chords, pedal and repeated notes before enabling strict two-hand microphone checking for pieces such as Appassionata. The score narrows the comparison, but the detector must still observe wrong notes; merely searching for energy at an expected frequency can accept harmonics or lingering sound incorrectly.

Use headphones for app demonstrations or accompaniment during microphone practice, or mute those outputs in strict Wait mode. Speaker playback may otherwise be mistaken for the player's piano. Do not rely on general speech-oriented echo cancellation to solve this without testing it on music.

PDF recognition also matters: inaccurate imported notation creates inaccurate expected keys even with perfect sound detection. Keep score review and manual navigation available.

## Validation before release

Measure from physical note attack to visible advancement, including capture, analysis, confirmation and rendering. A proposed first-release goal is roughly 100–250 milliseconds for clean single-note practice; this is a design target, not a measured result or a guarantee for every register or microphone. Fast continuous playing should be evaluated separately from pause-and-check practice.

Test soft and loud notes across registers, adjacent wrong keys, wrong octaves, repeated notes without a silent gap, chord omissions, rolled chords, pedal, background speech, different piano timbres and speaker leakage. Record false advances as well as missed hits. An uncertain detection should not silently move the score.

Test seeks, score changes, input disconnects and loops for stale detections, and test alongside piano playback and companion chat for CPU/memory contention. Validate both recorded fixtures and actual acoustic-piano sessions; simulated MIDI or rendered samples alone do not establish microphone reliability.

Recommendation: extend the existing matcher with an independent microphone input, release single-note checking first, and evaluate continuous score following separately. Free research implementations make a local prototype possible without a paid recognition service; dependency/weight licenses and measured hardware performance still need review before packaging.
