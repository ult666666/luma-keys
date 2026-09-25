# Phrase-practice review attempt

The installed Claude CLI was prompted for a read-only review of the phrase-practice changes on September 25, 2026. Tools, MCP, slash commands and session persistence were disabled. The command returned `Not logged in · Please run /login` with zero model input/output tokens. **Claude did not review this version.** No sign-in or credential changes were attempted.

The request and failure response are retained in `evidence/claude-phrase-request.txt` and `evidence/claude-phrase-review.json`. Prior completed Claude reviews remain documented separately.

Independent Codex review found and corrected a saved note review resetting the visible position outside the active phrase, and short rest-duration labels clipping. End-to-end QA also found that local keyboard-collapse state was lost when switching through Lessons; the preference is now owned by the app for the current session. Acceptance is based on the actual unit, browser and packaged-app checks recorded in STATUS.md, not Claude approval.
