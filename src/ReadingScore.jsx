import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Repeat2, X } from "lucide-react";
import { barStart, barEnd, degree, noteName, solfege } from "./music.mjs";
import {
  indexReadingNotes,
  readingPassage,
  readingNotesBetween,
  readingGroups,
  readingRests,
  readingBars,
  readingDuration,
  readingSpacing,
  readingNoteDisplay,
} from "./reading.mjs";
import "./reading.css";

export default function ReadingScore({
  score,
  notes = score.notes,
  beat = 0,
  tonic = 0,
  labels = "numbers",
  flats = false,
  hand = "both",
  mode = "listen",
  onSeek,
  onStep,
  loopRange = null,
  onRepeat,
  onClearRepeat,
}) {
  const root = useRef(null);
  const scroller = useRef(null);
  const sheet = useRef(null);
  const previousPassage = useRef(null);
  const barAnchor = useRef(null);
  const [width, setWidth] = useState(960);
  const [jump, setJump] = useState("");
  const index = useMemo(() => indexReadingNotes(notes), [notes]);
  const barsPerPage = width < 760 ? 2 : 4;
  const passage = readingPassage(score, index, beat, barsPerPage);
  const { start, end } = passage;
  const content = useMemo(() => {
    const bars = readingBars(score, passage);
    const hands = ["right", "left"]
      .filter((name) => hand === "both" || hand === name)
      .map((hand) => {
        const visible = readingNotesBetween(index, hand, start, end);
        return {
          hand,
          notes: visible,
          groups: readingGroups(visible, start, end),
          // Name silence per bar; a long empty hand should not appear to be
          // one uncountable gap across the entire passage.
          rests: bars.flatMap((bar) =>
            readingRests(visible, bar.start, bar.end),
          ),
        };
      });
    const onsets = [
      ...new Set([
        ...hands.flatMap((h) => h.groups.map((g) => g.beat)),
        ...hands.flatMap((h) =>
          h.rests.flatMap((r) => [r.beat, r.beat + r.duration]),
        ),
        ...bars.flatMap((bar) => [bar.start, bar.end]),
      ]),
    ].sort((a, b) => a - b);
    const spacing = readingSpacing(start, end, onsets);
    return { hands, spacing, bars };
  }, [index, score, start, end, hand]);
  const percent = (at) => `${content.spacing.position(at) * 100}%`;
  const widthPercent = (from, to) =>
    `${(content.spacing.position(to) - content.spacing.position(from)) * 100}%`;
  const seek = (at, direction = 0) => {
    if (onSeek) onSeek(Math.max(0, at));
    else onStep?.(direction, Math.max(0, at));
  };
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = 0;
  }, [start, end]);
  useEffect(() => {
    const previous = previousPassage.current;
    previousPassage.current = { score: score.id, start };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches || !sheet.current?.animate) return;
    const direction =
      previous?.score === score.id && start < previous.start ? -1 : 1;
    // Animate the paper contents only. Keep the controls, focus and musical
    // cursor timing intact; this runs once per passage, never per audio frame.
    const entrance = sheet.current.animate(
      [
        { opacity: 0.64, transform: `translateX(${direction * 8}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 260, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    const stopMotion = () => {
      if (motion.matches) entrance.cancel();
    };
    motion.addEventListener("change", stopMotion);
    return () => {
      entrance.cancel();
      motion.removeEventListener("change", stopMotion);
    };
  }, [score.id, start, end]);
  // On a dense page follow the reading position horizontally, without moving
  // the whole application or fighting manual scroll while the cursor is visible.
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth + 2) return;
    const x = content.spacing.position(beat) * (el.scrollWidth - 86) + 64;
    if (x > el.scrollLeft + el.clientWidth - 70 || x < el.scrollLeft + 64)
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3);
  }, [beat, content.spacing]);
  const pageLabel =
    passage.firstBar === passage.lastBar
      ? `Bar ${passage.firstBar}`
      : `Bars ${passage.firstBar}–${passage.lastBar}`;
  const loopStart = loopRange ? barStart(score, loopRange.first) : 0;
  const loopEnd = loopRange ? barEnd(score, loopRange.last) : 0;
  const repeatStart = Math.max(start, loopStart);
  const repeatEnd = Math.min(end, loopEnd);
  const hasRepeatHere = loopRange && repeatEnd > repeatStart;
  const repeatsThisPage =
    loopRange?.first === passage.firstBar &&
    loopRange?.last === passage.lastBar;
  const label = (m) =>
    labels === "letters"
      ? noteName(m, flats).replace(/-?\d+$/, "")
      : labels === "solfege"
        ? solfege(m, tonic, flats)
        : degree(m, tonic, flats);
  return (
    <section
      className="reading-score"
      ref={root}
      aria-label="Sight-reading score"
      data-labels={labels}
    >
      <header className="reading-header">
        <div className="reading-heading">
          <span className="reading-eyebrow">READ FROM LEFT TO RIGHT</span>
          <h2>
            {pageLabel}
            <span> / {score.measures}</span>
          </h2>
        </div>
        <div className="reading-navigation">
          {onRepeat && (
            <button
              type="button"
              className="reading-repeat"
              aria-label="Repeat these bars"
              aria-pressed={!!repeatsThisPage}
              title={`Repeat bars ${passage.firstBar}–${passage.lastBar}`}
              onClick={() => {
                if (repeatsThisPage) onClearRepeat?.();
                else onRepeat(passage.firstBar, passage.lastBar);
              }}
            >
              <Repeat2 size={15} />
              <span>Repeat these bars</span>
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const bar = Number(jump);
              if (Number.isInteger(bar) && bar >= 1 && bar <= score.measures) {
                seek(barStart(score, bar));
                setJump("");
              }
            }}
          >
            <label htmlFor="reading-bar-jump">Go to bar</label>
            <input
              id="reading-bar-jump"
              aria-label="Go to bar"
              type="number"
              min="1"
              max={score.measures}
              placeholder="—"
              value={jump}
              onChange={(e) => setJump(e.target.value)}
            />
            <button type="submit" className="reading-jump" disabled={!jump}>
              Go
            </button>
          </form>
          <button
            type="button"
            aria-label="Previous passage"
            title="Previous passage"
            disabled={passage.previous == null}
            onClick={() => {
              const previous = readingPassage(
                score,
                index,
                passage.previous,
                barsPerPage,
              );
              seek(previous.start, -1);
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next passage"
            title="Next passage"
            disabled={passage.next == null}
            onClick={() => seek(passage.next, 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>
      <div
        className="reading-scroll"
        ref={scroller}
        tabIndex="0"
        aria-label="Numbered score passage; scroll horizontally for dense music"
      >
        <div
          className="reading-sheet"
          ref={sheet}
          style={{ minWidth: content.spacing.width + 86 }}
        >
          <div className="reading-ruler">
            <span className="reading-gutter">HAND</span>
            <div className="reading-time">
              {content.bars.map((bar) => (
                <button
                  key={bar.bar}
                  type="button"
                  className={`reading-bar-label ${loopRange && bar.bar >= loopRange.first && bar.bar <= loopRange.last ? "reading-bar-in-loop" : ""}`}
                  style={{
                    left: percent(bar.start),
                    width: widthPercent(bar.start, bar.end),
                  }}
                  onClick={(event) => {
                    const anchor = barAnchor.current;
                    if (
                      event.shiftKey &&
                      onRepeat &&
                      anchor?.score === score.id
                    ) {
                      onRepeat(
                        Math.min(anchor.bar, bar.bar),
                        Math.max(anchor.bar, bar.bar),
                      );
                    } else {
                      barAnchor.current = { score: score.id, bar: bar.bar };
                      seek(barStart(score, bar.bar));
                    }
                  }}
                  aria-label={`Seek to bar ${bar.bar}`}
                  title={`Start at bar ${bar.bar}. Shift-click another bar to repeat a range.`}
                >
                  {String(bar.bar).padStart(2, "0")}
                  {bar.continuation ? " · continued" : ""}
                </button>
              ))}
            </div>
          </div>
          {content.hands.map(({ hand, groups, rests }) => {
            const depth = Math.max(1, ...groups.map((g) => g.notes.length));
            return (
              <div
                className={`reading-hand reading-${hand} ${groups.length ? "" : "reading-empty"}`}
                key={hand}
              >
                <div className="reading-gutter reading-hand-name">
                  <strong>{hand === "right" ? "R" : "L"}</strong>
                  <span>{hand} hand</span>
                </div>
                <div
                  className="reading-lane"
                  style={{
                    height: groups.length ? Math.max(90, depth * 66 + 18) : 42,
                  }}
                >
                  {hasRepeatHere && (
                    <div
                      className="reading-loop-shade"
                      aria-hidden="true"
                      style={{
                        left: percent(repeatStart),
                        width: widthPercent(repeatStart, repeatEnd),
                      }}
                    />
                  )}
                  {content.bars.map((bar) => (
                    <div
                      key={bar.bar}
                      className="reading-bar-line"
                      style={{ left: percent(bar.start) }}
                    />
                  ))}
                  {beat >= start && beat < end && (
                    <div
                      className="reading-cursor"
                      style={{ left: percent(beat) }}
                      aria-hidden="true"
                    />
                  )}
                  {rests.map((rest) => (
                    <div
                      className="reading-rest"
                      role="note"
                      key={rest.beat}
                      style={{
                        left: percent(rest.beat),
                        width: widthPercent(
                          rest.beat,
                          rest.beat + rest.duration,
                        ),
                      }}
                      title={`Rest for ${readingDuration(rest.duration)} quarter-note beats`}
                      aria-label={`Rest for ${readingDuration(rest.duration)} quarter-note beats`}
                    >
                      <span>
                        rest <small>♩ {readingDuration(rest.duration)}</small>
                      </span>
                      <i />
                    </div>
                  ))}
                  {groups.map((group) => (
                    <div
                      className={`reading-chord ${group.held ? "reading-held" : ""}`}
                      key={`${group.beat}:${group.held}`}
                      style={{ left: percent(group.beat) }}
                    >
                      {group.notes.map((note, row) => {
                        const sounding =
                          beat >= note.beat - 0.000001 &&
                          beat < note.beat + note.duration - 0.000001;
                        const holding =
                          mode === "wait" &&
                          sounding &&
                          beat > note.beat + 0.0001;
                        const display = readingNoteDisplay(note, start);
                        const { held } = display;
                        const duration = readingDuration(display.duration);
                        return (
                          <button
                            type="button"
                            key={`${note.id || note.midi}:${note.beat}`}
                            className={`reading-note ${sounding && !holding ? "reading-current" : ""} ${holding ? "reading-holding" : ""} ${held ? "reading-continuation" : ""}`}
                            style={{ top: row * 66 }}
                            onClick={() => seek(display.seekBeat)}
                            aria-label={`${noteName(note.midi, flats)}, ${labels === "numbers" ? "number " : ""}${label(note.midi)}, ${held ? "remaining hold" : "hold"} ${duration} quarter-note beats${held ? ", continuing from previous passage" : ""}${holding ? ", keep holding" : ""}`}
                            aria-current={
                              sounding && !holding ? "true" : undefined
                            }
                            title={`${noteName(note.midi, flats)} · ${duration} quarter-note beats${held ? " remaining · already held" : holding ? " · keep holding" : ""}`}
                          >
                            <strong>
                              {held && <i aria-hidden="true">↳</i>}
                              {label(note.midi)}
                            </strong>
                            <span>{noteName(note.midi, flats)}</span>
                            <small>
                              ♩ {duration}
                              {(held || holding) && (
                                <em
                                  className={
                                    holding ? "reading-hold-label" : undefined
                                  }
                                >
                                  {holding
                                    ? held
                                      ? "hold · remaining"
                                      : "hold"
                                    : "remaining"}
                                </em>
                              )}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="reading-footer">
        {loopRange && (
          <span className="reading-repeat-status" role="status">
            <Repeat2 size={12} /> Repeating{" "}
            {loopRange.first === loopRange.last
              ? `bar ${loopRange.first}`
              : `bars ${loopRange.first}–${loopRange.last}`}
            <button
              type="button"
              onClick={onClearRepeat}
              aria-label="Stop repeating bars"
              title="Stop repeating bars"
            >
              <X size={12} />
            </button>
          </span>
        )}
        <span>
          {labels === "numbers"
            ? `1 = ${noteName(60 + tonic, flats).replace(/\d+$/, "")} · Numbers are notes, not fingers`
            : labels === "solfege"
              ? `Do = ${noteName(60 + tonic, flats).replace(/\d+$/, "")}`
              : "Letters name the keys"}
        </span>
        <span>
          C4 = middle C <i>·</i> ♩ = one quarter-note beat <i>·</i> spacing
          adapts
          {passage.detail ? " · detailed passage" : ""}
        </span>
      </footer>
    </section>
  );
}
