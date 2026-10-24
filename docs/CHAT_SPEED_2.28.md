# Companion chat speed · 2.28

The same Qwen3.5 9B local model now stays loaded between messages. Opening the conversation starts a background warm-up, so loading can overlap reading or typing. Replies stream through the existing language, privacy and length checks. Exact piano lessons and practice commands still come from the score.

One connected worker owns one private Unix-socket model process. Stop cancels the current generation without destroying a healthy loaded model; retries can reuse it. Prefix caching avoids reprocessing a matching prompt prefix, with the additional RAM cache capped at128MiB and idle CPU polling disabled. This follows the installed llama.cpp runtime's help and its [server documentation](https://github.com/ggml-org/llama.cpp/tree/master/tools/server#readme). No model/tool downloads, prompt logs or network model service were added.

After five minutes without a chat request the worker unloads the model and removes its socket directory. App quit or a lost parent IPC channel releases the owned processes. A failed worker can restart on the next question. An unacknowledged Stop has a bounded process-group fallback. No model is loaded just by checking availability or launching the app.

## Measured reply latency

Three identical sequential questions used the production prompt builder and real local model. The earlier runtime loaded/unloaded the model for each reply; the revised runtime retained it. Times below are to first delivered text, including the existing language gate.

| Question | Before | Warm-session update |
| --- | ---: | ---: |
| First joke + codeword |23.74s|19.00s|
| Recall the codeword |15.47s|6.28s|
| Chinese practice tip |11.91s|9.65s|

These are a small sample, not a guarantee. First conversations still need a model load, and a language/persona/context change can require more prompt processing. The actual packaged-app run under substantial memory pressure ranged from about14–34s to first visible text; later requests reused the same process, rather than repeatedly loading it. This M1 Mac has16GB RAM and about14.9GiB swap in use at the recorded check. The old native build was also tested with the same questions; its run overlapped unit tests, so those figures are retained as descriptive evidence rather than a controlled speed comparison. The update does not switch to a smaller model or claim to retrain one.

## Verification

All773 unit/API tests pass when run separately with two test workers. New checks cover model reuse, idle release/restart, Stop/timeout, overlapping request rejection, failure cleanup, parent disconnect, IPC retries and route locking. The packaged app made real English and Chinese requests, recalled a codeword after a persisted-history reload, reused one model PID, accepted Stop followed by another question and quit during inference without leftover model processes.

The piano continued while actual model text decoded; Pause cancelled every observed future scheduled source. Output was muted. The captured frame p95 was83.4ms, and one cumulative sample-cache miss/fallback was recorded since startup; this capture does not locate that fallback's onset. The evidence preserves both limitations. No physical MIDI or acoustic quality claim is made.

Package and preservation checks are in [the verification record](../evidence/chat-speed-2.28-verification.json). Detailed runs, earlier failed harness attempts and the previous app are retained in `.qa-runs/chat-speed-2.28/`.
