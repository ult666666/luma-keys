# Sound checks and recovery · 2.44

Practice tools → Sound now includes **Test sound** and **Recover audio**.

Test sound plays C, E and G through the same piano and output path as normal
playback. It pauses practice first, adds no practice session, respects piano
volume, and is disabled while the microphone is listening. Play, navigation,
or leaving the window cancels the test's pending or scheduled notes.

Recover audio saves pending practice/settings changes, then rebuilds the entire
audio system by reloading the window. The selected piece, exact beat and repeat
range return paused. A short-lived session-storage handoff contains only the
piece identity and position; it is consumed once and expires after two minutes.
Failed saves prevent the reload. Controls are briefly unavailable during that
save; an already-running action that changes practice also prevents the reload.

## Failure handling

Previously, `AudioContext.resume()` was unbounded and its resulting state was
not checked. A pending resume could leave Play waiting indefinitely; a resolved
resume with a non-running context could make the app appear to play silently.
Resume now has a three-second deadline and requires a running context. Playback
also pauses if its context stops running and presents **Recover audio**.
The recovery covers the piano, accompaniment and shared output gate together.

Audio diagnostics now include context state/time, sample rate, output latency,
app gain, microphone muting and the latest resume error. No audio is recorded.

## Hand preparation must not freeze practice

The 50,000-note import regression exposed another real problem. After 20 seconds,
the hand planner terminated its worker and repeated the full calculation on the
renderer. The piano window then stopped responding and could not display a PDF
recognition result that the backend had already completed.

Large scores now keep their planning off the renderer. If the worker fails or
times out, it stops and the optional hand guide shows an unavailable message with
**Retry hand guide**. The score, keyboard, playback and navigation remain usable;
the app supplies no guessed fingering or stale hand pose. Small scores of up to
256 notes retain the existing exact fallback. A score/speed change or retry
clears the error, and cancelled jobs cannot install obsolete plans.

This is a responsiveness fix, not a new hand illustration or a claim that every
large score now has a complete hand plan within twenty seconds.

## This Mac

During investigation, the installed 2.43 app was in Listen mode, unmuted, with
piano volume at 100%. macOS selected its built-in MacBook Air Speakers, but
system output was only 6%. That can explain very quiet playback; it does not
prove the context bug occurred in that session. System volume was left unchanged.

Microphone recognition is a separate input path: choose **Connect piano →
Microphone** and start listening. The app deliberately mutes its own piano while
listening so it cannot mistake playback for the learner. No physical microphone
or speaker-audibility test was performed during this update.

## Verification

Focused unit coverage checks pending, rejected, closed, interrupted and recovered
contexts, concurrent requests, sample-load failure handling, and one-use position
handoffs. The packaged acceptance script is
`.qa-runs/audio-recovery-2.44/audio-qa.mjs`; it uses an isolated library, real Web
Audio and a post-output-gate signal meter with native output muted. Its reports
distinguish signal/scheduling evidence from actual physical audibility.

The final packaged audio acceptance run passed all eight groups, including real
context suspension, delayed/failed preference writes, keyboard blocking during
recovery and exact beat/repeat restoration. Hovered Test sound text measured
15.51:1 contrast. The post-gate audio peak was 0.059974 with native speakers
muted by the test harness. Version 2.44.0, ASAR
`5cd5bf4b1c8492c28f25f4fc5244dbb5514b0441768be7d6dafed246633b5448`.
Report: `.qa-runs/audio-recovery-2.44/final1-audio/report.json`.

The same package passed three hand-guide recovery groups: an explicitly injected
failure-handler call produced the unavailable state without fake poses, playback
and navigation stayed responsive, and Retry completed in an actual background
worker (78 ms). Report:
`.qa-runs/audio-recovery-2.44/final4-hand-planner/report.json`. The final package
matches all 537 checked source/dist files and all 3,035 staged bundle entries.
The formerly frozen native reader story also passes all nine checks: the
50,000-note worker stops after its deadline, the PDF review opens and renders,
and a corrected pitch saves back to the numbered score. Its trace is retained
in `.qa-runs/audio-recovery-2.44/native-5cd5bf4b1c84-o1e77z/logs/native-reader-qa.log`.

The final sequential regression batch passed seven of eight stories: reader,
library access, recovery, storage, close/save, companion guidance and trouble
spots. The grand-piano story remained failed for its frame benchmark. A fresh
run completed all 18 functional checks (including seeking while audio startup
is suspended), with no renderer errors or remaining voices. Its explicit
`functionalPassed: true`, `performancePassed: false`, overall failure and exit
code 1 are preserved in
`.qa-runs/audio-recovery-2.44/native-5cd5bf4b1c84-JUcEhO/native-grand-report.json`.
Performance limits were not relaxed to accept the release's functional fixes.

Forty focused audio tests and 55 storage/backend/microphone/packaging checks
passed. A broader 940-test run passed 939; its companion process-tree fixture
hit a two-second startup timeout under heavy machine load. That specific case
passed alone. The timeout-sensitive companion file was not treated as a clean
full-suite result, and production model timeouts were not weakened.

The planner, hand-coach component and continuity tests passed 29 checks after
the freeze fix, including a 50,000-note timeout, worker failure variants,
cancellation, and the exact small-score fallback.

The dense 9,600-note animation benchmark did not meet its unchanged 25 ms median
and 60 ms p95 limits. The earlier 2.44 candidate measured roughly 99–100 ms
median; the installed 2.43 baseline also measured 82–100 ms on this Mac. This does
not establish a new regression, but it does mean smooth dense-score animation
is still an open issue. Failed runs and baseline measurements are retained.
The final grand-piano rerun measured 66.7–83.3 ms median and 116.7–132.5 ms p95
across its three runs. This update does not claim to resolve that limitation.

## Installed copy

The verified 2.44.0 bundle is installed at `~/Desktop/Luma Keys.app`
and visibly reopened. Sunny Day remains paused with Resume bar 48, Listen mode,
Both hands, 50% speed, Ocean and Lang Lang. All 109 personal music/settings/progress
files stayed byte-identical through installation and reopening. The former 2.43
app and non-chat backup are retained. The new sound actions were verified through
the installed app's accessibility tree. Initial launch was slow; startup speed is
not claimed fixed. Evidence: `evidence/audio-recovery-2.44-verification.json`.
