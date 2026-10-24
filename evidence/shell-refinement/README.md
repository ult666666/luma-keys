# Shell refinement

Source edits: `src/design.css` and `src/shell.css` only. No JSX, stage, key,
note, hand, audio, MIDI, or playback modules were edited by this pass.

- Matte app bar with centered navigation, a quiet inset selection marker,
  unboxed MIDI status, and consistent 34px controls.
- Piece identity and metadata form one block in every view. Titles can occupy
  two lines with ellipsis and retain the existing full-title tooltip. View tabs
  and tools share an aligned row; below 1180px they move below the identity.
- Flat primary actions, restrained transport and dialog surfaces, 8px control
  corners and 12px grouped surfaces. Existing theme tokens remain in use.
- Keyboard focus and reduced motion remain visible and functional. Focus mode
  hides and restores the header correctly.

## Validation

`npm test`: 182 passed, 0 failed. The first sandboxed attempt could not bind
three isolated API test servers; rerunning with local port access passed.
`npm run build`: passed. Prettier checked only the two edited source files.

Visual checks: 1642×927, 1100×800, 1642×680, 900×620, and 390×844;
Practice, Library, Settings; all five themes; long titles; keyboard tab
navigation; reduced motion; focus mode. No page errors or horizontal overflow.
The app's existing vertical scroll remains necessary in very short windows
because the stage retains its minimum height. The transport remains reachable.

The preview used a temporary isolated library and a fresh browser context.
No personal library/settings were changed and no Desktop app was launched,
installed, packaged, or replaced. Other agents' concurrent work was preserved.

## References

- [Baseline](before-desktop.png)
- [Number score](after-desktop.png)
- [Falling notes](after-falling.png)
- [Narrow desktop](after-narrow.png)
- [Short window](after-short.png)
- [Library](after-library.png)
- [Settings](after-settings.png)
- [Layout measurements](visual-qa.json)
- [Unit tests](tests.log)
- [Production build](build.log)

The long-title screenshots use temporary DOM text fixtures over the demo
score, solely to check header layout; no score was imported or changed.
