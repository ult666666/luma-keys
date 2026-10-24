# Gymnopédie No. 1

Erik Satie

The source typesetter placed this edition in the Public Domain. Attribution retained: Evin Robertson / Mutopia Project. The underlying composition is also public domain. Mutopia policy: https://www.mutopiaproject.org/legal.html#publicdomain .

Primary edition: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37

Pinned editable source: https://github.com/MutopiaProject/MutopiaProject/blob/2144afd6f52d56c5b6995b8b589ef1268b3139f0/ftp/SatieE/gymnopedie_1/gymnopedie_1.ly

Source SHA256: 420a52244e9fbe106dd33ba2cac84414fd66e0d01c6d472205bad39678d4ce04
MusicXML SHA256: 2ed80e8348a9061c72701bbcefd850e59e59d3e01cf5a9bf67e38cb52c990b42
Reference PDF SHA256: e2b99b96bbca71077194c903cb4e390a435756892edf37040ae9dbea4cc7492a

## Practice edition

- The original LilyPond uses 31 shared bars and two eight-bar endings. The complete practice edition unfolds this into 78 bars (31+8+31+8), matching the full original form. The original site MIDI plays the written compressed47bars; it validates written pitches/onsets, not the expanded form. The accompaniment is assigned to LH even while its notation appears in treble in the source.

- The practice MusicXML uses simpler engraving, reconstructed voice lanes and explicit rests. Pitch spelling, note onset, written duration, ties and full bar count were machine checked. Original fingering, slurs, hairpins, pedalling text, ornaments and fine engraving are preserved in the accompanying original source/PDF, not all reproduced in the practice MusicXML. No grace notes occur in these source movements. Playback is a practice rendering, not a recorded interpretation.

## Verification

78bars;455physical note events;128RH/327LH. The source was parsed using python-ly0.9.10 absolute pitch and rational musical event traversal, with repeat expansion where needed. Tie continuations are merged, then split for readable MusicXML measures. Every official MIDI pitched onset is accounted for; same-pitch voice overlaps are checked against their held interval. The Luma Keys parser/validator reproduces all source physical pitches/onsets/durations exactly. Native render/playback checks are recorded separately before installation.
