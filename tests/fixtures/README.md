# Independent MusicXML fixtures

Unmodified test scores from OpenSheetMusicDisplay tag **1.9.2**, retained for offline regression testing. Original composer, encoding and source metadata remain in each file. These are QA fixtures, not new built-in lessons. The underlying Bach and Joplin compositions are public domain; the OSMD repository is BSD-3-Clause.

- `Bach-Praeludium.musicxml`: [source](https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/1.9.2/test/data/JohannSebastianBach_PraeludiumInCDur_BWV846_1.xml), SHA-256 `8681e72dc9712a8ea4555135d5752d10ebfb44e84d2f7046434626be10ba43a4`.
- `Joplin-Entertainer.musicxml`: [source](https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/1.9.2/test/data/ScottJoplin_The_Entertainer.xml), SHA-256 `c9fd7cc4e7c260be2bca184b24e112b0810c1c305014964c4fcdbbd5cd6b4b9d`.

The Bach export identifies MuseScore 1.2 and Breitkopf & Härtel 1866 as its source. Checks cover its held lower voices, final chord and late-bar navigation. The Joplin checks cover its two-part layout, key-change passages, repeat warning and final eighth rest. These are bounded checks, not a claim that every symbol in the scores is supported.

`notation-book.mjs` creates an original 256-bar / 4,352-note stress fixture, including a key change at bar 129. It deliberately omits the optional XML declaration to catch URL/string misclassification in notation loading.
