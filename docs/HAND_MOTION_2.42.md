# Hand motion · 2.42

The user asked for hands that are realistic, free of bugs and smooth. This pass measured the live 3-D hands frame by frame before changing them, and fixed what the measurements showed rather than tuning by eye.

## How it was measured

`scripts/hand-continuity-probe.mjs` poses a hand-lab scenario in node exactly as the stage does (the motion engine's frame, then the rig's pose solver), 144 times a second, both as a still frame and eased from the frame before as the renderer draws it. For every frame it records how far the hand moved, the largest joint change of any digit, and how far each held fingertip is from its key. A "jerk" is a frame that moves much more than both its neighbours (a fast but even flight is not a jerk). Frames the motion engine itself flags as impossible speeds are counted separately. Twenty hand-passages from the Appassionata, Tornado, Moonlight, Sunny Day and the stress scenarios were measured before and after.

A CPU profile of the packaged app during dense Appassionata playback showed the renderer mostly idle (frame median 16.7 ms, p95 17.5 ms over eight seconds), so the visible problems were in the posing, not the frame rate.

## What was wrong, and what changed

- **A thumb could float beside its key.** In Tornado (bars 4–6) the left thumb missed A3 by 17.5 mm, and in the Moonlight Sonata (bars 57–59) the right thumb missed B3 by 16.2 mm. In both the thumb is held a fifth away from the index finger, wider than any spread of the hand places it. A pianist turns the hand toward the thumb for that; the solver allowed only 12° of turn. The wrist may now turn up to 13° further, by how far a thumb-index or thumb-middle stretch passes the hand's widest natural spread, each digit counting as far as it is into its key, so the allowance grows and fades continuously. Both frames now land within 0.4 mm.
- **The fit could stall.** The contact refinement is local; for a wide stretch it could settle in a fit that turned the wrist the wrong way (two frames apart, one exact and one 5 mm off). Only while a held key is still missed, it now retries from the wrist turned to either bound and from the hand's default frame, and keeps the best reach. Ordinary frames never take this path.
- **The hand's shape switched at the instant of a strike.** The hand's span, which opens its arch and steepens the fingertips for wide chords, counted only keys already down, so the whole hand changed shape in one frame when a key was struck or released. It now counts a digit as it comes to its key and as it leaves it.
- **The hand arrived late.** An aiming finger pulled the hand only in the last frames of its descent. It now brings the hand over the second half of its approach.
- **A landing finger snapped curled.** A finger approaching a key was solved with free-finger joint ranges and switched to on-key ranges (its middle joint bent) on contact. It now takes on the on-key ranges as it arrives.
- **Free fingers trembled.** When their resting solution flickered between two nearby poses, the free fingers followed every frame. They now settle on their own 90 ms clock, while a finger coming to or leaving a key keeps the hand's clock and meets its key exactly.
- **The eased hand could snap to a finger.** Easing the hand over 40 ms (was 24 ms) is now possible because, while the hand is still catching up, a finger on its key may stretch within the strained joint ranges, rather than the hand jumping to it. Once arrived, the comfortable ranges return, so a still frame shows the exact pose.
- **Wide stretches splayed the free fingers.** In an octave or crossing, the free fingers between the ends now hang a little closer together and slightly more curved.
- **Finish.** Nails catch a little more light, knuckle relief and warmth are slightly stronger, and creases are a touch quieter.

The motion engine (`src/hand-pose.mjs`), the fingering, the camera, contact tolerances and joint limits are unchanged.

## Results

| measure | before | after |
| --- | --- | --- |
| worst held-key miss, 20 hand-passages | 17.5 mm | 3.3 mm (one frame; all others ≤ 0.5 mm) |
| eased jerk frames, 20 hand-passages | 148 | 125 |
| pose cost per hand, mean / p95 / worst | — | 0.38 / 0.71 / 5.6 ms |

"Before" here is the first full measurement after the span change; the original code's worst misses in the same passages were 14.7 mm (Tornado, left hand) and about 26 mm (Moonlight Sonata bars 57–59, right hand, in the lab's 60 Hz dump). The remaining 3.3 mm frame is in Sunny Day's chord arrangement (bars 57–59, right hand) and is retained.

## Verification

- `tests/hand-continuity.test.mjs` poses an octave melody and a thumb-under scale frame by frame as the renderer does: no landing or release moves the eased hand more than 8 mm in a frame, every held key is reached within 0.5 mm at those moments, free fingers stay within a measured jerk budget, and the hand's height no longer jumps in a landing frame.
- All 162 hand, pose, planner, fingering, surface, bake, cue and coach tests pass, and all 902 unit/API tests pass.
- The hand-guide browser story passes all eight groups again. It had been failing since 2.39 on harness drift: the volume control moved into Practice tools, the guide now previews the next note during a hold, and Connect piano opens the piano-input dialog. `scripts/piano-input.mjs` and `scripts/practice-tools.mjs` now handle those for every harness that needs them.

## Limits

The hands are an articulated teaching model, not a photographic reproduction. The jerk count is not zero: the thumb's landings in fast passages still show a few moderate frames. The motion engine's own impossible-speed frames are unchanged by design. Measurements come from this Mac.
