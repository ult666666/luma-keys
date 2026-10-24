import { memo } from "react";
import BeethovenAvatar from "./BeethovenAvatar.jsx";
import "./maestro-avatar.css";

const CHARACTERS = new Set(["beethoven", "mozart", "liszt", "langlang"]);
const MOODS = new Set(["idle", "listening", "conducting", "celebrate"]);

// A shared drawing vocabulary; the hair, proportions, dress and pose are
// different for each portrait. There are no SVG definitions or global IDs.
function Features({ cx = 90, y = 78, spread = 18, eyeHeight = 7, smile = 6 }) {
  return (
    <>
      <g className="maestro-eyes">
        {[cx - spread, cx + spread].map((x) => (
          <g key={x}>
            <ellipse
              cx={x}
              cy={y}
              rx="6.2"
              ry={eyeHeight}
              fill="#fff6e6"
              stroke="none"
            />
            <ellipse
              cx={x + 0.7}
              cy={y + 0.8}
              rx="3.5"
              ry={eyeHeight - 1.8}
              fill="#344039"
              stroke="none"
            />
            <circle
              cx={x + 1.5}
              cy={y - 1.7}
              r="1.15"
              fill="#fffef7"
              stroke="none"
            />
          </g>
        ))}
      </g>
      <g className="maestro-smiling-eyes" stroke="#344039" strokeWidth="2.5">
        <path
          d={`M${cx - spread - 5} ${y + 2}q5-6 10 0m${spread * 2 - 10} 0q5-6 10 0`}
        />
      </g>
      <ellipse
        cx={cx - spread - 8}
        cy={y + 11}
        rx="6.5"
        ry="3"
        fill="#ce8f79"
        opacity=".38"
        stroke="none"
      />
      <ellipse
        cx={cx + spread + 8}
        cy={y + 11}
        rx="6.5"
        ry="3"
        fill="#ce8f79"
        opacity=".38"
        stroke="none"
      />
      <path d={`m${cx} ${y + 4}-2 7 4 1`} stroke="#bd9376" strokeWidth="1.3" />
      <path
        d={`M${cx - 10} ${y + 20}q10 ${smile} 20-1`}
        stroke="#865d4d"
        strokeWidth="1.8"
      />
    </>
  );
}

function PrintedScore({ transform }) {
  return (
    <g className="maestro-score" transform={transform}>
      <path
        d="M0 0c10 0 16 2 22 6l13-5 7 31-15 7c-8-5-14-7-24-7Z"
        fill="#f8f2e3"
      />
      <path d="m22 6 5 33" stroke="#b8b7a1" strokeWidth="1.1" />
      <path
        d="m7 9 10 3m-9 2 10 3m-9 2 10 3m8-8 6-2m-5 7 6-2m-5 7 6-2"
        stroke="#a2ad97"
        strokeWidth="1"
      />
      <path d="m12 22 1-8m18 12-1-7" stroke="#67765f" strokeWidth="1.1" />
      <ellipse
        cx="10"
        cy="22"
        rx="2.5"
        ry="1.6"
        fill="#67765f"
        stroke="none"
        transform="rotate(-15 10 22)"
      />
      <ellipse
        cx="29"
        cy="26"
        rx="2.5"
        ry="1.6"
        fill="#67765f"
        stroke="none"
        transform="rotate(-15 29 26)"
      />
    </g>
  );
}

function MozartPortrait() {
  return (
    <>
      <g className="maestro-coat">
        <path
          d="M65 115c-16 4-22 19-22 37l-7 18c14 7 34 7 53 3 18 4 39 4 53-3l-7-21c-1-17-8-29-22-34Z"
          fill="#725e70"
        />
        <path d="m72 118 18 9 17-9 5 56c-15 4-29 4-42 0Z" fill="#eee1c7" />
        <path
          d="m71 119-13 10 8 12-9 13m53-35 14 10-8 12 9 13"
          stroke="#b6a17b"
          strokeWidth="1.4"
        />
        <path
          d="m53 140-3 12 7-3m73-9 3 12-7-3m-66 9-6 8m71-8 6 8"
          stroke="#c6ae81"
          strokeWidth="1.1"
        />
        <path d="M89 135v36" stroke="#cab695" strokeWidth="1.2" />
        {[143, 153, 163].map((y) => (
          <circle key={y} cx="96" cy={y} r="1.7" fill="#bca06e" stroke="none" />
        ))}
      </g>
      <g className="maestro-playing-arm">
        <path
          d="M57 126c-8 0-17 8-24 9l-7-14-11 5 9 23c2 5 9 3 16 0l21-9"
          fill="#80677a"
        />
        <path d="m17 127 12-6-5-8-11 6Z" fill="#f6ead6" />
        <path
          d="M16 121c-6-2-6-8-3-11 3-4 7-3 10 1l4 8c-3 5-7 6-11 2Z"
          fill="#f1d0b2"
        />
        <path d="m20 116-8-31" stroke="#f7f0dc" strokeWidth="4" />
        <path d="m20 116-8-31" stroke="#6f624c" strokeWidth="1" />
        <path d="m16 113 5 2" stroke="#c79b7e" strokeWidth="1.2" />
        <path d="m47 136 5-3" stroke="#baa181" strokeWidth="1.2" />
      </g>
      <g className="maestro-score-arm">
        <path d="M121 124c9 4 16 13 20 25l-12 8-15-19" fill="#80677a" />
        <PrintedScore transform="translate(117 131)" />
        <path d="M128 153c-4-3-8-1-7 3l2 6c1 4 9 3 10-1" fill="#f1d0b2" />
        <path d="m124 157 3 5" stroke="#c79b7e" strokeWidth="1.1" />
      </g>
      <path d="m74 112 15 8 17-8 4 12-13 7-8-4-8 4-12-7Z" fill="#fff5e2" />
      <path
        d="m86 126-5 6 8 4-6 6 9 4 8-5-7-5 8-6-10-5"
        fill="#f8edda"
        stroke="#cbbb9a"
        strokeWidth="1.2"
      />
      <g className="maestro-head">
        <path d="M123 82c23 3 20 28 33 37-15 5-29-2-29-17" fill="#d8d6c7" />
        <path d="m137 104 10-9 3 12 10 8-14 3-8-8-8 6 1-12Z" fill="#655368" />
        <path
          d="M40 67c-14-14-6-35 9-38-1-16 18-20 30-15 11-13 32-10 38 1 15-3 29 8 25 21 13 9 15 29 3 42l-11 33-15 7H64l-21-12Z"
          fill="#d8d8c8"
        />
        <path
          d="M50 57c-9-4-14 6-9 16 2 5 6 7 10 6m77-22c9-4 14 6 9 16-2 5-6 7-10 6"
          fill="#ebc7ab"
        />
        <path
          d="M51 50c3-17 18-24 39-24s36 9 39 26l1 27c0 23-18 40-40 40S49 103 49 79Z"
          fill="#f2d5b9"
        />
        <path
          d="M53 93c7 13 19 20 37 20s29-7 37-20c-4 18-19 27-37 27S58 111 53 93Z"
          fill="#eac4a9"
          stroke="none"
        />
        <path
          d="M45 57c-5-19 3-31 20-34 10-15 26-11 29 0 12-12 31-7 34 7 14 3 17 19 10 32l-13 3c-1-11-8-17-15-21-7 5-17 3-21-4-5 8-15 10-24 6-7 7-9 12-9 18Z"
          fill="#eeebdc"
        />
        <path
          d="M58 35c7-6 14-5 20 0m22-6c7-5 13-3 18 3m-27-6-3 8"
          stroke="#b2b6a4"
          strokeWidth="1.4"
        />
        {[62, 80, 98].map((y, i) => (
          <g key={y}>
            <path
              d={`M${46 - i} ${y - 9}c-17-4-18 20-2 20 11 0 13-14 4-15-6-1-8 7-3 8`}
              fill="#e8e5d5"
              stroke="#929d8a"
              strokeWidth="1.5"
            />
            <path
              d={`M${134 + i} ${y - 9}c17-4 18 20 2 20-11 0-13-14-4-15 6-1 8 7 3 8`}
              fill="#e8e5d5"
              stroke="#929d8a"
              strokeWidth="1.5"
            />
          </g>
        ))}
        <path
          d="M63 66q8-5 16-1m23 0q8-4 16 1"
          stroke="#8e8972"
          strokeWidth="2.5"
        />
        <Features cx={90} y={78} spread={18} smile={7} />
        <path d="M85 107q5 2 10 0" stroke="#d1a98b" strokeWidth="1.1" />
      </g>
    </>
  );
}

function LisztPortrait() {
  return (
    <>
      <g className="maestro-coat">
        <path
          d="M70 115c-18 7-24 25-24 39l-7 18c14 3 34 2 51 1 18 2 34 3 48-1l-6-21c-3-18-10-30-22-36Z"
          fill="#343b38"
        />
        <path d="m76 115 14 10 14-10-2 43H82Z" fill="#efeadc" />
        <path
          d="m69 119-9 12 13 8-8 10 22 23m23-53 12 13-13 7 8 11-19 22"
          fill="#47504b"
        />
        <path d="m86 125-4 7 8 7 8-7-5-7Z" fill="#383d39" />
        <path d="m88 138-3 20 7 8 4-8-4-20" fill="#454b44" />
        <circle cx="98" cy="169" r="1.8" fill="#989b87" stroke="none" />
      </g>
      <g className="maestro-playing-arm">
        <path
          d="M60 126c-11 4-14 12-23 15l-4-16-13 2 7 25c1 5 7 5 14 1l23-14"
          fill="#434d46"
        />
        <path d="m21 130 13-4-3-9-12 3Z" fill="#f4ead7" />
        <path
          d="M22 124c-7-2-7-8-3-12 3-3 7-2 9 2l5 8c-3 5-8 6-11 2Z"
          fill="#eac5a6"
        />
        <path d="m27 120-8-34" stroke="#f6eedb" strokeWidth="4" />
        <path d="m27 120-8-34" stroke="#72644d" strokeWidth="1" />
        <path d="m22 116 5 2" stroke="#bd9275" strokeWidth="1.1" />
      </g>
      <g className="maestro-score-arm">
        <path d="M117 127c12 2 18 13 22 24l-13 9-14-23" fill="#434d46" />
        <PrintedScore transform="translate(117 134) scale(.9)" />
        <path d="M128 156c-4-3-8-1-7 3l2 6c1 4 9 3 10-1" fill="#eac5a6" />
        <path d="m125 159 3 5" stroke="#bd9275" strokeWidth="1.1" />
      </g>
      <g className="maestro-head">
        <path
          d="M42 68c-1-30 16-53 47-55 34-1 51 22 51 49-1 26 1 60 14 81-13 2-22-1-30-8l-17-14H72l-17 14c-8 6-18 7-29 6 15-21 16-48 16-73Z"
          fill="#b5bab1"
        />
        <path
          d="M59 61c-9-4-12 5-8 15 2 5 5 7 9 6m62-21c9-4 12 5 8 15-2 5-5 7-9 6"
          fill="#e6bea0"
        />
        <path
          d="M59 46c6-14 18-20 31-20 17 0 30 8 33 23l-1 32c-1 18-14 37-32 40-19-3-31-19-32-40Z"
          fill="#edcdb0"
        />
        <path
          d="M60 90c9 15 16 22 30 25 15-3 22-11 30-25-5 18-17 30-30 32-14-2-24-14-30-32Z"
          fill="#dfb99c"
          stroke="none"
        />
        <path
          d="M88 21c-24-4-37 13-39 37 1 31-5 51-12 68l17-8c5-26 4-46 11-66 6-16 16-18 23-31Z"
          fill="#d5d6cb"
        />
        <path
          d="M92 21c24-3 38 15 39 36-1 31 5 52 13 69l-17-7c-6-27-5-47-12-67-5-15-15-20-23-31Z"
          fill="#e1dfd1"
        />
        <path
          d="M75 28c-14 12-19 35-21 65m52-65c15 14 18 34 20 64M48 105l-5 16m90-15 5 16"
          stroke="#98a291"
          strokeWidth="1.4"
        />
        <path
          d="M66 67q6-4 13-1m23 0q7-3 13 1"
          stroke="#7b8171"
          strokeWidth="2.5"
        />
        <Features cx={90} y={79} spread={16} eyeHeight={6.2} smile={4} />
        <path
          d="M68 92l4 2m38 0 4-2m-31 14q7 3 14 0"
          stroke="#bd967b"
          strokeWidth="1"
          opacity=".65"
        />
      </g>
    </>
  );
}

function LangLangPortrait() {
  return (
    <>
      <g className="maestro-coat">
        <path
          d="M65 114c-18 6-24 25-25 40l-5 17c16 5 35 5 55 2 18 3 38 3 55-2l-7-18c-2-18-9-33-24-39Z"
          fill="#344956"
        />
        <path d="m75 115 16 7 15-7 1 49H75Z" fill="#f1ebdc" />
        <path
          d="m67 117-9 16 16 8-8 10 21 21m27-55 12 16-16 8 8 10-20 21"
          fill="#465e6a"
        />
        <path d="m89 122-11-4 1 13 10-3 11 3 2-13-11 4Z" fill="#3c4546" />
        <path d="M92 132v25" stroke="#c9c6b5" strokeWidth="1" />
        <circle cx="95" cy="143" r="1.3" fill="#6f7974" stroke="none" />
        <circle cx="95" cy="152" r="1.3" fill="#6f7974" stroke="none" />
      </g>
      <g className="maestro-playing-arm">
        <path
          d="M59 126c-10 2-15 10-25 11l-6-14-12 5 9 23c2 4 8 5 14 2l24-13"
          fill="#465e6a"
        />
        <path d="m19 132 13-5-4-9-13 5Z" fill="#f4eddf" />
        <path
          d="M19 126c-5-3-9-8-9-13 0-3 3-4 5-1l4 5-4-13c-1-4 3-6 5-2l5 13-1-13c0-4 4-5 5-1l3 20c1 6-7 9-13 5Z"
          fill="#efc7a5"
        />
        <path d="m24 115 2 7m-9-5 4 5" stroke="#bc9072" strokeWidth="1.1" />
      </g>
      <g className="maestro-piano">
        <path d="m65 151 84 4 11 18-99-3Z" fill="#2a3d41" />
        <path
          d="m70 154 77 4 6 11-86-3Z"
          fill="#f0ebd9"
          stroke="#73817b"
          strokeWidth="1.2"
        />
        <path
          d="m78 155-1 11m11-10-1 10m11-10-1 11m11-10-1 11m11-11 1 11m9-10 1 10m9-10 2 10"
          stroke="#a2a798"
          strokeWidth="1"
        />
        <path
          d="M80 155l4 .3 .2 6 -4 -.2ZM90 155.6l4 .2 .2 6 -4 -.2ZM110 156.6l4 .2 .3 6 -4 -.2ZM120 157l4 .2 .5 6 -4 -.2ZM130 157.6l4 .2 .7 6 -4 -.2Z"
          fill="#334342"
          stroke="none"
        />
      </g>
      <g className="maestro-score-arm">
        <path d="M122 126c7 4 15 12 18 22l-11 6-15-18" fill="#465e6a" />
        <path d="m127 147 12-4 4 9-12 5Z" fill="#f5eddd" />
        <path
          d="M133 152c-4-2-8-4-12-3l-10 5c-4 2-2 5 1 4l7-2-4 4c-2 3 1 5 4 3l5-4-2 3c-1 3 2 4 4 2l6-6c6 4 10 0 8-3Z"
          fill="#efc7a5"
        />
      </g>
      <g className="maestro-head">
        <path
          d="M45 58c-13-1-14 9-8 19 3 5 7 6 12 5m87-24c12-1 14 9 8 19-3 5-7 6-12 5"
          fill="#e8bb97"
        />
        <path
          d="M47 44c8-20 28-26 47-24 24 1 39 14 42 36l1 26c-1 24-20 38-46 39-26-1-46-15-46-39Z"
          fill="#f1ccaa"
        />
        <path
          d="M49 94c8 14 21 22 42 22 20 0 34-8 42-22-3 18-20 28-42 28-21 0-38-10-42-28Z"
          fill="#e6b794"
          stroke="none"
        />
        <path
          d="M44 78c-7-11-11-28-5-40 3-10 10-17 22-19 9-13 28-15 38-9 12-5 29 1 33 12 16 4 20 19 14 34-1 10-5 18-12 24l-5-24-10-13c-16 15-37 13-48 5L55 61l-6 23Z"
          fill="#2e3738"
        />
        <path
          d="M49 42c14-12 29-10 42-17 10-5 20-7 30-2M64 43c17 2 30-2 42-11m27 9 5 16"
          stroke="#60716e"
          strokeWidth="2"
          opacity=".7"
        />
        <path
          d="m60 36 8-5m47-6 7 2"
          stroke="#8b9790"
          strokeWidth="1.1"
          opacity=".55"
        />
        <path
          d="M62 67q8-5 17-1m23 0q8-4 17 2"
          stroke="#4a4c44"
          strokeWidth="3"
        />
        <Features cx={91} y={79} spread={18} eyeHeight={6.8} smile={8} />
        <path d="M84 107q7 3 14-1" stroke="#d39d7c" strokeWidth="1.1" />
      </g>
    </>
  );
}

function MaestroAvatar({
  character = "beethoven",
  mood = "idle",
  className = "",
  ...svgProps
}) {
  const artist = CHARACTERS.has(character) ? character : "beethoven";
  const expression = MOODS.has(mood) ? mood : "idle";
  const classes = `maestro-avatar maestro-${artist}${className ? ` ${className}` : ""}`;
  if (artist === "beethoven") {
    return (
      <BeethovenAvatar
        {...svgProps}
        mood={expression}
        className={classes}
        data-character={artist}
      />
    );
  }
  return (
    <svg
      {...svgProps}
      viewBox="0 0 180 180"
      className={`beethoven-avatar ${classes}`}
      data-character={artist}
      data-mood={expression}
      aria-hidden="true"
      focusable="false"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="90" cy="173" rx="57" ry="4.5" fill="#657866" opacity=".13" />
      <g
        stroke="#4b5148"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {artist === "mozart" ? (
          <MozartPortrait />
        ) : artist === "liszt" ? (
          <LisztPortrait />
        ) : (
          <LangLangPortrait />
        )}
      </g>
    </svg>
  );
}

export default memo(MaestroAvatar);
