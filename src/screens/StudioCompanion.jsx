import MaestroAvatar from "../MaestroAvatar.jsx";
const INK = "#51534b";
const FUR = "#dfb397";
const CREAM = "#f6e8d3";
const SAGE = "#9eaf96";
const LILAC = "#b9aec8";

// Flat, decorative artwork. Movement is optional and belongs to the stylesheet.
function PetDrawing({ kind = "cat", happy = false, resting = false }) {
  const bunny = kind === "bunny";
  return (
    <g
      className={`companion-pet-drawing companion-${bunny ? "bunny" : "cat"}`}
      fill={bunny ? CREAM : FUR}
      stroke={INK}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse
        cx="93"
        cy="145"
        rx="65"
        ry="6"
        fill="#d3ccbd"
        stroke="none"
        opacity=".45"
      />
      {bunny ? (
        <circle
          className="companion-tail"
          cx="141"
          cy="121"
          r="12"
          fill="#f8eddb"
        />
      ) : (
        <path
          className="companion-tail"
          d="M128 137c24 0 35-12 31-24-3-9-14-9-16-2-2 5 2 8 6 7"
          fill="none"
          stroke={FUR}
          strokeWidth="13"
        />
      )}
      <path
        d={
          resting
            ? "M51 110c7-21 30-30 57-20 23 8 39 25 33 44-4 13-41 13-62 9-22-3-36-14-28-33Z"
            : "M65 83c-14 18-20 34-14 50 6 16 26 12 40 11 18 4 45 3 47-11 3-16-7-38-24-51Z"
        }
      />
      {!resting && (
        <path
          d="M80 94c-9 14-13 31-7 44h36c7-18 2-34-7-45"
          fill={CREAM}
          stroke="none"
        />
      )}
      <g
        className="companion-head"
        transform={resting ? "translate(-5 33) rotate(-7 83 71)" : undefined}
      >
        {bunny ? (
          <>
            <g className="companion-ear">
              <path d="M67 53C43 30 48 4 59 7c12 3 17 27 18 43" />
              <path
                d="M65 39c-7-11-10-20-8-24"
                fill="none"
                stroke="#d9b6ac"
                strokeWidth="5"
              />
            </g>
            <g className="companion-ear companion-ear-far">
              <path d="M89 50C86 23 101 2 110 10c10 9-4 31-11 44" />
              <path
                d="M97 38c3-12 6-18 10-21"
                fill="none"
                stroke="#d9b6ac"
                strokeWidth="5"
              />
            </g>
            <path d="M52 67c1-18 17-24 37-22 20 1 32 15 29 33-2 17-17 24-37 22-19-2-32-15-29-33Z" />
          </>
        ) : (
          <>
            <path d="M52 70 49 38c1-4 4-4 7-2l20 14c10-2 16-1 23 1l21-15c3-2 6-1 5 3l-3 35c-1 19-16 27-36 26-21 0-35-11-34-30Z" />
            <path
              className="companion-ear"
              d="m56 46 1 16 12-8Z"
              fill="#d68f7d"
              stroke="none"
            />
            <path
              className="companion-ear companion-ear-far"
              d="m118 46-12 9 10 8Z"
              fill="#d68f7d"
              stroke="none"
            />
            <path d="m81 48 2 8m9-7-1 7" stroke="#bc8e73" strokeWidth="3" />
          </>
        )}
        <ellipse cx="86" cy="81" rx="19" ry="12" fill={CREAM} stroke="none" />
        <g className="companion-eye" fill="none" strokeWidth="2">
          {happy ? (
            <path d="m66 70 4-3 4 3m25 0 4-3 4 3" />
          ) : resting ? (
            <path d="M65 71q5 5 10 0m23 0q5 5 10 0" />
          ) : (
            <path d="M71 70v3m31-3v3" />
          )}
        </g>
        <path d="m82 79 4 3 4-3Z" fill={INK} stroke="none" />
        <path d="M86 82v4m-5 0q5 5 10 0" fill="none" strokeWidth="1.4" />
        {!bunny && (
          <path
            d="m60 81-11-2m11 7-10 2m63-7 12-2m-12 7 11 2"
            strokeWidth="1.2"
          />
        )}
        <ellipse
          cx="64"
          cy="81"
          rx="5"
          ry="2.5"
          fill="#d89988"
          stroke="none"
          opacity=".65"
        />
        <ellipse
          cx="109"
          cy="81"
          rx="5"
          ry="2.5"
          fill="#d89988"
          stroke="none"
          opacity=".65"
        />
      </g>
      <g className="companion-paw">
        <path
          d={
            resting
              ? "M68 133c-10-7-22-3-22 4 0 7 17 6 29 5"
              : "M69 116c-5 7-6 14-5 22 1 7 16 7 18 1l2-18"
          }
        />
        <path
          d={resting ? "m53 136 1 4m5-5 1 6" : "m69 138 1 4m5-4v5"}
          strokeWidth="1.2"
        />
      </g>
      <path
        d={
          resting
            ? "M89 139c11 5 28 5 32 0"
            : "M107 121c5 7 10 13 7 19-2 5-17 6-20 0"
        }
      />
      {!resting && <path d="m101 140 1 3m6-4v4" strokeWidth="1.2" />}
    </g>
  );
}

export function CompanionPet({
  kind = "cat",
  happy = false,
  className = "",
  ...svgProps
}) {
  return (
    <svg
      viewBox="0 0 180 160"
      className={`companion-pet${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      focusable="false"
      {...svgProps}
    >
      <PetDrawing kind={kind} happy={happy} />
    </svg>
  );
}

function LibraryScene({ kind }) {
  return (
    <>
      <path d="M56 157h231" stroke="#bbb7a8" />
      <g stroke={INK} strokeWidth="1.5" strokeLinejoin="round">
        <path d="M67 139h116v12H64q-7-6 3-12Z" fill={SAGE} />
        <path d="M70 129h114v10H70q-7-4 0-10Z" fill={LILAC} />
        <path d="M79 143h98m-99 4h83" stroke="#e5e8dd" />
      </g>
      <g className="studio-figure" transform="translate(33 1) scale(.94)">
        <PetDrawing kind={kind} resting />
      </g>
      <g
        className="companion-score"
        stroke={INK}
        strokeWidth="1.4"
        strokeLinejoin="round"
      >
        <path d="m226 87 34-11 17 69-35 11-39-5 3-70Z" fill="#fffaf0" />
        <path d="m226 87 16 69" fill="none" />
        <path
          d="m213 96 14 2m-16 7 18 2m-17 7 18 2m4-18 21-7m-18 16 20-7m-18 16 20-7"
          fill="none"
          stroke="#b6b6a7"
        />
        <path
          d="m237 125 6-2m10 6 5-2m-42 0 8 1m-5 10 7 1"
          stroke="#769480"
          strokeWidth="3"
        />
        <path d="m246 80 4 18 4-5 6 2-4-18" fill={LILAC} stroke="none" />
      </g>
    </>
  );
}

function ExerciseScene({ kind }) {
  return (
    <>
      <path d="M37 157h255" stroke="#bbb7a8" />
      <g className="studio-figure" transform="translate(30 9) scale(.96)">
        <PetDrawing kind={kind} />
      </g>
      <g
        className="companion-counter"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <path d="m224 64-21 81h60l-22-81Z" fill={LILAC} />
        <path d="m228 73-15 61h39l-16-61Z" fill="#faf5e9" />
        <path d="m233 125 17-55" fill="none" strokeWidth="2" />
        <path d="m242 85 8 2-2 8-8-2Z" fill={SAGE} />
        <circle cx="233" cy="125" r="3" fill={INK} />
        <path d="M208 151h50" strokeWidth="3" />
      </g>
      <g fill={SAGE} stroke={INK} strokeWidth="1.2">
        <circle cx="171" cy="145" r="5" />
        <circle cx="185" cy="145" r="5" />
        <circle cx="178" cy="132" r="5" fill={FUR} />
      </g>
      <path
        d="M192 78q10-14 24-10"
        fill="none"
        stroke="#a4aa99"
        strokeLinecap="round"
        strokeDasharray="2 5"
      />
    </>
  );
}

function ProgressScene({ kind }) {
  return (
    <>
      <path d="M36 157h255" stroke="#bbb7a8" />
      <g className="studio-figure" transform="translate(27 9) scale(.96)">
        <PetDrawing kind={kind} happy />
      </g>
      <g
        className="companion-garden"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <path d="m212 127 4 24h29l4-24Z" fill={FUR} />
        <path d="M209 124h43v7h-43Z" fill="#ead0b8" />
        <path d="M231 125V77m0 27-17-15m17 3 15-14" fill="none" />
        <path d="M230 104c-16 0-24-9-21-18 12-1 21 4 21 18Z" fill={SAGE} />
        <path d="M232 91c-1-14 8-23 21-22 1 11-7 21-21 22Z" fill="#bac5a5" />
        <path d="M231 79c-11-8-11-20-4-26 10 5 13 16 4 26Z" fill={SAGE} />
        <path d="m264 137 3 14h18l3-14Z" fill={LILAC} />
        <path d="M276 137v-14m0 4-7-6" fill="none" />
        <path
          d="M275 128c-10 0-14-6-11-12 7 0 12 4 11 12Zm2-5c-1-9 5-15 12-14 0 8-5 14-12 14Z"
          fill={SAGE}
        />
      </g>
    </>
  );
}

// Where the roaming companion sits when it visits this header (contract C4).
// The box is the figure's size; its bottom edge is the floor it stands on.
export function HeaderSeat() {
  return (
    <span className="buddy-seat" data-buddy-seat="header" aria-hidden="true" />
  );
}

export default function StudioCompanion({ scene = "library", kind = "cat" }) {
  if (["beethoven", "langlang", "mozart", "liszt"].includes(kind)) {
    return (
      <div
        className="studio-companion salon-scene"
        data-scene={scene}
        aria-hidden="true"
      >
        <div className="salon-scene-frame">
          <span className="salon-scene-window" />
          <HeaderSeat />
          <MaestroAvatar
            character={kind}
            mood={scene === "progress" ? "celebrate" : "idle"}
          />
          <div className="salon-scene-keys">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="studio-companion" data-scene={scene} aria-hidden="true">
      <HeaderSeat />
      <svg viewBox="0 0 320 180" focusable="false">
        <path
          d="M51 134C26 104 57 43 113 38c49-5 58 26 90 16 59-18 106 42 81 77-22 31-69 16-116 25-51 9-94 5-117-22Z"
          fill={
            scene === "exercises"
              ? "#e9e2ec"
              : scene === "progress"
                ? "#e2e7d9"
                : "#eee1d1"
          }
        />
        {scene === "exercises" ? (
          <ExerciseScene kind={kind} />
        ) : scene === "progress" ? (
          <ProgressScene kind={kind} />
        ) : (
          <LibraryScene kind={kind} />
        )}
      </svg>
    </div>
  );
}
