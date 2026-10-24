import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, Repeat2, X } from "lucide-react";
import {
  barStart,
  barEnd,
  degree,
  noteName,
  solfege,
  measureAt,
} from "./music.mjs";
import {
  indexReadingNotes,
  readingPassage,
  readingContent,
  readingLayout,
  readingLineAt,
  readingDuration,
  readingNoteDisplay,
} from "./reading.mjs";
import "./reading.css";

// A hand's lane before scaling: chords stack one card per note. The tape
// packs its lines a little tighter so more of the next line shows; the strip
// beside the runway stacks bare numbers, as a numbered score writes a chord.
const LANES = {
  page: { min: 90, pitch: 66, pad: 18, empty: 42 },
  tape: { min: 84, pitch: 66, pad: 12, empty: 42 },
  strip: { min: 40, pitch: 34, pad: 8, empty: 30 },
};
const laneHeight = (groups, mode = "page") => {
  const lane = LANES[mode];
  if (!groups.length) return lane.empty;
  const depth = Math.max(1, ...groups.map((g) => g.notes.length));
  return Math.max(lane.min, depth * lane.pitch + lane.pad);
};
const grows = (content, mode = "tape") =>
  content.hands.reduce(
    (sum, h) => sum + (h.groups.length ? laneHeight(h.groups, mode) : 0),
    0,
  );
const fixed = (content, mode = "tape") =>
  content.hands.reduce(
    (sum, h) => sum + (h.groups.length ? 0 : LANES[mode].empty),
    22,
  );

// One note card. Memoised: as the music moves only the few cards whose state
// changes (now sounding, just played, next) render again.
const NoteCard = memo(function NoteCard({
  note,
  top,
  labelText,
  name,
  numbers,
  held,
  duration,
  sounding,
  holding,
  past,
  next,
  same,
  seekBeat,
  onSeekBeat,
}) {
  return (
    <button
      type="button"
      className={`reading-note ${sounding && !holding ? "reading-current" : ""} ${holding ? "reading-holding" : ""} ${held ? "reading-continuation" : ""}${past ? " reading-past" : ""}${next ? " reading-next" : ""}${same && !holding ? " reading-same-rhythm" : ""}`}
      style={{ top }}
      onClick={() => onSeekBeat(seekBeat)}
      aria-label={`${name}, ${numbers ? "number " : ""}${labelText}, ${held ? "remaining hold" : "hold"} ${duration} quarter-note beats${held ? ", continuing from previous passage" : ""}${holding ? ", keep holding" : ""}`}
      aria-current={sounding && !holding ? "true" : undefined}
      title={`${name} · ${duration} quarter-note beats${held ? " remaining · already held" : holding ? " · keep holding" : ""}`}
    >
      <strong>
        {held && <i aria-hidden="true">↳</i>}
        {labelText}
      </strong>
      <span>{name}</span>
      <small>
        ♩ {duration}
        {(held || holding) && (
          <em className={holding ? "reading-hold-label" : undefined}>
            {holding ? (held ? "hold · remaining" : "hold") : "remaining"}
          </em>
        )}
      </small>
    </button>
  );
});

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
  compact = false,
  follow = false,
  fit = false,
}) {
  const root = useRef(null);
  const scroller = useRef(null);
  const sheet = useRef(null);
  const previousPassage = useRef(null);
  const barAnchor = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const systemRefs = useRef(new Map());
  const shown = useRef({ score: null, keys: [], heights: [] });
  const [width, setWidth] = useState(960);
  const [area, setArea] = useState(0);
  const [jump, setJump] = useState("");
  const index = useMemo(() => indexReadingNotes(notes), [notes]);
  const barsPerPage = width < 760 ? 2 : 4;
  // In the studio the score reads as a tape of lines fitted to the width: with
  // the room to itself, the line being played on top and the lines after it
  // below; beside the note runway, a strip of just the line being played.
  const strip = compact;
  const tape = fit || compact;
  const slim = compact || fit;
  const laneMode = strip ? "strip" : tape ? "tape" : "page";
  const currentBar = Math.min(
    Math.max(1, score.measures || 1),
    measureAt(score, Math.max(0, beat)),
  );
  const inLoop =
    !!loopRange &&
    currentBar >= loopRange.first &&
    currentBar <= loopRange.last;

  // One line: pages of barsPerPage bars. Playing along, a page turns as its
  // last bar begins and that bar comes first, so what follows is in view
  // before it is needed. A short repeated phrase being played stays still.
  const anchor = useRef({ score: null, bar: null });
  if (anchor.current.score !== score.id)
    anchor.current = { score: score.id, bar: null };
  if (!tape) {
    if (follow && inLoop && loopRange.last - loopRange.first + 1 <= barsPerPage)
      anchor.current.bar = loopRange.first;
    else {
      const first =
        anchor.current.bar ??
        Math.floor((currentBar - 1) / barsPerPage) * barsPerPage + 1;
      const inside =
        currentBar >= first && currentBar <= first + barsPerPage - 1;
      if (follow)
        anchor.current.bar =
          !inside ||
          (barsPerPage > 1 && currentBar === first + barsPerPage - 1)
            ? currentBar
            : first;
      else if (!inside) anchor.current.bar = null;
    }
  }

  const laneWidth = Math.floor(Math.max(240, width - (slim ? 40 : 64) - 24) / 16) * 16;
  const layout = useMemo(
    () =>
      tape
        ? readingLayout(score, index, { width: laneWidth, maxBars: 4, hand })
        : null,
    [tape, score, index, laneWidth, hand],
  );
  const loopFirst = loopRange?.first,
    loopLast = loopRange?.last;
  const loopLayout = useMemo(
    () =>
      tape && loopFirst != null
        ? readingLayout(score, index, {
            width: laneWidth,
            maxBars: 4,
            hand,
            from: loopFirst,
            to: loopLast,
          })
        : null,
    [tape, score, index, laneWidth, hand, loopFirst, loopLast],
  );

  let lines, passage;
  if (tape) {
    // The line being read, then what follows it; a repeat comes back round.
    // Playing a repeat, its lines start at its first bar and come back round;
    // paused, the score keeps its usual lines so bars around it stay in reach.
    const source = follow && inLoop && loopLayout?.length ? loopLayout : layout;
    const at = readingLineAt(source, beat);
    lines = [];
    for (let i = 0; i < 6; i++) {
      const j = at + i;
      if (j < source.length) lines.push(source[j]);
      else if (source === loopLayout && j % source.length !== at)
        lines.push(source[j % source.length]);
      else break;
    }
    const whole = readingLineAt(layout, beat);
    passage = {
      ...lines[0],
      previous: layout[whole - 1]?.start ?? null,
      next: layout[whole + 1]?.start ?? null,
    };
  } else {
    passage = readingPassage(
      score,
      index,
      beat,
      barsPerPage,
      32,
      anchor.current.bar,
    );
  }
  const { start, end } = passage;
  const pageContent = useMemo(
    () => (tape ? null : readingContent(score, index, passage, hand)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tape, index, score, start, end, hand],
  );
  if (!tape) lines = [{ ...passage, content: pageContent }];

  // One size for every note. Beside the note runway the notes are compact;
  // on the tape the size is chosen once for the piece, so that most of the
  // time the line being played and the next one are both whole, and it only
  // shrinks where a line of big chords would not fit on its own.
  const pieceScale = useMemo(() => {
    if (!tape || !layout?.length || area <= 0) return 1;
    const pairs = layout.map((line, i) => {
      const next = layout[i + 1]?.content;
      const grow = grows(line.content) + (next ? grows(next) : 0);
      const space = area - fixed(line.content) - (next ? fixed(next) : 0);
      return grow ? space / grow : 2;
    });
    pairs.sort((a, b) => a - b);
    // Shrink a little only if that shows the next line whole most of the
    // time; otherwise keep full size and let the next line show in part.
    const typical = pairs[Math.floor(pairs.length * 0.3)];
    return typical >= 0.8 ? Math.min(1, typical) : 1;
  }, [tape, layout, area]);
  // The strip is as tall as this piece usually needs (three lines in four
  // fit at full strip size), within a fifth of the window, so the runway
  // below keeps one steady height through the piece.
  const [viewHeight, setViewHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  useEffect(() => {
    if (!strip) return;
    const resize = () => setViewHeight(window.innerHeight);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [strip]);
  const stripHeight = useMemo(() => {
    if (!strip || !layout?.length) return null;
    const needs = layout
      .map((line) => fixed(line.content, "strip") + grows(line.content, "strip") * 0.9)
      .sort((a, b) => a - b);
    const typical = needs[Math.floor(needs.length * 0.75)];
    return Math.round(
      Math.max(120, Math.min(viewHeight * 0.21, typical + 36 + 8)),
    );
  }, [strip, layout, viewHeight]);
  let scale = compact ? 0.76 : 1;
  if (tape) {
    const own = grows(lines[0].content, laneMode);
    // The line being played is always whole, with a little air below it. The
    // strip beside the runway stays small and shrinks further for big chords.
    const ceiling = strip ? 0.9 : pieceScale;
    const alone = own
      ? (area - fixed(lines[0].content, laneMode) - 6) / own
      : ceiling;
    scale =
      area > 0
        ? Math.max(strip ? 0.4 : 0.5, Math.min(ceiling, alone))
        : strip
          ? 0.76
          : 1;
    // Only lines that show enough to read (a sliver would only be noise)
    // are drawn; the last may be cut off, and fades at the edge.
    let used = 0,
      count = 0;
    for (const line of lines) {
      if (count && used >= area - 44) break;
      used += fixed(line.content) + grows(line.content) * scale + 3;
      count++;
    }
    lines = lines.slice(0, strip ? 1 : count);
  }

  let nextOnset = Infinity;
  for (const line of lines) {
    if (line.start < lines[0].start) break;
    for (const h of line.content.hands)
      for (const group of h.groups)
        if (group.beat > beat + 1e-6 && group.beat < nextOnset)
          nextOnset = group.beat;
    if (nextOnset < Infinity) break;
  }
  const seek = (at, direction = 0) => {
    if (onSeek) onSeek(Math.max(0, at));
    else onStep?.(direction, Math.max(0, at));
  };
  const seekRef = useRef(seek);
  seekRef.current = seek;
  const seekStable = useCallback((at) => seekRef.current(at), []);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  // The tape's height: the room the score has, less its header and footer.
  // Measured when sizes change, never while rendering a frame.
  useEffect(() => {
    const parent = root.current?.parentElement;
    if (!tape || !parent) return;
    const measure = () =>
      setArea(
        parent.clientHeight -
          (headerRef.current?.offsetHeight || 40) -
          (footerRef.current?.offsetHeight || 0) -
          2,
      );
    const observer = new ResizeObserver(measure);
    for (const el of [parent, headerRef.current, footerRef.current])
      if (el) observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [tape]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = 0;
  }, [start, end]);
  useEffect(() => {
    const previous = previousPassage.current;
    previousPassage.current = { score: score.id, start };
    if (tape) return;
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
  }, [score.id, start, end, tape]);
  // On the tape, moving on by a line scrolls it: the finished line slides out
  // of the top while the next one, where the eye already found it, moves up
  // into its place. Other jumps just settle in.
  const [exiting, setExiting] = useState(null);
  const scroll = useRef(null);
  const lineKeys = lines.map((line) => line.start).join();
  useLayoutEffect(() => {
    const keys = tape ? lines.map((line) => line.start) : [];
    const heights = keys.map(
      (key) => systemRefs.current.get(key)?.offsetHeight || 0,
    );
    const before = shown.current;
    shown.current = {
      score: score.id,
      keys,
      heights,
      first: tape ? lines[0] : null,
    };
    if (
      !tape ||
      before.score !== score.id ||
      !before.keys.length ||
      before.keys[0] === keys[0]
    ) {
      if (!tape || before.score !== score.id) setExiting(null);
      return;
    }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches || !sheet.current?.animate) {
      setExiting(null);
      return;
    }
    const was = before.keys.indexOf(keys[0]);
    if (strip) {
      // The strip moves on with a short slide rather than scrolling away.
      setExiting(null);
      const forward = keys[0] > before.keys[0];
      const step = sheet.current.animate(
        [
          {
            transform: `translateY(${forward ? 22 : -22}px)`,
            opacity: 0.35,
          },
          { transform: "translateY(0)", opacity: 1 },
        ],
        { duration: 300, easing: "cubic-bezier(.25,.8,.25,1)" },
      );
      return () => step.cancel();
    }
    // One line on, and the finished line is not shown again below (as it
    // is when a two-line repeat comes round): scroll it away.
    if (was === 1 && before.first && !keys.includes(before.first.start)) {
      setExiting({ score: score.id, line: before.first });
      return;
    }
    setExiting(null);
    const shift = before.heights
      .slice(0, Math.max(0, was))
      .reduce((sum, h) => sum + h, 0);
    const slide =
      was > 0
        ? sheet.current.animate(
            [
              { transform: `translateY(${shift}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 340, easing: "cubic-bezier(.25,.8,.25,1)" },
          )
        : sheet.current.animate([{ opacity: 0.55 }, { opacity: 1 }], {
            duration: 220,
            easing: "ease-out",
          });
    return () => slide.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tape, strip, score.id, lineKeys]);
  // The scroll itself. It holds its end until React drops the finished line,
  // and is cancelled in that same commit, so nothing jumps.
  useLayoutEffect(() => {
    scroll.current?.cancel();
    scroll.current = null;
    if (!exiting || !sheet.current?.animate) return;
    const height =
      systemRefs.current.get(exiting.line.start)?.offsetHeight || 0;
    const animation = sheet.current.animate(
      [
        { transform: "translateY(0)" },
        { transform: `translateY(${-height}px)` },
      ],
      {
        duration: 340,
        easing: "cubic-bezier(.25,.8,.25,1)",
        fill: "forwards",
      },
    );
    scroll.current = animation;
    animation.onfinish = () =>
      setExiting((current) => (current === exiting ? null : current));
  }, [exiting]);
  useEffect(() => () => scroll.current?.cancel(), []);
  // A line cut off at the bottom fades out, so it reads as more to come.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.dataset.more =
      tape &&
      lines.length > 1 &&
      sheet.current &&
      sheet.current.offsetHeight > el.clientHeight + 1
        ? "true"
        : "false";
  }, [tape, lineKeys, area, scale]);
  // On a dense page follow the reading position horizontally, without moving
  // the whole application or fighting manual scroll while the cursor is visible.
  const pageSpacing = pageContent?.spacing;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !pageSpacing || el.scrollWidth <= el.clientWidth + 2) return;
    const x = pageSpacing.position(beat) * (el.scrollWidth - 86) + 64;
    if (x > el.scrollLeft + el.clientWidth - 70 || x < el.scrollLeft + 64)
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3);
  }, [beat, pageSpacing]);
  const pageLabel =
    passage.firstBar === passage.lastBar
      ? `Bar ${passage.firstBar}`
      : `Bars ${passage.firstBar}–${passage.lastBar}`;
  const loopStart = loopRange ? barStart(score, loopRange.first) : 0;
  const loopEnd = loopRange ? barEnd(score, loopRange.last) : 0;
  const repeatsThisPage =
    loopRange?.first === passage.firstBar &&
    loopRange?.last === passage.lastBar;
  const label = (m) =>
    labels === "letters"
      ? noteName(m, flats).replace(/-?\d+$/, "")
      : labels === "solfege"
        ? solfege(m, tonic, flats)
        : degree(m, tonic, flats);

  const system = (line, i) => {
    const { content } = line;
    const percent = (at) => `${content.spacing.position(at) * 100}%`;
    const widthPercent = (from, to) =>
      `${(content.spacing.position(to) - content.spacing.position(from)) * 100}%`;
    // A line shown again after a repeat's last bar is still to come.
    const now = i <= 0 || line.start >= lines[0].start ? beat : -Infinity;
    const repeatStart = Math.max(line.start, loopStart);
    const repeatEnd = Math.min(line.end, loopEnd);
    const hasRepeatHere = loopRange && repeatEnd > repeatStart;
    return (
      <div
        className={`reading-system${i === 0 ? " reading-system-current" : ""}`}
        key={tape ? line.start : "page"}
        ref={(el) => {
          if (el) systemRefs.current.set(line.start, el);
          else systemRefs.current.delete(line.start);
        }}
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
                  if (event.shiftKey && onRepeat && anchor?.score === score.id) {
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
        {content.hands.map(({ hand, groups, rests }) => (
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
                height: groups.length
                  ? laneHeight(groups, laneMode) * scale
                  : LANES[laneMode].empty,
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
              {now >= line.start && now < line.end && (
                <div
                  className="reading-cursor"
                  style={{ left: percent(now) }}
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
                    width: widthPercent(rest.beat, rest.beat + rest.duration),
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
                      now >= note.beat - 0.000001 &&
                      now < note.beat + note.duration - 0.000001;
                    const holding =
                      mode === "wait" && sounding && now > note.beat + 0.0001;
                    const display = readingNoteDisplay(note, line.start);
                    return (
                      <NoteCard
                        key={`${note.id || note.midi}:${note.beat}`}
                        note={note}
                        top={row * LANES[laneMode].pitch * scale}
                        labelText={label(note.midi)}
                        name={noteName(note.midi, flats)}
                        numbers={labels === "numbers"}
                        held={display.held}
                        duration={readingDuration(display.duration)}
                        sounding={sounding}
                        holding={holding}
                        past={note.beat + note.duration <= now + 1e-6}
                        next={
                          Math.abs(group.beat - nextOnset) < 1e-6 &&
                          now === beat
                        }
                        same={!!group.sameRhythm}
                        seekBeat={display.seekBeat}
                        onSeekBeat={seekStable}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <section
      className={`reading-score${compact ? " reading-compact" : ""}${tape ? " reading-tape" : ""}${strip ? " reading-strip" : ""}${slim ? " reading-slim" : ""}`}
      style={{
        "--ns": scale.toFixed(3),
        ...(stripHeight ? { height: stripHeight } : null),
      }}
      ref={root}
      aria-label="Sight-reading score"
      data-labels={labels}
      data-lines={tape ? lines.length : 1}
    >
      <header className="reading-header" ref={headerRef}>
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
              if (tape) return seek(passage.previous, -1);
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
          style={tape ? undefined : { minWidth: pageContent.spacing.width + 86 }}
        >
          {tape &&
            exiting?.score === score.id &&
            !lines.some((line) => line.start === exiting.line.start) &&
            system(exiting.line, -1)}
          {lines.map(system)}
        </div>
      </div>
      <footer className="reading-footer" ref={footerRef}>
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
