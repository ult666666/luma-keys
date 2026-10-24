# Companion conversation · 2.20

The companion now uses the bundled Qwen3.5 9B model on Apple silicon. The pretrained model runs through llama.cpp on this Mac; no account, API key or cloud chat service is involved. It loads for a reply, then releases its process and memory. The smaller Apple model remains a fallback when the bundled runtime is absent. Conversation options identify the actual engine.

## Conversation

Six companions have distinct voices, with quieter humor and concise replies. Everyday questions, translations and open conversation reach the model instead of being turned into an unrelated bar lesson. Follow-ups use recent role-separated messages. The latest 60 messages are saved locally; up to 12 recent messages fit into a bounded model context, so this is not unlimited memory. Interrupted answers are not treated as complete history.

Language options include English, Simplified/Traditional Chinese, Japanese, Korean, Spanish, French, German, Portuguese, Italian, Russian, Arabic and Hindi. Explicit language choices persist across short follow-ups and reloads. Arabic text has its own reading direction. General conversation quality varies by language; Hindi factual explanations remain notably weaker in testing. Exact score lesson cards remain English or Simplified Chinese, with a brief note when another conversation language is selected.

## Practice actions

The companion can find saved pieces, return to a saved position, seek/repeat bars, set speed or hands, choose practice modes and open app sections. Direct supported commands and clearly labeled action buttons use the app's existing validated controls. Combined passage requests offer separate validated buttons; playback stays paused. Invalid or conflicting compound requests do not offer a partial setup. Descriptive questions do not change settings.

The language model's prose never executes controls, opens files, edits a score or browses the web. Exact score teaching comes from the written score. General musical suggestions may be imperfect; the companion cannot hear an acoustic piano or judge an unconnected performance.

## Runtime

Qwen3.5-9B Q4_K_M weights are approximately 5.68 GB. The runtime uses two CPU threads, Metal, one inference slot and an 8192-token context. Conversation uses non-thinking mode for latency; only answer text is shown. Any provider reasoning field remains private. Stop, closing the conversation and app shutdown cancel owned inference. A private Unix socket keeps the inference server off the network; no server UI or external tools are enabled. Model/runtime licenses and acquisition checksums accompany the bundle.

This is an integration and behavior improvement to a pretrained model, not foundation-model training. It will still make mistakes. Testing retained factual slips, a verbose joke and an invented bar range; exact practice actions and lesson notes therefore remain separate from model prose. On this 16 GB Mac, the model used about 5.8 GiB at its sampled peak. With OS/file caches warm, first text was around 4–6 seconds in the isolated comparison; the initial cold load took about 32 seconds. Each reply still starts a fresh model process. In the packaged app, one first reply took 58 seconds to finish. Final real requests took 7–19 seconds to show their first text and 13–64 seconds to finish. These are observed timings, not guarantees; a longer first wait is possible.

During dense sampled piano playback and actual text streaming, all 453 written attacks started correctly, with maximum measured onset error 11.6 ms, and Pause cancelled queued attacks. Visual pauses remain: the decoding interval, which included sheet passage changes, had a 50 ms frame p95 and a 250 ms maximum gap. This was not an isolated test of GPU contention. General theory answers also contained mistakes about counting and tempo; use the separate score lesson cards for exact notes and practice controls.

## Verification

Evidence lives in `.qa-runs/companion-intelligence-2.20/`. The original Apple baseline and both Qwen candidate comparisons retain complete synthetic prompts and raw output, including weak replies. Final unit, packaged UI, cancellation, language/history and piano coexistence checks are recorded separately; see `STATUS.md` for the accepted release and installation state.

Installed on September 27: version 2.20.0. All 472 unit/API tests and nine native behavior groups passed. The installed bundle matches the tested package, all 108 latest personal files remained unchanged, and the app was returned to Truth at bar 105, paused, with the mini Beethoven conversation available. Prior rejected runs remain in the evidence folder.
