# Claude follow-up: settings recovery

September 25, 2026. The user requested a Claude enhancement pass. Claude reviewed the initial 1.0.6 recovery candidate through the installed Claude CLI, with all tools and MCP connections disabled. Source excerpts were supplied explicitly. The pass was read-only and did not overwrite project files or run tests. Its raw response is preserved in `evidence/claude-settings-review-1.0.6.json`.

# Review: settings recovery patch

**No blocking findings.** Three low-severity, non-blocking items are below.

I read the code only and ran nothing. These parts hold up:

- **Hydration does not write.** The hydration snapshot has the same key order as the autosave snapshot (`theme, pet, stats, volume`). The `stats` spread keeps its key positions, so loading settings alone never triggers a save.
- **Server writes are safe.** Server-side writes run in order. The previous file is re-read inside the queue, so only the first repair makes a backup copy. The save is atomic: write to a temp file, then rename. If the backup copy fails, the original file is left alone.
- **Rejections leave the file alone.** A rejected PUT throws before it joins the queue, so it never touches the file.
- **Backups and temp files stay out of the Library.** Backups go into a subdirectory, and temp files end in `.tmp`, so neither shows up in `readLibrary`.

---

### 1. Low: a debounced save is lost when the app closes within 500 ms
**Location:** `src/App.jsx`, the autosave `useEffect` (the `setTimeout(..., 500)` and its cleanup `clearTimeout(timer)`).

**Repro:**
1. Practice, then press Stop. `stop()` adds the session minutes through `setStats`.
2. Close the window or quit within 500 ms.
3. Relaunch. The minutes from that session are missing.

The same thing happens if you change the theme or volume and quit right away.

**Minimal fix:** on `pagehide`, send any pending snapshot with `fetch("/api/preferences", { method: "PUT", keepalive: true, headers: {"content-type": "application/json"}, body: snapshot })` if it differs from `lastPreferences.current`. Alternatively, flush from Electron's `before-quit` handler.

Separately, and not caused by this patch: the unmount cleanup calls `piano.stop()` instead of `stop()`. Closing while practicing never records the session that is running.

### 2. Low: a failed settings load turns off saving for the whole session with no lasting warning
**Location:** `src/App.jsx`, the `api("/settings")` `.catch` inside the mount effect. `prefLoaded` never becomes `true`.

**Repro:**
1. Make `preferences.json` unreadable, for example with `chmod 000` or by replacing it with a directory. `readSettings` then throws something other than ENOENT, and GET returns 400.
2. Launch the app. A 5-second toast says "Saved settings unavailable".
3. Practice and change the theme. Everything looks normal, but the autosave effect returns early, so nothing is saved and no error is shown.

**Minimal fix:** in the `.catch`, add a persistent entry to `settingsIssues`, for example `setSettingsIssues(["Settings file could not be read"])`, so the recovery notice stays on screen. Leave `prefLoaded` false so the unreadable file is never overwritten. Also update the notice text so it doesn't claim values were kept.

### 3. Low: changes made before settings load are overwritten
**Location:** `src/App.jsx`, the hydration `.then`, which calls `setTheme`, `setPet`, `setStats` and `setVolume` unconditionally.

**Repro:**
1. Delay `/api/settings`, for example with a slow disk or a cold packaged start.
2. Change the theme or volume, or finish a short practice, before the response arrives.
3. When hydration runs, those changes are replaced. Accumulated `stats` minutes are lost, and nothing is saved because the new state equals `lastPreferences`.

The local server makes the window small, so this is rare.

**Minimal fix:** disable the settings controls and the Stop-time stats accumulation until `prefLoaded` is true. Alternatively, merge any `stats` increments made before load into `progress` instead of replacing them.

## Primary-agent corrections after the review

Codex addressed all three reported cases. The Electron window-close and application-quit paths now wait for the renderer to record active practice minutes and finish queued settings writes. A failed save offers Keep open or Close without saving. The local server stays available until the final quit phase. Settings loading now disables practice and preference edits until the saved state is ready. An I/O failure leaves a persistent notice explaining that changes are temporary, with Reload saved settings after file access is restored.

The renderer uses React's synchronous flush only at the native close boundary, so the final snapshot contains the just-recorded active session. Normal changes retain the existing short debounce. These corrections were implemented by Codex after Claude's review; Claude did not review this later code or execute the verification suite.

The implementation follows the documented [Electron before-quit/will-quit lifecycle](https://www.electronjs.org/docs/latest/api/app#event-before-quit) and the [React flushSync integration guidance](https://react.dev/reference/react-dom/flushSync). Validation evidence and the final installed version are recorded in STATUS.md. Normal app exit is covered; force termination or power loss cannot run the close handler.
