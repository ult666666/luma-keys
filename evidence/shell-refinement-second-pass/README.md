# Shell refinement — second pass

Implemented in `src/design.css` and `src/shell.css` only.

- Main navigation now uses a 1px rule at the app-bar edge instead of a filled
  selection capsule. The brand is smaller and optically aligned; MIDI status
  is separated from Import and Settings by a hairline.
- The piece title retains two-line wrapping. Composer, musical facts, and
  measure count form spaced clusters instead of a dotted breadcrumb. The
  view selector and tools share one open, ruled utility area.
- Transport controls sit on a flat band, with a divider after the transport
  buttons, unboxed mode selection, and understated select fields. The position
  marker uses a solid stem and rectangular cap rather than glow.
- Settings sections use rules instead of rounded cards; selectors and theme
  previews have smaller corners and no outer neon-like selection shadows.

## Validation

- `npm run build`: passed; see [build.log](build.log).
- `npm test`: **179 passed, 3 failed**; see [tests.log](tests.log). All three
  failures are API tests whose isolated servers cannot bind local ports in
  this sandbox (`server.address()` is null). No out-of-scope logic was changed.
- Prettier check passed on the two edited source files.
- CSS parses successfully; playing-surface rules inside both edited files
  are byte-for-byte unchanged: [css-checks.json](css-checks.json).
- Protected checksums match the fresh snapshot for `stage.css`, keyboard/hand
  code, fingering, audio, and timing modules. `App.jsx` changed concurrently
  during final validation; this pass did not edit it. Its current header and
  transport markup were re-read and retain the selectors used here. See
  [protected-files-check.txt](protected-files-check.txt).

**Visual acceptance is pending, not passed.** Local server binding is denied,
the browser CLI cannot start its daemon, Chromium's macOS bootstrap service
is denied, and native Chrome access is unavailable. Consequently no fresh
screenshots were captured. Do not treat first-pass screenshots as this pass.

Offline fixtures were built from the current source, before and after these
edits, using embedded fonts/assets and in-memory demo preferences. They do
not contact the personal app or library:

- Before fixture: `.qa-runs/shell-refinement-second-pass/offline/before.html`
- After fixture: `.qa-runs/shell-refinement-second-pass/offline/after.html`

`.qa-runs/` is not committed, so these fixtures stay on the machine that built them.

Run `node .qa-runs/shell-refinement-second-pass/verify.mjs` where local Chromium
launch is permitted to produce screenshots and layout assertions in this
folder. It checks 1642×927, 1100×800, 1642×680, Falling notes, Library, Settings,
all five themes, long titles, keyboard focus, reduced motion, focus mode, and
horizontal overflow. These checks have been prepared but could not run here.

## Tradeoffs and preservation

The existing short-window vertical scroll and responsive header stacking are
retained. Slightly more title breathing room favors legibility; rendered
spacing still needs visual review. Focus and reduced-motion rules remain in
place, but their browser behavior has not been reverified in this pass.

No personal data was modified. No Desktop app was relaunched, installed,
packaged, replaced, or committed. Concurrent work was preserved.
