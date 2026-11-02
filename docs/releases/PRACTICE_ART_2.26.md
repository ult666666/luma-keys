# Practice · 2.26

The playing hands keep their existing model, proportions, joint movement and key contacts. Softer light, warmer skin colour, quieter creases and veins, matte highlights and satin nails give them a gentler finish. Fingertip numbers have a clear face and rim. The model files and fingering system are unchanged.

The piano frame borrows colours from the same artwork used in Library: warm peach for Appassionata, leaf green for 晴天, lavender for 龙卷风, and blue for 你离开的事实. Each known cover has its own accent. The chosen companion or custom room palette still applies. Blue and amber distinguish the two hands throughout the guides. Falling notes have solid, lightly shaded faces, readable numbers, a fine edge and a separate outline for the next attack. Dynamic strength still shapes their highlights. Reduced motion removes their material transitions.

## Five-second jumps

While Practice is open, press **←** to go back five seconds or **→** to go forward five seconds. Jumps use the displayed song clock, just like a video player, at every practice speed. The timeline itself accepts the same shortcut. Song and repeat boundaries clamp the jump; they do not wrap it. During a count-in, jumps begin at the position shown on screen.

- **Listen:** playback continues from the new position, without another count-in. Queued sound from the previous position is cancelled.
- **Paused:** the new position stays paused.
- **Wait:** an active session waits at the next written attack after the new position.
- **Perform:** seeking stops the unfinished graded run without adding a result. Press Play to begin a fresh run.

Text fields, chat, volume sliders, selectors, score tabs and the piano's key navigation keep their normal arrow controls. Keyboard shortcuts lists the new command. The existing next/previous-note buttons and shortcuts remain available.

## Verification

See `evidence/practice-art-2.26-verification.json` for the final package, native practice checks and saved-data verification. Native tests use copies of three real scores in a separate QA library and mute the test app's output. They check rendering, note-number contrast, different window sizes, reduced motion, tempo changes, seeking, queued sound cancellation and control ownership. They do not test a physical MIDI piano or assess audible sound quality.

Source: `src/practice-art.css`, `src/hand3d.mjs`, `src/hand3d-data.mjs`, `src/hand3d-cues.mjs`, `src/practice-seek.mjs` and `src/App.jsx`.
