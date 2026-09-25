# Claude review of the sight-reading redesign

The installed Claude CLI reviewed the new numbered-score, reading helpers and keyboard viewport with tools/MCP disabled. It did not edit files or run tests. Raw response: `evidence/claude-reader-review.json`; exact supplied source/request: `evidence/claude-reader-request.txt`.

Claude identified four concrete concerns:

1. Near-equal floating-point onsets could draw as separate, overlapping chord stacks.
2. A capped proportional layout could overlap distinct notes when a passage contains very unequal gaps.
3. A note carried over from the previous passage displayed its whole duration and clicking it sought backward.
4. Pausing keyboard follow for every held input could leave legato MIDI/computer playing offscreen; only an active pointer requires that protection. Target positions should also be ordered.

Codex implemented a visual onset tolerance without rewriting source timing, minimum note spacing with a shared time-to-position map, remaining-duration labels and current-page seeking for held notes, and pointer-specific follow protection. The full source and final behavior changed after Claude's review; Claude has not reviewed those corrections. Validation is recorded in STATUS.md and the reader/input evidence files.
