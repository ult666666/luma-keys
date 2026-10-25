# Isolated browser QA

## Goal and scope

Make the existing five sight-reading stories reproducible from a clean checkout with one maintained command. This is engineering verification of the synthetic exercise experience, not recognition-engine or native macOS release certification. Reuse `startServer` and `verifySightReading`; no application behavior changes or additional dependencies.

## Command contract

`npm run qa:browser -- --output-dir .qa-runs/browser-review` builds the current checkout, launches headless Chromium, serves that build on one owned ephemeral loopback origin and exercises the existing stories. Omit the destination to create a unique directory under `.qa-runs`. An explicitly supplied destination must not already exist, including an empty directory or symlink. `--timeout-seconds` accepts an integer from 1 through 600, default 180, covering build, startup and stories. Cleanup has its own short bounded grace period. Unknown, duplicate and malformed arguments fail before resources are created. `--help` does no work. Node 24 and the existing Playwright Chromium headless shell are prerequisites; macOS and Linux are the supported QA hosts.

Exit 0 requires the stories and cleanup to succeed; 1 means a run failed, timed out or failed cleanup; 2 means invalid arguments/destination or unsupported host. SIGINT/SIGTERM return 130/143 after cleanup. Keep build/worker logs, screenshots and a JSON receipt on failure as well as success. Never record browser connection tokens. Describe forced termination honestly in the receipt.

## Ownership and lifecycle

The controller owns the build subprocess group, Playwright BrowserServer and a Node Worker. The Worker owns the ephemeral HTTP server and browser connection; terminating it closes its event-loop resources even if a story or shutdown hangs. Only parent-created resources are stopped. Never inspect or kill fixed-port listeners. Create a separate temporary library and logs with `mkdtemp`, explicitly override inherited `LUMA_DATA_DIR`, and pass nonexistent paths for every optional engine. Remove that temporary root only after the Worker stops. Do not run `prepare-starter-library.mjs`, install engines, use a user library or contact external services. Reject browser requests outside the owned origin (allow data/blob URLs); report any attempted external request as a failure. Also reject every HTTP redirect before fulfillment and block all WebSockets; these stories require neither transport. Count blocked redirects/WebSockets in failed receipts too. The existing screenshot helper gains an optional destination with the old default preserved.

The build runner uses no shell, bounded log capture, a deadline signal and a POSIX process group with TERM/KILL escalation. Worker success requires a result and normal exit, not a result followed by a hang. Cleanup errors prevent a passing receipt. Browser shutdown uses graceful close followed by kill if necessary. Receipt paths are relative to the artifact directory; library paths and WebSocket tokens are not persisted.

## Evidence and integration

Test real subprocess/Worker completion, failure, missing results, deadline termination and socket release while an unrelated server remains usable. Test CLI validation and existing-output preservation. Run the actual full browser command plus an actual deadline failure, full unit/API suite and build. Add a Linux CI job using the same command; preserve the existing macOS tests. Document installation, artifacts, isolation and limits. Use independent whole-branch review before shipping the exact green head. The user has delegated routine design/execution and shipping; this bounded design implements that authorization without another approval loop.
