import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import {
  deriveHandCoach,
  coachGuidance,
  NEXT_WITHIN_SECONDS,
} from "./hand-coach.mjs";
import { secondsBetween } from "./tempo.mjs";
import { focusedByPointer, restoreFocus } from "./focus-intent.mjs";

const NAMES = ["Thumb", "Index", "Middle", "Ring", "Little"];
const signature = (coach) =>
  ["left", "right"]
    .map((hand) => {
      const c = coach[hand];
      const soon = c.gapSeconds != null && c.gapSeconds < NEXT_WITHIN_SECONDS;
      return `${hand}:${c.state}:${soon ? "soon" : ""}:${[...c.current, ...c.upcoming].map((n) => `${n.midi}/${n.finger}/${n.phase}/${n.beat}`).join(",")}`;
    })
    .join("|");

// Each hand's next attack in real seconds at the practice speed (null
// without a score to time it).
function timed(coach, beat, score, speed) {
  for (const hand of ["left", "right"]) {
    const c = coach[hand];
    c.gapSeconds =
      c.gapBeats == null || !score
        ? null
        : secondsBetween(score, beat, beat + c.gapBeats, speed);
  }
  return coach;
}

// A quiet explanation of the same score clock used by the hands. Its state
// changes only at musical events, without re-rendering the keyboard each frame.
export default function HandCoach({
  notes,
  fingering,
  clock,
  beat,
  flats,
  playing,
  mode,
  score = null,
  speed = 1,
  onHelpChange,
}) {
  const latest = useRef({ notes, fingering, clock, beat, flats, score, speed });
  const last = useRef("");
  const [coach, setCoach] = useState(() =>
    timed(
      deriveHandCoach(notes, fingering, beat, { flats }),
      beat,
      score,
      speed,
    ),
  );
  const dialog = useRef();
  const helpOpen = useRef(false);
  // Opened with a click, the guide hands focus back as a click, so Space
  // plays afterwards instead of opening the guide again.
  const helpButton = useRef();
  const helpByPointer = useRef(false);
  const helpChange = useRef(onHelpChange);
  useLayoutEffect(() => {
    helpChange.current = onHelpChange;
  });
  useEffect(
    () => () => {
      // Removing an open native dialog does not fire a close event. Settings
      // restoration can hide this whole guide, so also release the input guard.
      if (helpOpen.current) helpChange.current?.(false);
    },
    [],
  );
  const [selected, setSelected] = useState(1);
  const update = () => {
    const s = latest.current;
    const now = s.clock ? s.clock() : s.beat;
    const next = timed(
      deriveHandCoach(s.notes, s.fingering, now, { flats: s.flats }),
      now,
      s.score,
      s.speed,
    );
    const key = signature(next) + s.flats;
    if (key !== last.current) {
      last.current = key;
      setCoach(next);
    }
  };
  useLayoutEffect(() => {
    latest.current = { notes, fingering, clock, beat, flats, score, speed };
    update();
  }, [notes, fingering, clock, beat, flats, score, speed]);
  useEffect(() => {
    let raf,
      previous = -Infinity;
    const tick = (t) => {
      if (t - previous >= 70) {
        previous = t;
        update();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const action = (phase) =>
    phase === "hold"
      ? "Hold"
      : phase === "next"
        ? "Next"
        : mode === "wait" || playing
          ? "Play"
          : "Place";
  return (
    <>
      <div className="hand-coach" role="region" aria-label="Hand guidance">
        {["left", "right"].map((hand) => {
          const c = coach[hand];
          if (!c.hasNotes) return null;
          // A repeated voicing needs one new-attack cue, not a second copy of
          // every note. Mixed holds or any changed pitch/finger stay explicit.
          const { notes, repeat } = coachGuidance(c, c.gapSeconds);
          const actions = [...new Set(notes.map((n) => action(n.phase)))];
          const repeatLabel = repeat
            ? `Next, repeat ${repeat.map((n) => `${n.label} with suggested finger ${n.finger}, ${n.fingerName}`).join("; ")}. Play again at the next attack.`
            : null;
          return (
            <div
              className="coach-hand"
              role="group"
              data-hand={hand}
              data-state={c.state}
              aria-label={`${hand === "left" ? "Left" : "Right"} hand`}
              key={hand}
            >
              <span className="coach-hand-label" aria-hidden="true">
                {hand === "left" ? "L" : "R"}
              </span>
              {actions.length > 0 && (
                <span className="coach-hand-action" aria-hidden="true">
                  {actions.join(" / ")}
                </span>
              )}
              <div className="coach-notes">
                {notes.length ? (
                  notes.map((n) => (
                    <span
                      className="coach-note"
                      role="img"
                      key={`${n.phase === "next" ? "next" : "now"}-${n.midi}`}
                      data-midi={n.midi}
                      data-phase={n.phase}
                      data-finger={n.finger ?? ""}
                      aria-label={`${action(n.phase)} ${n.label}, ${n.finger ? `suggested finger ${n.finger}, ${n.fingerName}` : "no finger suggestion"}`}
                      title={`${action(n.phase)} ${n.label} · ${n.finger ? `${NAMES[n.finger - 1]} finger ${n.finger}` : "No finger suggestion for this shape"}`}
                    >
                      <strong>{n.label}</strong>
                      {n.finger ? (
                        <b className="coach-finger">{n.finger}</b>
                      ) : (
                        <span className="coach-unassigned">choose finger</span>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="coach-rest">Rest</span>
                )}
                {repeat && (
                  <span
                    className="coach-hand-action coach-repeat"
                    role="img"
                    data-phase="next"
                    data-repeat="true"
                    aria-label={repeatLabel}
                    title={repeatLabel}
                  >
                    Next: repeat
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <button
          ref={helpButton}
          className="finger-help-button"
          aria-label="Finger guide"
          title="Finger guide: numbers 1–5"
          onClick={(event) => {
            helpByPointer.current =
              event.detail > 0 || focusedByPointer(event.currentTarget);
            helpOpen.current = true;
            helpChange.current?.(true);
            dialog.current?.showModal();
          }}
        >
          <HelpCircle size={14} />
          <span>Finger guide</span>
        </button>
      </div>
      <dialog
        ref={dialog}
        className="finger-help"
        aria-labelledby="finger-help-title"
        onClose={() => {
          helpOpen.current = false;
          helpChange.current?.(false);
          if (helpByPointer.current) restoreFocus(helpButton.current, true);
        }}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <div className="finger-help-content">
          <button
            className="finger-help-close"
            aria-label="Close finger guide"
            onClick={() => dialog.current.close()}
          >
            <X size={18} />
          </button>
          <span className="finger-help-eyebrow">Finger guide</span>
          <h2 id="finger-help-title">Finger numbers</h2>
          <p>
            Both hands use the same finger numbers. Choose a finger below to
            find it on each hand.
          </p>
          <div className="finger-diagrams">
            {["left", "right"].map((hand) => (
              <div key={hand} data-hand={hand}>
                <HandDiagram hand={hand} selected={selected} />
                <b>{hand === "left" ? "Left hand" : "Right hand"}</b>
              </div>
            ))}
          </div>
          <div
            className="finger-choices"
            role="group"
            aria-label="Explore finger numbers"
          >
            {NAMES.map((name, i) => (
              <button
                key={name}
                aria-pressed={selected === i + 1}
                onClick={() => setSelected(i + 1)}
              >
                <b>{i + 1}</b>
                {name}
              </button>
            ))}
          </div>
          <div className="finger-meaning">
            <p>
              <b>On the hands</b>
              <span>
                <strong>1–5</strong> tells you which finger.
              </span>
            </p>
            <p>
              <b>On the score & keys</b>
              <span>
                <strong>1–7</strong> tells you the pitch · Do–Ti.
              </span>
            </p>
          </div>
          <div className="finger-reading">
            <span>
              <i className="solid">2</i> Filled: finger down
            </span>
            <span>
              <i>2</i> Outline: prepare
            </span>
            <span>
              <b>Hold</b> Keep that key down
            </span>
          </div>
          <p className="finger-help-note">
            These are suggested fingerings. Use a comfortable choice when a
            stretch or passage needs a different fingering.
          </p>
        </div>
      </dialog>
    </>
  );
}

function HandDiagram({ hand, selected }) {
  const tips = [
    [39, 109],
    [66, 55],
    [96, 36],
    [125, 49],
    [151, 80],
  ];
  const x = (value) => (hand === "left" ? 190 - value : value);
  return (
    <svg
      viewBox="0 0 190 216"
      role="img"
      aria-label={`${hand} hand, finger ${selected}: ${NAMES[selected - 1]}`}
    >
      <g
        transform={hand === "left" ? "translate(190 0) scale(-1 1)" : undefined}
      >
        <path
          className="diagram-hand"
          d="M57 204 C58 185 55 175 45 157 L26 121 C18 104 32 96 41 108 L55 129 L53 63 C53 44 75 43 77 62 L79 111 L83 42 C84 20 108 21 108 42 L109 109 L114 52 C116 33 137 37 138 54 L138 117 L141 82 C143 66 163 69 163 85 L162 145 C162 170 143 184 145 204 Z"
        />
        {[
          [55, 130, 69, 162],
          [80, 115, 82, 151],
          [110, 115, 109, 147],
          [139, 121, 133, 151],
        ].map(([a, b, c, d], i) => (
          <path
            key={i}
            className="diagram-crease"
            d={`M${a} ${b} Q${(a + c) / 2 + 3} ${(b + d) / 2} ${c} ${d}`}
          />
        ))}
      </g>
      {tips.map(([a, b], i) => (
        <g
          key={i}
          className={selected === i + 1 ? "chosen" : ""}
          data-finger={i + 1}
        >
          <circle cx={x(a)} cy={b} r={12} />
          <text x={x(a)} y={b + 1}>
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
