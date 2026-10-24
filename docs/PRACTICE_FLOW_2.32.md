# Practice 2.32

The main piano keeps its compact controls and the natural 2.30 hand rig. This update changes its timing and instrument finish.

- Falling notes, key approach and hands share one sampled audible clock. The paused runway also returns to the correct position after switching score views.
- Complete fingering and hand-motion plans prepare in a cancellable worker; the GPU prepares in parallel. A new score or practice speed cannot adopt an obsolete plan. Without a worker, the original exact planner remains available.
- Queued piano attacks use absolute audio deadlines. The opening window is scheduled before the first playing redraw, preventing the opening note from disappearing when that redraw is late. Pause, seeks and count-in cancellation still stop future attacks.
- The selected colour scheme appears in the instrument frame and fine woven wrist rest. Each song cover contributes a small colour accent. Blue still identifies the left hand and honey the right.
- Solid rounded note capsules have quiet satin highlights, clear contact edges and reduced blurred shadows. Short notes retain proportional duration and do not gain decorative clutter.
- Key labels keep their full existing contrast when hands are visible. A key that finishes playing restores its normal caption colour; empty highlight attributes no longer leave dark text on a dark key. Dynamic marks sit above the landing line, rather than being cut in half.
- Colours now shows small piano-finish previews. All seven choices and existing keyboard navigation remain; changing colours during Listen keeps playback moving.

Use Left/Right arrows to jump five displayed seconds. Existing Numbers, Sheet, Falling notes, Listen, Wait, Perform, hand selection, speed, repeat, accompaniment, label and accessibility controls remain.

## Verification and limits

Exact-package checks and the matched before/after results are saved in `evidence/practice-flow-2.32-verification.json` and `.qa-runs/practice-flow-2.32/`. Failed diagnostic runs are retained. The initial final1 run exposed a genuine skipped opening attack after a delayed first frame; the startup-window correction was made before release.

The installed archive passes 802 unit/API checks, seven native groups, two extra startup/reopen checks and independent visual review. All 370 checked attacks played, with maximum software scheduling error 5.33 ms. An earlier 3-D startup attempt timed out; its original cause remains unknown. The unchanged archive subsequently passed three instrumented starts and actual Desktop visual inspection. This timeout is retained, rather than claimed fixed. All 108 latest personal files remain unchanged after normal quit, fresh backup, installation and reopening.

Timing measurements come from this Mac, using isolated libraries and muted output. They do not establish physical MIDI or microphone behavior, a listening-device fix, or a universal lag-free guarantee. A fresh GPU/cache or initial sheet engraving can still take time. Existing music, interpreted timing, sampled piano bank, companion conversation and saved practice data are preserved.

The separate rendering trace introduced significant overhead and is saved as diagnostic evidence. It showed compositor commit waits and layout/paint work, but did not establish a safe additional fix. The ordinary native runs, rather than traced frame rates, are used for the before/after comparison.
