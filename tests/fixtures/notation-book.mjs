// A synthetic long piano book, including a mid-book key change. No external assets.
export function notationBook(bars = 256) {
  return `<score-partwise version="4.0"><work><work-title>Long notation QA book</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${Array.from(
    { length: bars },
    (_, i) => {
      const sharp = i >= 128;
      return `<measure number="${i + 1}">${i === 0 ? '<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' : i === 128 ? "<attributes><key><fifths>1</fifths></key></attributes>" : ""}${Array.from({ length: 16 }, (_, j) => `<note><pitch><step>${["C", "D", "E", "F", "G", "A", "B", "C"][j % 8]}</step>${sharp && j % 8 === 3 ? "<alter>1</alter>" : ""}<octave>${j % 8 === 7 ? 5 : 4}</octave></pitch><duration>1</duration><voice>1</voice><type>16th</type><staff>1</staff></note>`).join("")}<backup><duration>16</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type><staff>2</staff></note></measure>`;
    },
  ).join("")}</part></score-partwise>`;
}
