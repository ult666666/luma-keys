# Practice workspace · 2.18

The score and piano share the main workspace. Numbers, Sheet and Falling notes stay at the top; Listen, Wait and Perform stay beside playback. Hand selection and speed remain directly available.

## Controls

- **Score tools** holds the full piece title, key and meter details, note review, export and reading help.
- **Practice tools** holds volume, accompaniment and passage settings. The loop button shows the active bar range; open Practice tools to change or save it.
- Escape closes either tools panel and returns to its button. Review, reading help, export and accompaniment also return to a visible button. Typing or using controls inside a panel does not trigger piano shortcuts.
- The keyboard's hand, runway, collapse and Focus controls remain available. All 88 keys remain in the scrollable keyboard.
- The short hand guide uses **L/R**, one action and pitch/finger pairs. **Finger guide** still explains the distinction between finger numbers 1–5 and pitch numbers 1–7. Fingerings are suggestions, not a measurement of the player's hands.

## Rendering and timing

The practice view removes repeated labels and decorative glows. Existing room colors and companions remain; this pass adds no generated artwork. The timeline keeps a steady height while it is pointed at or focused, and the compact keyboard leaves more room for the grand staff.

Automatic notes, other-hand accompaniment and metronome clicks share a half-second scheduling horizon on the audio clock. Pause, seek, speed changes and loop resets cancel queued playback. The visual score and hands continue following the audible clock; the longer scheduling horizon does not delay input.

Compact sheet engraving loads a bounded MusicXML passage with prior staff attributes and spanning notation context. The original score, audio notes and full Review document remain unchanged. Long or unsupported notation retains the full-document path. This optimization is not a guarantee that every imported score renders without a pause.

The hand illustration retains exact fingertip targets with more articulated outer fingers, quieter nails, active finger badges and a tapered palm. At short keyboard heights the palm can extend naturally below the front rail instead of being flattened to fit. The guide is an illustration, not a biomechanical simulation.

## Verified release

Version 2.18.0 is installed in the Desktop app. All 403 unit/API tests and seven native UI groups pass; 27 final screenshots were reviewed. Dense Appassionata, its coda and a live switch to Sheet retained 559 of 559 sampled attacks. Maximum measured onset error was about 5.3 ms. Pause, seek and speed changes canceled queued attacks correctly.

Dense/coda maximum frame gaps fell to 66.6/100 ms in the recorded runs. First-time Sheet preparation still caused a 266.6 ms visual pause, with audio intact. These were muted native scheduling tests, not physical speaker or MIDI hardware measurements. Narrow/short windows can stack the speed buttons; mobile accompaniment retains an accessible icon.

All ten saved pieces and all 107 latest personal files are unchanged after reopening. The app is paused at 龙卷风 bar 69, with Beethoven and Falling notes. The previous app remains recoverable in `.qa-runs/practice-clarity-2.18/`.

Final package verification is recorded in `evidence/practice-clarity-2.18-verification.json` and `STATUS.md`. A representative screenshot is saved in `evidence/practice-clarity-2.18-sheet.png`.
