# Claude review of the material and motion update

The installed Claude CLI reviewed the supplied 1.1.1 components/styles with all tools/MCP disabled. It did not edit files or run tests. Exact input: `evidence/claude-material-request.txt`; raw response: `evidence/claude-material-review.json`. This review happened before the corrections below, so it is not a second approval of their implementation.

Confirmed and corrected:
- A fixed 232px internal score height could hide the left-hand row when the right hand contained a chord. Numbered passages now expand naturally; both hands and full-size note labels remain readable. Complex chords can require ordinary vertical page scrolling to reach the keyboard/transport.
- Wait mode gave notes carried through from an earlier beat the same current-note accent as the new required onset. Those earlier notes now have a quiet `hold` annotation and steady underline.
- Removing one overlapping score voice, or releasing a live key over a continuing score voice, replayed the resonance animation. The replacement counts newly added sound owners only. A playback epoch separately identifies true restarts/loop entries. Counters are bounded to 88 piano pitches, without retaining ended note IDs.

Claude also noted that key caps remain depressed during adjacent same-pitch notes, and that upcoming-key cues are restrained. Repeated onsets have separate resonance strokes, while sounding keys already receive the `.sounding` surface fill/depression and upcoming targets receive `.lit` guidance. This pass preserves that concise visual hierarchy; it does not claim a mechanical key release between every adjacent written note.

Broader-code checks resolve the listed input hypotheses: App's window-blur handler releases all input owners; the global Space shortcut excludes focused buttons; and InputNotes ignores duplicate releases. Existing input regressions cover these paths. Manual-scroll follow behavior, secondary mouse input, small controls and potential painting optimizations remain lower-priority review suggestions, not claims of measured regressions fixed here.

Independent QA also reproduced silent Listen resume inside a sustained note in the shipped 1.1.1 app. The corrected scheduler starts only the remaining duration, preserves ordinary onsets and respects phrase bounds. Real sampled AudioBufferSourceNode start/stop scheduling is checked in both browser and the packaged app. Verification results and known musical limitations are recorded in STATUS.md.
