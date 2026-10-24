# Companion artwork

Six original stylized illustrations used by Luma Keys. Each file is a standalone, transparent SVG with a static neutral expression and no external assets, fonts or stylesheets. They can be resized without losing detail.

| Portrait | SVG | Source artwork | Original viewBox |
| --- | --- | --- | --- |
| Beethoven | [Beethoven.svg](<Beethoven.svg>) | [src/BeethovenAvatar.jsx](../../src/BeethovenAvatar.jsx) | 0 0 180 180 |
| Lang Lang | [Lang Lang.svg](<Lang Lang.svg>) | [src/MaestroAvatar.jsx](../../src/MaestroAvatar.jsx) | 0 0 180 180 |
| Mozart | [Mozart.svg](<Mozart.svg>) | [src/MaestroAvatar.jsx](../../src/MaestroAvatar.jsx) | 0 0 180 180 |
| Liszt | [Liszt.svg](<Liszt.svg>) | [src/MaestroAvatar.jsx](../../src/MaestroAvatar.jsx) | 0 0 180 180 |
| Luma | [Luma.svg](<Luma.svg>) | [src/screens/StudioCompanion.jsx](../../src/screens/StudioCompanion.jsx) | 0 0 180 160 |
| Mochi | [Mochi.svg](<Mochi.svg>) | [src/screens/StudioCompanion.jsx](../../src/screens/StudioCompanion.jsx) | 0 0 180 160 |

All files declare a 180 × 180 pixel size. The original viewBox is preserved: the cat and bunny drawings use 180 × 160 and are centered by SVG's default aspect-ratio behavior.

The app selects these drawings through [CompanionPortrait.jsx](../../src/CompanionPortrait.jsx). Listening, conducting and celebration animations remain in the app; these exported files are static.

Regenerate from the Luma Keys project folder:

```sh
node scripts/export-companion-art.mjs
```

The script renders the existing React artwork in memory, validates the SVG markup and path geometry, and replaces only these six SVG files and this README. It uses the project's installed esbuild, React and fast-xml-parser packages; it does not build or launch the app.
