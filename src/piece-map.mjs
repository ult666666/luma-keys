// A piece's outline, for the transport's map and the library's covers: where
// each hand plays along the piece. The beats are cut into equal slices, and
// each slice keeps the lowest and highest pitch of each hand, so a melody
// reads as a line and a sweeping arpeggio as a wide ribbon.
const cache = new WeakMap();

export function pieceOutline(score, columns = 200) {
  const notes = score?.notes || [];
  const key = columns;
  let byColumns = cache.get(score);
  if (byColumns?.has(key)) return byColumns.get(key);
  const duration = Math.max(score?.duration || 0, 1e-6);
  const slice = duration / columns;
  const empty = () => Array.from({ length: columns }, () => null);
  const hands = { right: empty(), left: empty() };
  let low = Infinity,
    high = -Infinity;
  for (const n of notes) {
    const hand = n.hand === "left" ? "left" : "right";
    // A held note belongs to every slice it sounds in.
    const first = Math.max(0, Math.min(columns - 1, Math.floor(n.beat / slice)));
    const last = Math.max(
      first,
      Math.min(columns - 1, Math.floor((n.beat + Math.max(0, n.duration) - 1e-6) / slice)),
    );
    for (let i = first; i <= last; i++) {
      const cell = hands[hand][i];
      if (cell) {
        cell.lo = Math.min(cell.lo, n.midi);
        cell.hi = Math.max(cell.hi, n.midi);
      } else hands[hand][i] = { lo: n.midi, hi: n.midi };
    }
    low = Math.min(low, n.midi);
    high = Math.max(high, n.midi);
  }
  if (!Number.isFinite(low)) {
    low = 48;
    high = 84;
  }
  const outline = {
    columns,
    low: low - 2,
    high: high + 2,
    right: hands.right,
    left: hands.left,
  };
  if (!byColumns) cache.set(score, (byColumns = new Map()));
  byColumns.set(key, outline);
  return outline;
}

// SVG area paths for each hand's ribbon in a width × height box. A ribbon is
// at least `minHeight` px thick so a single line of melody stays visible;
// short gaps (one slice) are bridged so a passage reads as one shape, and the
// edges are smoothed over a few slices so a busy passage flows rather than
// bristles.
export function outlinePaths(
  outline,
  width,
  height,
  { minHeight = 2.5, pad = 1, smooth = Math.max(1, Math.round(outline.columns / 90)) } = {},
) {
  const { columns, low, high } = outline;
  const span = Math.max(1, high - low);
  const y = (midi) => pad + (1 - (midi - low) / span) * (height - 2 * pad);
  const step = width / columns;
  const paths = {};
  for (const hand of ["right", "left"]) {
    const cells = outline[hand].slice();
    for (let i = 1; i < columns - 1; i++)
      if (!cells[i] && cells[i - 1] && cells[i + 1])
        cells[i] = {
          lo: (cells[i - 1].lo + cells[i + 1].lo) / 2,
          hi: (cells[i - 1].hi + cells[i + 1].hi) / 2,
        };
    // A triangular average of each edge over neighbouring slices in a run.
    const smoothed = cells.map((cell, i) => {
      if (!cell || smooth < 1) return cell;
      let lo = 0,
        hi = 0,
        weight = 0;
      for (let k = -smooth; k <= smooth; k++) {
        const other = cells[i + k];
        if (!other) continue;
        const w = smooth + 1 - Math.abs(k);
        lo += other.lo * w;
        hi += other.hi * w;
        weight += w;
      }
      return { lo: lo / weight, hi: hi / weight };
    });
    let d = "";
    let run = [];
    const flush = () => {
      if (!run.length) return;
      // Through the middle of each slice, squared off at the ends.
      const top = [],
        bottom = [];
      run.forEach(({ i, lo, hi }, k) => {
        let t = y(hi),
          b = y(lo);
        if (b - t < minHeight) {
          const mid = (t + b) / 2;
          t = mid - minHeight / 2;
          b = mid + minHeight / 2;
        }
        const xs =
          run.length === 1
            ? [i * step, (i + 1) * step]
            : k === 0
              ? [i * step, (i + 0.5) * step]
              : k === run.length - 1
                ? [(i + 0.5) * step, (i + 1) * step]
                : [(i + 0.5) * step];
        for (const x of xs) {
          top.push(`${x.toFixed(1)},${t.toFixed(1)}`);
          bottom.push(`${x.toFixed(1)},${b.toFixed(1)}`);
        }
      });
      d += `M${top.join("L")}L${bottom.reverse().join("L")}Z`;
      run = [];
    };
    for (let i = 0; i < columns; i++) {
      if (smoothed[i]) run.push({ i, ...smoothed[i] });
      else flush();
    }
    flush();
    paths[hand] = d;
  }
  return paths;
}
