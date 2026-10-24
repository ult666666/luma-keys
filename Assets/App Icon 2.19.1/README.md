# Luma Keys app icon

Original editable vector artwork, drawn for Luma Keys: an ivory cat with paws on a five-key piano, on a deep teal tile with a muted brass rail. No image-generation model or external artwork was used. The old cat and star icon is retained here for comparison.

- `Luma Keys.svg`: detailed master.
- `Luma Keys Small.svg`: simplified browser/small-size mark.
- `Luma Keys.png`:1024×1024 transparent PNG.
- `Luma Keys.icns`: macOS icon with all ten16–1024pixel representations.
- `Luma Keys.iconset/`: individual native PNG exports;16/32pixel exports use the simplified mark.

Sources used by the app are `public/app-icon.svg`, `public/favicon.svg`, `public/icon.png` and `public/icon.icns`. Run `npm run build:icon` after editing the vector masters to regenerate the exports. The icon renderer uses a new Chromium page for each size to avoid stale resized compositor tiles.

Design reference: Apple's [App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons) guidance on simple recognizable shapes and small-size legibility. This Electron build uses the legacy multiresolution ICNS format, not an Icon Composer layered asset.
