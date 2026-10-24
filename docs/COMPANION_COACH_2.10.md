# Companion lessons and motion — 2.10

The companion can explain the score in short passages, keep the lesson across saved chat, and prepare a passage for paused practice. Ask “Teach me this piece and break it down”, “Teach me bar 8”, “Next step”, “Make it simpler”, or “What is the next bar?”. Chinese equivalents work too. A hand follow-up keeps the passage being discussed even when the transport is elsewhere. The numbered steps describe the lesson, not a measured achievement.

A teaching card reads the actual score: rests, simultaneous notes, unequal holds, notes continuing from the previous bar, pickups and changing time signatures. It uses the active number-one pitch and label mode, with octaves explicit. Dense bars show a bounded excerpt and say when to continue in the score. Buttons prepare the stated passage, hand, speed or wait mode, leaving playback paused. Older cards disable their actions when score content changes.

For general conversation, Apple’s on-device model receives actual user/assistant conversation roles instead of a flattened transcript. Greetings and frustration messages no longer receive raw note tuples. The model has no app tools and cannot execute actions. Reply formatting supports plain paragraphs, emphasis and lists without rendering model HTML or links. Stop, retry, persistence errors and the existing local practice commands remain available.

Each of the six companions has an interactive chat portrait: tap, click, Enter or Space for a greeting; pointer gaze is bounded; blink, thinking, reply and greeting gestures use restrained motion. Reduced motion switches to static expressions. These changes do not alter the stage portrait’s tempo-following baton, hand guide, keyboard geometry or sound engine.

## Verification and limits

Evidence lives in `.qa-runs/companion-coach-2.10-20260927-124749/`. The source snapshot predates this pass and preserves concurrent/user changes. Tests use separate copied or synthetic libraries, muted sound and isolated app instances. The prior shell-only design refinement is included in this release.

The complete unit/API suite passes 317 tests. The companion’s focused music tests include actual Sunny Day opening passages, pickups, ties, rests, chords, changing meter, label modes, dense scores and stale editions. Motion checks cover all six portraits; responsive checks cover 1280×800, 390×844, 1100×520 and 390×520. The final packaged app passes 12 conversation groups and 7 real coaching groups; 12 packaged piano-input groups also pass. A timing-sensitive streaming scroll snap was reproduced and fixed, with a controlled regression that fails when the geometry guard is removed.

Real-model evaluation preserved 55 attempts, including unsuccessful earlier candidates, plus two final social-prompt probes. The final mixed router test completed 13 turns: seven actual model replies and six exact local lessons, with no model timeout or identical repeated reply. The model remained verbose in a frustration case and offered three options when asked for one. First text took about 7–22 seconds in that run; the longest full reply took about 66 seconds. An earlier direct-model-only next-bar question invented notes and timed out; that natural wording is now covered by the score coach. General chat remains fallible and can still be slow. It cannot hear an acoustic piano or judge posture, tension or mastery. Hardware MIDI and arbitrary new PDFs were not retested in this companion pass.

## Installed app

Version 2.10.0 is installed and open on the Desktop. All 2,992 bundle entries match the tested candidate, and all 68 latest personal files remain byte-for-byte unchanged through reopening. The Lang Lang portrait greeting was visibly checked in the installed app; the existing transcript was preserved without sending a new personal chat. The previous 2.9.0 app remains recoverable in the QA run directory. The final index is [companion-coach-2.10-verification.json](../evidence/companion-coach-2.10-verification.json).
