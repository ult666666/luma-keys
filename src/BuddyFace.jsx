import { memo } from "react";

// A face layer drawn over the companion's portrait (same 180-unit box). It
// adds what the portraits lack at buddy size: lids that blink and close in
// sleep, happy arcs, sparkles, heart eyes, an "o" mouth, blush and little
// marks. Every group is hidden by default; `data-eyes`, `data-mouth` and
// `data-fx` on `.buddy` show them (buddy.css), so a new expression is a DOM
// attribute write, never a React render. Strokes are ×1.5 because the buddy
// draws the 180-unit box at 78 px.

// Eyes [cx, cy], eye-white radii, mouth centre, lid (skin) colour, ink,
// cheeks, the skin under the mouth, and the head's transform origin.
export const FACE_GEOMETRY = Object.freeze({
  beethoven: { eyes: [[73, 79], [109, 79]], r: [6.8, 8], mouth: [91, 101], lid: "#f0d1b3", ink: "#39483c", cheeks: [[62, 90], [120, 90]], skin: "#f0d1b3", head: [91, 115] },
  mozart: { eyes: [[72, 78], [108, 78]], r: [6.2, 7], mouth: [90, 101], lid: "#f2d5b9", ink: "#344039", cheeks: [[64, 89], [116, 89]], skin: "#f2d5b9", head: [90, 118] },
  liszt: { eyes: [[74, 79], [106, 79]], r: [6.2, 6.2], mouth: [90, 101], lid: "#edcdb0", ink: "#344039", cheeks: [[66, 90], [114, 90]], skin: "#edcdb0", head: [90, 118] },
  langlang: { eyes: [[73, 79], [109, 79]], r: [6.2, 6.8], mouth: [91, 102], lid: "#f1ccaa", ink: "#344039", cheeks: [[65, 90], [117, 90]], skin: "#f1ccaa", head: [90, 118] },
  cat: { eyes: [[68, 83], [111, 83]], r: [7.2, 9], mouth: [89, 106], lid: "#ddb294", ink: "#4b493f", cheeks: [[59, 97], [120, 97]], skin: "#fff0d9", head: [89, 118] },
  bunny: { eyes: [[68, 83], [111, 83]], r: [7.2, 9], mouth: [89, 106], lid: "#f3e5d3", ink: "#4b493f", cheeks: [[59, 97], [120, 97]], skin: "#fff0d9", head: [89, 118] },
});

const star = (x, y, r) =>
  `M${x} ${y - r}L${x + r * 0.32} ${y - r * 0.32}L${x + r} ${y}L${x + r * 0.32} ${y + r * 0.32}L${x} ${y + r}L${x - r * 0.32} ${y + r * 0.32}L${x - r} ${y}L${x - r * 0.32} ${y - r * 0.32}Z`;
const heart = (x, y, s) =>
  `M${x} ${y + s * 0.42}C${x - s * 0.9} ${y - s * 0.12} ${x - s * 0.5} ${y - s * 0.78} ${x} ${y - s * 0.28}C${x + s * 0.5} ${y - s * 0.78} ${x + s * 0.9} ${y - s * 0.12} ${x} ${y + s * 0.42}Z`;
const spiral = (x, y) =>
  `M${x} ${y}m-1.2 0a1.2 1.2 0 1 1 2.4 0a2.6 2.6 0 1 1 -5.2 0a4 4 0 1 1 8 0`;

function BuddyFace({ character = "cat" }) {
  const g = FACE_GEOMETRY[character] || FACE_GEOMETRY.cat;
  const [rx, ry] = g.r;
  const [mx, my] = g.mouth;
  const sides = ["l", "r"];
  return (
    <svg
      className="bf"
      viewBox="0 0 180 180"
      aria-hidden="true"
      focusable="false"
      fill="none"
      style={{ "--bf-ox": `${g.head[0]}px`, "--bf-oy": `${g.head[1]}px` }}
    >
      <g className="bf-head" strokeLinecap="round" strokeLinejoin="round">
        <g className="bf-blush">
          {g.cheeks.map(([x, y]) => (
            <ellipse key={x} cx={x} cy={y} rx="8" ry="4" fill="#e58f87" opacity=".55" />
          ))}
        </g>
        {g.eyes.map(([x, y], i) => (
          <g key={sides[i]} className={`bf-eye ${sides[i]}`}>
            <ellipse className={`bf-lid ${sides[i]}`} cx={x} cy={y} rx={rx + 0.8} ry={ry + 0.8} fill={g.lid} />
            <path className="bf-lash" d={`M${x - rx} ${y}q${rx} 3.2 ${2 * rx} 0`} stroke={g.ink} strokeWidth="3.3" />
            <path className="bf-arc" d={`M${x - rx} ${y + 2}q${rx} -7.5 ${2 * rx} 0`} stroke={g.ink} strokeWidth="3.6" />
            <path className="bf-sparkle" d={star(x + 1.6, y - 2.2, 2.4)} fill="#fffdf3" />
            <g className="bf-hearts">
              <ellipse cx={x} cy={y} rx={rx + 0.8} ry={ry + 0.8} fill={g.lid} />
              <path d={heart(x, y, 9)} fill="#e2607a" />
            </g>
            <g className="bf-dizzy">
              <ellipse cx={x} cy={y} rx={rx + 0.8} ry={ry + 0.8} fill={g.lid} />
              <path d={spiral(x, y)} stroke={g.ink} strokeWidth="1.6" />
            </g>
          </g>
        ))}
        <g className="bf-mouth-o">
          <ellipse cx={mx} cy={my} rx="11" ry="6" fill={g.skin} />
          <ellipse cx={mx} cy={my + 0.5} rx="3.4" ry="4.2" fill="#7a4b3c" />
        </g>
        <g className="bf-marks" fontFamily="Manrope, -apple-system, sans-serif" fontWeight="800">
          <text className="bf-m-bang" x="138" y="62" fontSize="26" fill="#c2553f">!</text>
          <text className="bf-m-ask" x="136" y="62" fontSize="24" fill="#6c5a8a">?</text>
          <path className="bf-m-sigh" d="M128 70q4-4 8 0t8 0" stroke={g.ink} strokeWidth="2.6" />
          <path className="bf-m-sweat" d="M140 56c-4 6-5 9-2 11s6-2 2-11Z" fill="#8cc7e6" stroke="#5a9bbf" strokeWidth="1" />
          <text className="bf-m-note" x="134" y="58" fontSize="22" fill="#8a6a3c">♪</text>
          <text className="bf-m-purr" x="124" y="60" fontSize="13" fill="#8a6a3c" fontStyle="italic">prrr</text>
          {character === "beethoven" && (
            <path className="bf-m-anger" d="M134 50l4 4m4-4-4 4m-4 4 4-4m4 4-4-4" stroke="#c2553f" strokeWidth="2.4" />
          )}
        </g>
      </g>
      <g className="bf-stars">
        {[0, 1, 2].map((i) => (
          <path key={i} d={star(90, 46, 4.5)} fill="#e7c25a" style={{ "--i": i }} />
        ))}
      </g>
    </svg>
  );
}

export default memo(BuddyFace);
