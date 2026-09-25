// Opening through the first ending, played once. Pitch and rhythm transcribed
// from Mutopia-2015/08/18-931 (public domain), based on Breitkopf & Härtel 1888.
// The source LilyPond file and attribution are retained in docs/sources.
// Each pair is [MIDI pitch (null = rest), duration in sixteenth notes].
const sixteenths = (pitches) => pitches.map((pitch) => [pitch, 1]);
const arpeggio = (pitches) => [...sixteenths(pitches), [null, 1], [null, 2]];
const pickup = [
  [76, 1],
  [75, 1],
];
const flourish = sixteenths([76, 75, 76, 71, 74, 72]);
const melody = (first, tail) => [[first, 2], [null, 1], ...sixteenths(tail)];
const bars = [
  [pickup, [[null, 2]]],
  [flourish, [[null, 6]]],
  [melody(69, [60, 64, 69]), arpeggio([45, 52, 57])],
  [melody(71, [64, 68, 71]), arpeggio([40, 52, 56])],
  [melody(72, [64, 76, 75]), arpeggio([45, 52, 57])],
  [flourish, [[null, 6]]],
  [melody(69, [60, 64, 69]), arpeggio([45, 52, 57])],
  [melody(71, [64, 72, 71]), arpeggio([40, 52, 56])],
  [[[69, 4]], [...sixteenths([45, 52, 57]), [null, 1]]],
];

function xmlNote([midi, duration], staff) {
  const names = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
  const sharp = [1, 3, 6, 8, 10].includes(midi % 12);
  const pitch =
    midi == null
      ? "<rest/>"
      : `<pitch><step>${names[midi % 12]}</step>${sharp ? "<alter>1</alter>" : ""}<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`;
  const type = { 1: "16th", 2: "eighth", 4: "quarter", 6: "quarter" }[duration];
  return `<note>${pitch}<duration>${duration}</duration><voice>${staff}</voice><type>${type}</type>${duration === 6 ? "<dot/>" : ""}<staff>${staff}</staff></note>`;
}

export const eliseXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<work><work-title>Für Elise · opening</work-title></work>
<identification><creator type="composer">Ludwig van Beethoven</creator><rights>Public-domain excerpt, based on Mutopia-2015/08/18-931, typeset by Stelios Samelis. Luma Keys transcription: pickup through first ending, played once.</rights></identification>
<part-list><score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation></score-part></part-list>
<part id="P1">${bars
  .map(([right, left], i) => {
    const duration = right.reduce((total, n) => total + n[1], 0);
    return `<measure number="${i}"${i === 0 || i === bars.length - 1 ? ' implicit="yes"' : ""}>${i === 0 ? `<attributes><divisions>4</divisions><key><fifths>0</fifths><mode>minor</mode></key><time><beats>3</beats><beat-type>8</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction><direction-type><words>Poco moto · opening excerpt</words></direction-type><staff>1</staff><sound tempo="72"/></direction>` : ""}${right.map((n) => xmlNote(n, 1)).join("")}<backup><duration>${duration}</duration></backup>${left.map((n) => xmlNote(n, 2)).join("")}${i === bars.length - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : ""}</measure>`;
  })
  .join("\n")}</part></score-partwise>`;
