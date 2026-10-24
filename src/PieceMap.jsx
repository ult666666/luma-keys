import { memo, useMemo, useState } from "react";
import { pieceOutline, outlinePaths } from "./piece-map.mjs";
import { barStart, barEnd, measureAt } from "./music.mjs";
import { secondsAt } from "./tempo.mjs";
import { describeSpot } from "./trouble-spots.mjs";

const clock = (t) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// The piece's two ribbons (left hand under the right), drawn once per piece.
// The drawing stretches to its box, so one set of paths serves every size.
export const PieceOutline = memo(function PieceOutline({
  score,
  columns = 160,
  className = "",
  minHeight = 2.5,
}) {
  const paths = useMemo(
    () =>
      outlinePaths(pieceOutline(score, columns), 1000, 100, {
        minHeight: minHeight * 2.2,
        pad: 6,
      }),
    [score, columns, minHeight],
  );
  return (
    <svg
      className={`piece-outline ${className}`}
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="ribbon left" d={paths.left} />
      <path className="ribbon right" d={paths.right} />
    </svg>
  );
});

// Bars practised, as lit stretches along the piece, with where it was left.
export function CoverageBar({
  score,
  ranges = [],
  bar = null,
  className = "",
}) {
  const duration = score.duration || 1;
  const at = (b) => Math.max(0, Math.min(1, barStart(score, b) / duration));
  const end = (b) => Math.max(0, Math.min(1, barEnd(score, b) / duration));
  return (
    <span className={`coverage-bar ${className}`} aria-hidden="true">
      {ranges.map(([a, b]) => (
        <i
          key={`${a}-${b}`}
          style={{
            left: `${at(a) * 100}%`,
            width: `${Math.max(0.4, (end(Math.min(b, score.measures)) - at(a)) * 100)}%`,
          }}
        />
      ))}
      {bar != null && bar > 1 && (
        <b style={{ left: `${at(Math.min(bar, score.measures)) * 100}%` }} />
      )}
    </span>
  );
}

// The trouble spots, as warm marks along the piece: each troubled bar, its
// mark stronger the more it has slipped lately (`spots` is a Map of bar →
// { trouble, slips, passes } from spotBars).
export function SpotMarks({ score, spots, className = "" }) {
  if (!spots?.size) return null;
  const duration = score.duration || 1;
  const at = (b) => Math.max(0, Math.min(1, barStart(score, b) / duration));
  const end = (b) => Math.max(0, Math.min(1, barEnd(score, b) / duration));
  return (
    <span className={`spot-marks ${className}`} aria-hidden="true">
      {[...spots].map(([bar, info]) => (
        <i
          key={bar}
          style={{
            left: `${at(bar) * 100}%`,
            width: `${Math.max(0.4, (end(Math.min(bar, score.measures)) - at(bar)) * 100)}%`,
            "--trouble": Math.max(0, Math.min(1, info.trouble)).toFixed(2),
          }}
        />
      ))}
    </span>
  );
}

// The transport: the whole piece as a map. The played part is lit, a repeat
// is marked, and pointing shows the bar and time; the slider underneath does
// the seeking, so clicks, drags and the arrow keys all work as before.
export function PieceTimeline({
  score,
  beat,
  onSeek,
  loop = null,
  coverage = [],
  passages = [],
  spots = null,
}) {
  const [hover, setHover] = useState(null);
  const duration = score.duration || 1;
  const fraction = Math.max(0, Math.min(1, Math.max(0, beat) / duration));
  const band = loop
    ? {
        left: barStart(score, loop.first) / duration,
        right: barEnd(score, loop.last) / duration,
      }
    : null;
  const hoverBeat = hover == null ? null : hover * duration;
  const hoverBar =
    hoverBeat == null
      ? null
      : Math.min(score.measures, measureAt(score, hoverBeat));
  const hoverSpot = hoverBar == null ? null : spots?.get(hoverBar) || null;
  return (
    <div
      className="piece-map"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (r.width > 0)
          setHover(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <span className="piece-map-track" aria-hidden="true">
        <PieceOutline
          score={score}
          columns={360}
          className="dim"
          minHeight={1.6}
        />
        <span
          className="piece-map-lit"
          style={{ clipPath: `inset(0 ${(1 - fraction) * 100}% 0 0)` }}
        >
          <PieceOutline score={score} columns={360} minHeight={1.6} />
        </span>
        {coverage.length > 0 && (
          <CoverageBar
            score={score}
            ranges={coverage}
            className="piece-map-coverage"
          />
        )}
        <SpotMarks score={score} spots={spots} className="piece-map-spots" />
        {passages.map(([a, b]) => (
          <i
            key={`${a}-${b}`}
            className="piece-map-passage"
            style={{
              left: `${(barStart(score, a) / duration) * 100}%`,
              width: `${Math.max(0.3, ((barEnd(score, Math.min(b, score.measures)) - barStart(score, a)) / duration) * 100)}%`,
            }}
          />
        ))}
        {band && (
          <i
            className="piece-map-loop"
            style={{
              left: `${band.left * 100}%`,
              width: `${Math.max(0.3, (band.right - band.left) * 100)}%`,
            }}
          />
        )}
      </span>
      <i
        className="piece-map-head"
        aria-hidden="true"
        style={{ left: `${fraction * 100}%` }}
      />
      {hoverBeat != null && (
        <span
          className={`piece-map-tip${hover > 0.9 ? " at-end" : hover < 0.1 ? " at-start" : ""}`}
          aria-hidden="true"
          style={{ left: `${hover * 100}%` }}
        >
          Bar {hoverBar}
          <small>{clock(secondsAt(score, hoverBeat))}</small>
          {hoverSpot && <em>{describeSpot(hoverSpot)}</em>}
        </span>
      )}
      <input
        className="piece-map-input"
        aria-label="Song position"
        aria-valuetext={`Bar ${Math.min(score.measures, measureAt(score, Math.max(0, beat)))} of ${score.measures}`}
        type="range"
        min="0"
        max={duration}
        step="any"
        value={Math.max(0, beat)}
        onChange={(e) => onSeek(+e.target.value)}
      />
    </div>
  );
}
