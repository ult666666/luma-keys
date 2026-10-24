// Painting a hand on a canvas, from a pose (see hand-pose.mjs §5): the palm
// is the pose's own outline (its knuckle row, its sides and its wrist), the
// fingers grow from the pose's knuckles to their pads, and the thumb's
// metacarpal (CMC → MCP) is painted as part of the palm, its thenar side,
// so only the thumb's phalanges (MCP → IP → pad) show as the thumb, joined
// to the index side by the web. Skin is shaded like a lit form, with nails,
// knuckle dimples and creases, and the finger numbers on a ring over the
// nail of a finger playing or about to play.
//
// The drawer reads only what the pose's signature carries (hand-pose.mjs
// `poseSignature`), quantised to the signature's own buckets, so two poses
// with one signature paint identically and a repaint is needed only when the
// signature changes. It reads: unit, dir, knuckleY, wrist.y,
// back[16], palm.roll, palm.relax and, per finger, axis, state, landing
// {x, y, alpha}, lift, press, number, under.

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const unit = (v) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
// The normal of a direction, turned a quarter clockwise on screen.
const normal = (a) => ({ x: -a.y, y: a.x });
const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

// A finger's shape along its axis: the points it passes through, the half
// width at each, the direction at its tip and the centre of its rounded end.
export function fingerForm(axis, widths) {
  const tip = axis.at(-1);
  const distal = sub(tip, axis.at(-2));
  // The pad rolls toward the key as it curls. In this overhead projection
  // its contour/nail stays forward-facing instead of flipping 180 degrees
  // when the shortened distal segment passes through zero projected length.
  const forward = (v) =>
    axis.length === 4
      ? { x: v.x, y: -Math.max(Math.abs(v.y), widths.at(-1) * 0.2) }
      : v;
  const into = unit(forward(distal));
  const tipHalf = widths.at(-1) / 2;
  const end = add(tip, into, -tipHalf);
  let points, halves, joints;
  if (axis.length === 2) {
    const [root] = axis;
    const [rootW, tipW] = widths;
    const at = (t) => (rootW + (tipW - rootW) * t) / 2;
    points = [root, lerp(root, end, 0.42), lerp(root, end, 0.74), end];
    halves = [rootW / 2, at(0.42) * 1.06, at(0.74) * 1.03, tipHalf];
    joints = [1, 2];
  } else if (axis.length === 3) {
    const [root, knuckle] = axis;
    const [rootW, knuckleW, tipW] = widths;
    // A slight waist in each phalanx and a soft joint, rather than one long
    // capsule. The final rounded pad still ends exactly at the target tip.
    points = [
      root,
      lerp(root, knuckle, 0.58),
      knuckle,
      lerp(knuckle, end, 0.58),
      end,
    ];
    halves = [
      rootW / 2,
      ((rootW + knuckleW) / 4) * 0.94,
      (knuckleW / 2) * 1.035,
      ((knuckleW + tipW) / 4) * 0.91,
      tipHalf,
    ];
    joints = [2, 3];
  } else {
    // MCP, PIP and DIP articulate separately. The short last segment makes
    // the pad turn down to its key instead of drawing a long straight tube.
    const [mcp, pip, dip] = axis;
    const [rootW, pipW, dipW] = widths;
    // The finger joins the knuckle arch without a rounded tube cap. The
    // palm supplies the connecting web instead of an exposed circular root.
    const root = { x: mcp.x, y: mcp.y + rootW * 0.44 };
    points = [root, lerp(root, pip, 0.55), pip, lerp(pip, dip, 0.55), dip, end];
    halves = [
      rootW / 2,
      (rootW + pipW) * 0.238,
      pipW * 0.515,
      (pipW + dipW) * 0.237,
      dipW * 0.505,
      tipHalf,
    ];
    joints = [2, 4];
  }
  const normals = points.map((p, i) => {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    return normal(unit(forward(sub(after, before))));
  });
  // Viewed from above, a curled fingertip returns toward the palm behind
  // its raised middle joint. Sweeping one ribbon through that reversal
  // crosses its edges. Paint the rounded proximal envelope, then place the
  // distal crease and nail over it at their projected pad coordinates.
  let envelope = null;
  if (axis.length === 4 && tip.y > axis[2].y) {
    const dorsal = unit(sub(axis[1], axis[0]));
    const crest = add(axis[1], dorsal, widths[1] * 0.38);
    const proximal = fingerForm(
      [axis[0], crest],
      [widths[0], widths.at(-1) * 1.12],
    );
    // Measure curl in projected depth, not finger width. Wide keys in a
    // shallow bed would otherwise leave the resting contour half-folded.
    const t = Math.min(
      1,
      (tip.y - axis[2].y) / Math.max(1, Math.abs(axis[1].y - axis[0].y) * 0.05),
    );
    const blend = t * t * (3 - 2 * t);
    const outline = points.map((p, i) =>
      lerp(p, lerp(points[0], proximal.end, i / (points.length - 1)), blend),
    );
    const radii = halves.map(
      (h, i) =>
        h +
        (halves[0] +
          ((proximal.tipHalf - halves[0]) * i) / (halves.length - 1) -
          h) *
          blend,
    );
    const directions = outline.map((p, i) =>
      normal(
        unit(
          forward(
            sub(
              outline[Math.min(outline.length - 1, i + 1)],
              outline[Math.max(0, i - 1)],
            ),
          ),
        ),
      ),
    );
    envelope = {
      points: outline,
      halves: radii,
      normals: directions,
      end: outline.at(-1),
      tipHalf: radii.at(-1),
      rootCap: false,
    };
  }
  return {
    points,
    halves,
    normals,
    into,
    end,
    tipHalf,
    joints,
    envelope,
    rootCap: axis.length !== 4,
  };
}

// The visible thumb (MCP → IP → pad) as a finger's form (see fingerForm):
// its centre line, half widths and normals, with a rounded pad and no cap at
// its root (it grows out of the thenar). Its cross-section and pad are
// foreshortened in depth by q (v/u ≤ 1) like the palm on a shallow keyboard;
// `outer(i)` and `inner(i)` are its sides away from and toward the palm.
function thumbForm(axis, widths, q = 1, dir = 1) {
  const [root, joint, tip] = axis;
  const [rootW, jointW, tipW] = widths;
  // (A screen vector in true proportions, and back.)
  const A = (v) => ({ x: v.x, y: v.y / q });
  const S = (v) => ({ x: v.x, y: v.y * q });
  const tipHalf = tipW / 2;
  const end = add(tip, S(unit(A(sub(tip, joint)))), -tipHalf);
  const points = [root, lerp(root, joint, 0.58), joint, lerp(joint, end, 0.58), end];
  const halves = [
    rootW / 2,
    ((rootW + jointW) / 4) * 0.94,
    (jointW / 2) * 1.035,
    ((jointW + tipW) / 4) * 0.91,
    tipHalf,
  ];
  const normals = points.map((p, i) => {
    const before = points[Math.max(0, i - 1)],
      after = points[Math.min(points.length - 1, i + 1)];
    return normal(unit(A(sub(after, before))));
  });
  const at = (i, k) => add(points[i], S(normals[i]), k * halves[i]);
  return { points, halves, normals, end, tipHalf, q, at, outer: (i) => at(i, -dir), inner: (i) => at(i, dir) };
}

function thumbPathOf(form) {
  const { points, halves, normals, end, tipHalf, q } = form;
  const S = (v) => ({ x: v.x, y: v.y * q });
  const left = points.map((p, i) => add(p, S(normals[i]), halves[i]));
  const right = points.map((p, i) => add(p, S(normals[i]), -halves[i]));
  const path = new Path2D();
  path.moveTo(left[0].x, left[0].y);
  through(path, left);
  // Round the pad: from one side to the other, around the end.
  const n = normals.at(-1);
  const angle = Math.atan2(n.y, n.x);
  path.ellipse(end.x, end.y, tipHalf, tipHalf * q, 0, angle, angle - Math.PI, true);
  through(path, [...right].reverse());
  path.closePath();
  return path;
}

// Trace a smooth line through points (quadratic curves between midpoints).
function through(path, points) {
  for (let i = 1; i < points.length - 1; i++) {
    const mid = lerp(points[i], points[i + 1], 0.5);
    path.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  const last = points.at(-1);
  path.lineTo(last.x, last.y);
}

export function fingerPath(form) {
  if (form.envelope) return fingerPath(form.envelope);
  const { points, halves, normals, end, tipHalf } = form;
  const left = points.map((p, i) => add(p, normals[i], halves[i]));
  const right = points.map((p, i) => add(p, normals[i], -halves[i]));
  const path = new Path2D();
  path.moveTo(left[0].x, left[0].y);
  through(path, left);
  const n = normals.at(-1);
  const angle = Math.atan2(n.y, n.x);
  // Round the tip: from one side to the other, around the end.
  path.arc(end.x, end.y, tipHalf, angle, angle - Math.PI, true);
  through(path, [...right].reverse());
  const n0 = normals[0];
  const angle0 = Math.atan2(n0.y, n0.x);
  if (form.rootCap !== false)
    path.arc(
      points[0].x,
      points[0].y,
      halves[0],
      angle0 + Math.PI,
      angle0,
      true,
    );
  path.closePath();
  return path;
}

// One Catmull-Rom span of a closed outline (as a Bézier), from point i to i+1.
function loopSpan(path, points, i) {
  const n = points.length;
  const p = (k) => points[(k + n) % n];
  const p0 = p(i - 1),
    p1 = p(i),
    p2 = p(i + 1),
    p3 = p(i + 2);
  path.bezierCurveTo(
    p1.x + (p2.x - p0.x) / 6,
    p1.y + (p2.y - p0.y) / 6,
    p2.x - (p3.x - p1.x) / 6,
    p2.y - (p3.y - p1.y) / 6,
    p2.x,
    p2.y,
  );
}

// A point on that span (0 ≤ t ≤ 1) and the unit direction of the outline
// there, as loopPath draws it.
function spanAt(points, i, t) {
  const n = points.length;
  const p = (k) => points[(k + n) % n];
  const p0 = p(i - 1),
    p1 = p(i),
    p2 = p(i + 1),
    p3 = p(i + 2);
  const b1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    b2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
  const s = 1 - t;
  const at = (a, b, c, d) => s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
  const slope = (a, b, c, d) => 3 * s * s * (b - a) + 6 * s * t * (c - b) + 3 * t * t * (d - c);
  return {
    p: { x: at(p1.x, b1.x, b2.x, p2.x), y: at(p1.y, b1.y, b2.y, p2.y) },
    d: unit({ x: slope(p1.x, b1.x, b2.x, p2.x), y: slope(p1.y, b1.y, b2.y, p2.y) }),
  };
}

// A closed, rounded outline through the points (Catmull-Rom as Béziers).
export function loopPath(points) {
  const path = new Path2D();
  path.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length; i++) loopSpan(path, points, i);
  path.closePath();
  return path;
}

// The same outline, open, along the spans from point `from` to point `to`
// (indices taken around the loop).
function loopPart(points, from, to) {
  const n = points.length;
  const path = new Path2D();
  const start = points[((from % n) + n) % n];
  path.moveTo(start.x, start.y);
  for (let i = from; i !== to; i = (i + 1) % n) loopSpan(path, points, i);
  return path;
}

// A tapered, round-ended limb from `a` to `b` bending through `bend` (a
// point, or null for straight), `wa`/`wb` wide at each end. With `into`
// given, the limb is added to that path as one more outline (same winding,
// so a fill covers the union). Its cross-section is foreshortened in depth by
// q (v/u ≤ 1, like the palm's and the thumb's on a shallow keyboard): a limb
// lying across the keys is that much narrower on screen, one pointing up
// them keeps its width.
function limbPath(a, b, wa, wb, bend = null, into = null, q = 1) {
  // (Built in true proportions — depth ÷ q — and drawn back foreshortened.)
  const T = (p) => ({ x: p.x, y: p.y / q });
  const S = (p) => ({ x: p.x, y: p.y * q });
  const A = T(a),
    B = T(b),
    mid = T(bend || lerp(a, b, 0.5));
  const n0 = normal(unit(sub(mid, A))),
    n1 = normal(unit(sub(B, mid)));
  const nm = normal(unit(sub(B, A)));
  const wm = (wa + wb) / 2;
  const path = into || new Path2D();
  const a1 = add(A, n0, wa / 2),
    a2 = add(A, n0, -wa / 2);
  const m1 = add(mid, nm, wm / 2),
    m2 = add(mid, nm, -wm / 2);
  const b1 = add(B, n1, wb / 2),
    b2 = add(B, n1, -wb / 2);
  const c1 = S({ x: m1.x * 2 - (a1.x + b1.x) / 2, y: m1.y * 2 - (a1.y + b1.y) / 2 }),
    c2 = S({ x: m2.x * 2 - (a2.x + b2.x) / 2, y: m2.y * 2 - (a2.y + b2.y) / 2 });
  const [A1, A2, B1] = [a1, a2, b1].map(S);
  path.moveTo(A1.x, A1.y);
  path.quadraticCurveTo(c1.x, c1.y, B1.x, B1.y);
  const angle = Math.atan2(n1.y, n1.x);
  path.ellipse(b.x, b.y, wb / 2, (wb / 2) * q, 0, angle, angle - Math.PI, true);
  path.quadraticCurveTo(c2.x, c2.y, A2.x, A2.y);
  const angle0 = Math.atan2(n0.y, n0.x);
  path.ellipse(a.x, a.y, wa / 2, (wa / 2) * q, 0, angle0 + Math.PI, angle0, true);
  path.closePath();
  return path;
}

// The pose as the drawer sees it: every field it reads, quantised exactly as
// the signature quantises it (0.5 px for points; lift/under/roll/relax 0.05;
// press/number/alpha 0.1), so equal signatures give identical paintings.
const px = (x) => Math.round(x * 2) / 2;
const step = (x, n) => Math.round((x || 0) * n) / n;
const point = (p) => ({ x: px(p.x), y: px(p.y) });
export function drawable(pose) {
  return {
    u: px(pose.unit),
    dir: pose.dir < 0 ? -1 : 1,
    knuckleY: px(pose.knuckleY),
    wrist: { y: px(pose.wrist.y) },
    back: pose.back.map(point),
    roll: step(pose.palm?.roll, 20),
    relax: step(pose.palm?.relax, 20),
    fingers: pose.fingers.map((f) => ({
      finger: f.finger,
      state: f.state,
      axis: f.axis.map(point),
      landing: f.landing
        ? { x: px(f.landing.x), y: px(f.landing.y), alpha: step(f.landing.alpha, 10) }
        : null,
      lift: step(f.lift, 20),
      press: step(f.press, 10),
      number: step(f.number, 10),
      under: step(f.under, 20),
    })),
  };
}

// The illustrated hand: warm ivory-peach skin, a soft rounded palm under the
// knuckle row, four rounded fingers from their knuckles, the thumb beneath
// the hand, small glossy nails and knuckle dimples. Fingertips are exactly
// the pose's contacts; only the drawing between them is styled.
const HAND = {
  edge: [143, 96, 74, 0.62],
  light: "#fbe4d0",
  mid: "#f2cdb0",
  deep: "#e2b08f",
  crease: [150, 94, 70, 0.22],
  nail: [255, 246, 236, 0.9],
  nailEdge: [196, 136, 110, 0.35],
  blush: [240, 150, 140, 0.22],
  sheen: [255, 244, 232, 0.55],
};
const INK = {
  right: { rgb: "233, 180, 95", ink: "#45280a" },
  left: { rgb: "138, 174, 220", ink: "#0f2744" },
};
const FONT = "Manrope, -apple-system, BlinkMacSystemFont, sans-serif";
const rgba = ([r, g, b, a], k = 1) => `rgba(${r}, ${g}, ${b}, ${+(a * k).toFixed(3)})`;
// Finger widths (keys) at the knuckle and at the pad: a little fuller than
// the pose's clearance widths, so the hand reads soft and friendly; a pad
// about as wide as a black key, as on a medium adult hand.
const ROOT_W = [0, 1.0, 0.74, 0.77, 0.72, 0.64];
const PAD_W = [0, 0.64, 0.55, 0.57, 0.53, 0.47];
// The visible thumb's width (keys) at its MCP and at its IP joint.
const THUMB_ROOT = 0.76;
const THUMB_IP = 0.68;
// The knuckle spacing (× u), as the pose builds the hand (hand-pose.mjs SPAN).
const SPAN = 0.84;

// Gradients per canvas context, keyed by their (quantised) geometry.
const gradients = new WeakMap();
function gradient(ctx, key, make) {
  let cache = gradients.get(ctx);
  if (!cache) gradients.set(ctx, (cache = new Map()));
  let g = cache.get(key);
  if (!g) {
    if (cache.size > 24) cache.clear();
    cache.set(key, (g = make()));
  }
  return g;
}

export function drawHand(ctx, pose, hand, { width, height, dpr = 1 }) {
  const ink = INK[hand] || INK.right;
  const P = drawable(pose);
  const { u, dir, roll, relax } = P;
  const w = SPAN * u;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(width / 2, 0);
  const fingers = P.fingers;
  const thumb = fingers[0];
  const under = thumb.under;
  // How far the thumb is beneath the hand: its outline shows through the
  // palm's and fingers' edges, and its nail and ring fade out by 0.5.
  const beneath = smooth((under - 0.1) / 0.3);
  const hidden = smooth((under - 0.3) / 0.2);
  const dim = 1 - 0.5 * relax;

  // The palm: the pose's outline, continued a little past the wrist into
  // the forearm (the stage masks it into the rail).
  const outline = P.back.map((p, i) =>
    i === 11 || i === 12
      ? { x: Math.sign(p.x || 1) * Math.max(Math.abs(p.x), 1.08 * w), y: P.wrist.y + 1.4 * u }
      : p,
  );
  const palm = loopPath(outline);
  let cx = 0,
    cy = 0;
  for (const p of P.back) {
    cx += p.x / P.back.length;
    cy += p.y / P.back.length;
  }
  const half = Math.max(...P.back.map((p) => Math.abs(p.x - cx)));
  // On a shallow keyboard the hand's depth is foreshortened (v < u): the
  // cross-section of a digit lying across the view is foreshortened half as
  // much (fully, a reaching thumb or a spread little finger would thin to a
  // strap).
  const q = 0.5 + 0.5 * clamp((P.wrist.y - P.knuckleY) / 1.9 / u, 0.3, 1);

  // Fingers 2–5 from their knuckles; a lifted pad is a little larger (it is
  // nearer the eye) and its tip has already retreated toward the knuckle.
  const shapes = [];
  for (let i = 4; i >= 1; i--) {
    const f = fingers[i];
    let base = f.axis[0];
    const tip = f.axis.at(-1);
    const wr = ROOT_W[f.finger] * u,
      wt = PAD_W[f.finger] * u * (1 + 0.05 * f.lift);
    // A little finger spread out sideways grows from the palm's outer corner:
    // its root sits half its width lower, so the finger's upper edge leaves
    // the palm at the knuckle line instead of a raised, webbed base (0 for a
    // finger pointing up the keys, 1 lying across them; as the pose's palm
    // outline turns in under it).
    if (f.finger === 5) {
      const dX = (dir * (tip.x - base.x)) / u,
        dY = (base.y - tip.y) / (q * u);
      const reach = Math.hypot(dX, dY);
      const across = smooth((Math.atan2(dX, Math.max(dY, 1e-6 - reach)) - 0.45) / 0.6) * smooth((reach - 0.4) / 0.4);
      base = { x: base.x - dir * 0.06 * u * across, y: base.y + 0.45 * wr * q * across };
    }
    // The finger curves through its middle joints (the pose's PIP and DIP),
    // so a reaching finger reads as a curved finger, not a straight stick.
    const bend = lerp(lerp(base, tip, 0.55), lerp(f.axis[1], f.axis[2], 0.5), 0.6);
    bend.x += dir * (f.finger - 3) * 0.04 * u;
    shapes.push({ f, base, tip, w: wt, path: limbPath(base, tip, wr, wt, bend, null, q) });
  }
  // The thumb as a hand shows it from above: its metacarpal (CMC → MCP)
  // lies in the palm, so it is drawn as part of the palm, the thenar: the
  // palm's thumb side runs beside the metacarpal out to the MCP. Only the
  // phalanges (MCP → IP → pad) show as the thumb, bent a little at the IP,
  // with the web spanning from the thumb to the index side of the palm.
  const [cmc, mcp, ttip] = thumb.axis;
  const thumbPad = PAD_W[1] * u * (1 + 0.05 * thumb.lift);
  // A normal pointing away from the palm (toward the thumb side), with no
  // sign test, so the drawing turns with the thumb and never flips; as an
  // offset on screen (foreshortened in depth).
  const outer = (a, b) => {
    const d = unit({ x: b.x - a.x, y: (b.y - a.y) / q });
    return { x: dir * d.y, y: -dir * d.x * q };
  };
  const nT = outer(mcp, ttip),
    nM = outer(cmc, mcp);
  const lenT = Math.hypot(ttip.x - mcp.x, ttip.y - mcp.y);
  const rootW = THUMB_ROOT * u * (1 - 0.12 * under);
  const ipW = THUMB_IP * u * (1 - 0.08 * under);
  // The IP joint: a little past the middle of the phalanges, standing a
  // little outward, so the thumb curves gently toward its pad.
  const ip = add(lerp(mcp, ttip, 0.56), nT, 0.07 * u);
  const tf = thumbForm([mcp, ip, ttip], [rootW, ipW, thumbPad], q, dir);
  const thumbPath = thumbPathOf(tf);
  const thumbShape = { f: thumb, base: ip, tip: ttip, w: thumbPad, path: thumbPath, thumb: true, len: lenT };
  // The thenar: from the palm's side near the wrist (going up it), beside
  // the metacarpal just outside it, to the thumb's outer root; over the
  // thumb's root to the web's hold on its inner side; the web's concave
  // edge back to the palm below the index knuckle; then inside the palm
  // (covered by it). Filled with the palm, so the metacarpal belongs to
  // the palm's silhouette, never a limb of its own.
  const stretch = smooth((Math.hypot(mcp.x - cmc.x, (mcp.y - cmc.y) / q) / u - 1.1) / 0.6);
  const palmMid = { x: cx, y: cy };
  const inside = (p, k) => lerp(p, palmMid, k);
  const root = tf.outer(0),
    on = tf.outer(1),
    rootIn = tf.inner(0);
  const hold = lerp(rootIn, tf.inner(1), (0.42 + 0.1 * stretch) / 0.58);
  const indexSide = inside(P.back[15], 0.06);
  // (It leaves the palm lower down, nearer the wrist, when the thumb's
  // base has slid out beyond the palm's side, so the sweep has room.)
  const side13 = P.back[13];
  const beyond = Math.max(0, dir * side13.x - (dir * cmc.x - 0.3 * u)) / u;
  const tLow = clamp(
    (outline[12].y - P.wrist.y + 0.15 * u) / Math.max(1, outline[12].y - outline[13].y) - 0.3 * beyond,
    0.15,
    0.9,
  );
  const leave = spanAt(outline, 12, tLow),
    lower = spanAt(outline, 12, Math.max(0, tLow - 0.15));
  const from = lower.p,
    low = leave.p;
  // Beside a long metacarpal (a thumb reaching out) the edge runs parallel
  // to it, just outside; a short one (a thumb folded in), or one turned back
  // toward the wrist (a thumb folded under the palm), leaves a plain soft
  // arc from the wrist to the thumb.
  const lenM = Math.hypot(mcp.x - cmc.x, mcp.y - cmc.y);
  // (A thumb spread wide — its MCP well outside the palm's side, an octave —
  // stretches the web: the edge runs straight from the palm's side to the
  // thumb, a broad fold of skin, not a second limb along the metacarpal.)
  const spreadOut = smooth(((dir * (P.back[15].x - mcp.x)) / u - 0.4) / 0.9);
  const long =
    smooth((lenM / u - 0.8) / 0.6) * smooth(((cmc.y - mcp.y) / Math.max(1, lenM) + 0.3) / 0.4) * (1 - spreadOut);
  const chord = sub(root, low);
  const chordLen = Math.hypot(chord.x, chord.y) || 1;
  const chordDir = { x: chord.x / chordLen, y: chord.y / chordLen };
  // (Spread wide, the palm's side swells into the thenar near the palm and
  // narrows to the thumb's root, so the thumb leaves it as a digit, not as
  // the end of one long limb from the wrist.)
  const B = lerp(
    add(lerp(low, root, 0.5 - 0.08 * spreadOut), { x: dir * chordDir.y, y: -dir * chordDir.x }, (0.08 + 0.05 * spreadOut) * chordLen),
    add(lerp(cmc, mcp, 0.5), nM, 0.38 * u),
    long,
  );
  const meta = unit(lerp(chordDir, unit(sub(mcp, cmc)), long));
  const s1 = Math.hypot(B.x - low.x, B.y - low.y),
    s2 = Math.hypot(root.x - B.x, root.y - B.y);
  const a1 = add(low, leave.d, 0.4 * s1),
    a2 = add(B, meta, -0.4 * s1),
    a3 = add(B, meta, 0.35 * s2),
    a4 = add(root, meta, -0.3 * s2);
  // (From lower on the palm's side, leaving it smoothly.)
  const rise = Math.hypot(low.x - from.x, low.y - from.y);
  const f1 = add(from, lower.d, 0.5 * rise),
    f2 = add(low, leave.d, -0.3 * rise);
  // The web's edge runs down the thumb's inner side toward its root, dips
  // toward the palm in a soft crotch between the thumb and the index, and
  // rises to the index side; the farther apart they are, the wider the
  // crotch, so the thumb always reads as a digit of its own.
  // (The crotch dips toward where the thumb's and the index's metacarpals
  // meet, the CMC: into the palm beside a relaxed thumb, toward the wrist
  // under a stretched one. Continuous as the thumb turns.)
  const gap = sub(indexSide, rootIn);
  const gapLen = Math.hypot(gap.x, gap.y) || 1;
  const along = { x: gap.x / gapLen, y: gap.y / gapLen };
  const toC = sub(cmc, lerp(rootIn, indexSide, 0.5));
  const dip = (-along.y * toC.x + along.x * toC.y) / Math.max(Math.hypot(toC.x, toC.y), 0.5 * u);
  const crotch = add(lerp(rootIn, indexSide, 0.42), { x: -along.y, y: along.x }, 0.16 * gapLen * dip);
  const w1 = lerp(hold, rootIn, 0.75),
    w2 = add(crotch, along, -0.3 * gapLen),
    w3 = add(crotch, along, 0.3 * gapLen),
    w4 = lerp(indexSide, P.back[14], 0.3);
  const thenar = (path) => {
    const start = inside(from, 0.3),
      b14 = inside(P.back[14], 0.3),
      b13 = inside(P.back[13], 0.3);
    path.moveTo(start.x, start.y);
    path.lineTo(from.x, from.y);
    path.bezierCurveTo(f1.x, f1.y, f2.x, f2.y, low.x, low.y);
    path.bezierCurveTo(a1.x, a1.y, a2.x, a2.y, B.x, B.y);
    path.bezierCurveTo(a3.x, a3.y, a4.x, a4.y, root.x, root.y);
    path.lineTo(on.x, on.y);
    path.lineTo(hold.x, hold.y);
    path.bezierCurveTo(w1.x, w1.y, w2.x, w2.y, crotch.x, crotch.y);
    path.bezierCurveTo(w3.x, w3.y, w4.x, w4.y, indexSide.x, indexSide.y);
    path.lineTo(b14.x, b14.y);
    path.lineTo(b13.x, b13.y);
    path.closePath();
    return path;
  };
  const web = thenar(new Path2D());

  // Where to press (filled) and where to go next (dotted), on the keys.
  const markR = clamp(u * 0.22, 5.5, 11);
  for (const f of fingers) {
    if (f.state === "down") {
      const at = f.axis.at(-1);
      const grow = 1 + 0.15 * f.press;
      ctx.beginPath();
      ctx.ellipse(at.x, at.y - 2, markR * grow, 2.4 * grow, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ink.rgb}, 0.92)`;
      ctx.fill();
    } else if (f.landing && f.landing.alpha > 0) {
      const at = f.landing;
      // A footprint far from the hand (a leap) fades in as the canvas comes
      // near it, rather than being cut by the canvas edge.
      const edge = clamp((width / 2 - Math.abs(at.x) - markR - 2) / (0.6 * u), 0, 1);
      if (!(edge > 0)) continue;
      ctx.beginPath();
      ctx.ellipse(at.x, at.y - 2, markR, 4.5, 0, 0, Math.PI * 2);
      ctx.setLineDash([2.3, 2.3]);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = `rgba(${ink.rgb}, ${+(0.84 * at.alpha * edge).toFixed(3)})`;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // A lifted pad casts a soft shadow on the key it hovers over, just ahead
  // of the drawn tip (the tip itself has retreated toward the knuckle).
  for (const s of [thumbShape, ...shapes]) {
    const lift = s.f.lift;
    if (!(lift > 0) || s.f.state === "down" || (s.thumb && hidden >= 1)) continue;
    ctx.beginPath();
    ctx.ellipse(
      s.tip.x + 1.5 * lift,
      s.tip.y - 0.12 * u - 2 * lift,
      0.22 * u * (1 + 0.3 * lift),
      0.09 * u * (1 + 0.3 * lift),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = `rgba(0, 0, 0, ${+(0.22 * lift * (s.thumb ? 1 - hidden : 1)).toFixed(3)})`;
    ctx.fill();
  }

  // Skin: a light from the fallboard, turned a little as the hand rolls.
  const angle = (roll * dir * 12 * Math.PI) / 180;
  const top = P.knuckleY - 2.2 * u;
  const reach = (P.wrist.y - top) / 2;
  const mid = { x: cx, y: top + reach };
  const toward = { x: -Math.sin(angle) * reach, y: Math.cos(angle) * reach };
  const skin = gradient(ctx, `skin ${mid.x} ${mid.y} ${reach} ${roll * dir}`, () => {
    const g = ctx.createLinearGradient(
      mid.x - toward.x,
      mid.y - toward.y,
      mid.x + toward.x,
      mid.y + toward.y,
    );
    g.addColorStop(0, HAND.light);
    g.addColorStop(0.55, HAND.mid);
    g.addColorStop(1, HAND.deep);
    return g;
  });

  // Outlines, then fills. The fingers and palm are one silhouette (their
  // shared edges are covered by their fills); the thumb lies beneath them,
  // and the more it is under the hand, the more their edges show over it.
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const edgeW = Math.max(1.2, u * 0.05);
  ctx.lineWidth = edgeW;
  ctx.strokeStyle = rgba(HAND.edge);
  ctx.stroke(thumbPath);
  for (const s of shapes) ctx.stroke(s.path);
  ctx.stroke(web);
  ctx.stroke(palm);
  // A soft light across the back of the hand, shifted as the hand rolls:
  // on the thumb as on the palm, so their skin meets without a seam.
  const gx = cx - dir * half * 0.2 - roll * dir * 0.25 * half;
  const glow = gradient(ctx, `glow ${gx} ${P.knuckleY} ${half}`, () => {
    const g = ctx.createRadialGradient(gx, P.knuckleY + 0.7 * u, 0, gx, P.knuckleY + 0.9 * u, half * 1.4);
    g.addColorStop(0, rgba(HAND.sheen));
    g.addColorStop(1, rgba(HAND.sheen, 0));
    return g;
  });
  const sheen = () => {
    ctx.fillStyle = glow;
    ctx.fillRect(cx - half * 2, P.knuckleY - u, half * 4, 4 * u);
  };
  ctx.fillStyle = skin;
  ctx.fill(thumbPath);
  ctx.save();
  ctx.clip(thumbPath);
  sheen();
  ctx.restore();
  thumbDetails(ctx, thumbShape, u, hidden, dim);
  if (beneath > 0) {
    ctx.save();
    ctx.clip(thumbPath);
    ctx.strokeStyle = rgba(HAND.edge, beneath);
    for (const s of shapes) ctx.stroke(s.path);
    ctx.stroke(palm);
    ctx.restore();
  }
  ctx.fillStyle = skin;
  for (const s of shapes) ctx.fill(s.path);
  ctx.fill(web);
  // (The thenar's light before the palm covers their overlap, so each
  // spot of skin is lit once and the two meet without a seam.)
  ctx.save();
  ctx.clip(web);
  sheen();
  ctx.restore();
  ctx.fill(palm);

  ctx.save();
  ctx.clip(palm);
  sheen();
  // (A thumb beneath the palm is hidden by it: no shadow of it is painted
  // on the back of the hand, which would read as a bruise. Its key mark
  // carries its number while it passes.)
  // Knuckle dimples, following the (tilted) knuckle row.
  ctx.fillStyle = rgba(HAND.crease, dim);
  for (const s of shapes) {
    ctx.beginPath();
    ctx.ellipse(s.base.x, s.base.y + 0.12 * u, u * 0.1, u * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Creases and nails on each finger; a rosy pad on a pressing finger.
  for (const s of shapes) fingerDetails(ctx, s, u, dim);

  // Finger numbers on fingers that play, prepare, or have just let go.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const ringR = clamp(u * 0.24, 7, 10.5);
  // A thumb beneath the hand hides its ring, except once it is down: the
  // key it sounds carries its filled number from the strike itself (§7: the
  // filled ring is the attack cue), drawn over the hand that covers it.
  const thumbRing = thumb.state === "down" ? 1 : 1 - hidden;
  // Rings never cover each other: a ring on a finger that is not down
  // steps aside from a ring already placed (a down finger's ring stays on
  // its pad). Placed in order of priority: down rings first.
  const order = [thumbShape, ...shapes.slice().reverse()];
  const placed = [];
  const ringAt = new Map();
  for (const pass of [true, false])
    for (const s of order) {
      const f = s.f;
      if ((f.state === "down") !== pass || !s.nail) continue;
      const alpha = f.number * (s.thumb ? thumbRing : 1);
      if (!(alpha > 0)) continue;
      let c = s.nail;
      if (!pass)
        for (const q of placed) {
          const dx = c.x - q.x,
            dy = c.y - q.y;
          const d = Math.hypot(dx, dy);
          const need = 2.05 * ringR;
          if (d >= need) continue;
          // (Straight away from the other ring; toward the fallboard when
          // they coincide.)
          const ux = d > 1e-6 ? dx / d : 0,
            uy = d > 1e-6 ? dy / d : -1;
          c = { x: q.x + ux * need, y: q.y + uy * need };
        }
      placed.push(c);
      ringAt.set(s, c);
    }
  for (const s of order) {
    const f = s.f;
    const alpha = f.number * (s.thumb ? thumbRing : 1);
    if (!(alpha > 0) || !ringAt.has(s)) continue;
    const filled = f.state !== "ready";
    const c = ringAt.get(s);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(c.x, c.y, ringR, 0, Math.PI * 2);
    ctx.fillStyle = filled ? `rgb(${ink.rgb})` : "#fff6ea";
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = filled ? "rgba(255, 250, 240, 0.95)" : `rgba(${ink.rgb}, 0.95)`;
    ctx.stroke();
    ctx.font = `700 ${Math.max(9.5, ringR * 1.15)}px ${FONT}`;
    ctx.fillStyle = ink.ink;
    ctx.fillText(String(f.finger), c.x, c.y + 0.4);
    ctx.globalAlpha = 1;
  }
}

// A pad's blush and nail; the nail brightens and grows a little as the pad
// lifts toward the eye.
function nailAndBlush(ctx, s, u, alpha) {
  const axis = unit(sub(s.tip, s.base));
  if (s.f.state === "down" && s.f.press > 0) {
    ctx.fillStyle = rgba(HAND.blush, s.f.press * alpha);
    ctx.beginPath();
    ctx.arc(s.tip.x, s.tip.y, s.w * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  const nail = add(s.tip, axis, -s.w * 0.44);
  s.nail = nail;
  if (!(alpha > 0)) return;
  const grow = 1 + 0.05 * s.f.lift;
  ctx.save();
  ctx.translate(nail.x, nail.y);
  ctx.rotate(Math.atan2(axis.y, axis.x) + Math.PI / 2);
  ctx.beginPath();
  ctx.ellipse(0, 0, s.w * 0.3 * grow, s.w * 0.36 * grow, 0, 0, Math.PI * 2);
  ctx.globalAlpha = (0.75 + 0.25 * s.f.lift) * alpha;
  ctx.fillStyle = rgba(HAND.nail);
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = rgba(HAND.nailEdge);
  ctx.stroke();
  ctx.restore();
}

function fingerDetails(ctx, s, u, dim) {
  const axis = unit(sub(s.tip, s.base));
  const len = Math.hypot(s.tip.x - s.base.x, s.tip.y - s.base.y);
  ctx.save();
  ctx.clip(s.path);
  if (len > u * 0.75) {
    const n = normal(axis);
    const c = add(s.base, axis, len * 0.6);
    const a = add(c, n, s.w * 0.36),
      b = add(c, n, -s.w * 0.36),
      k = add(c, axis, u * 0.06);
    ctx.strokeStyle = rgba(HAND.crease, dim);
    ctx.lineWidth = Math.max(0.8, u * 0.028);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(k.x, k.y, b.x, b.y);
    ctx.stroke();
  }
  nailAndBlush(ctx, s, u, dim);
  ctx.restore();
}

function thumbDetails(ctx, s, u, hidden, dim) {
  ctx.save();
  ctx.clip(s.path);
  // The crease of the thumb's IP joint (s.base), across the thumb.
  if (s.len > u * 0.8 && hidden < 1) {
    const axis = unit(sub(s.tip, s.base));
    const n = normal(axis);
    const c = add(s.base, axis, u * 0.04);
    const a = add(c, n, s.w * 0.42),
      b = add(c, n, -s.w * 0.42),
      k = add(c, axis, u * 0.07);
    ctx.strokeStyle = rgba(HAND.crease, dim * (1 - hidden));
    ctx.lineWidth = Math.max(0.8, u * 0.028);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(k.x, k.y, b.x, b.y);
    ctx.stroke();
  }
  nailAndBlush(ctx, s, u, dim * (1 - hidden));
  ctx.restore();
}
