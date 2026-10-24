// The nails of the 3-D hands (hand3d.mjs): a thin, curved plate on the back
// of each digit's last phalanx, fitted to the skin there, a little proud of
// it and running just past the fingertip (its free edge). Seen from the
// stage's camera — nearly from above — a curved finger's last phalanx points
// almost along the line of sight, so a nail painted onto the skin would show
// edge-on, as nothing; a plate standing a fraction of a millimetre off the
// skin shows as the glossy rim at the top of each fingertip that real nails
// show from there, and the thumb, lying on its side, shows its nail whole.
// Pure three.js maths (no WebGL): node runs it for checks.
//
//   const g = nailGeometry(tpl, rig, "index");  // { position, normal, uv, index } in the
//                                              // last phalanx's joint frame, or null
import * as THREE from "three";
import { CHAINS, smoothNormals } from "./hand3d-rig.mjs";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;

export const NAIL = {
  // How much of the last phalanx (from the fingertip back) the nail covers,
  // how far round the digit it reaches either side of its back (radians),
  // how far it stands off the skin (m), how far its free edge runs past the
  // fingertip and how far it turns down there.
  length: { thumb: 0.5, index: 0.5, middle: 0.5, ring: 0.48, pinky: 0.46 },
  wrap: 0.86,
  lift: 0.00018,
  over: 0.00018,
  drop: 0.0002,
  // (Grid: rows along the nail, columns across it.)
  rows: 15,
  cols: 13,
};

// The nail plate of one digit, in its last phalanx's joint frame (x across,
// +y the back of the digit, −z toward the tip): rows from the nail's base to
// its free edge (uv.y 0…1), columns across (uv.x −1…1). Fitted to the skin of
// the bind mesh around the phalanx's axis, row by row.
export function nailGeometry(tpl, rig, digit, N = NAIL) {
  const chain = CHAINS[digit];
  const distal = chain.at(-2),
    tip = chain.at(-1);
  const ids = new Set([tpl.names.indexOf(distal), tpl.names.indexOf(tip)]);
  const b = tpl.bind.get(distal);
  const inv = b.q.clone().invert();
  const pad = rig.pads[digit];
  if (!pad) return null;
  const vertices = new Map();
  const local = (i) => {
    if (!vertices.has(i)) vertices.set(i, new THREE.Vector3().fromArray(tpl.position, i * 3).sub(b.p).applyQuaternion(inv));
    return vertices.get(i);
  };
  const triangles = [];
  for (let i = 0; i < tpl.index.length; i += 3) {
    const indices = [tpl.index[i], tpl.index[i + 1], tpl.index[i + 2]];
    if (!indices.some((j) => ids.has(rig.dominant[j]))) continue;
    const points = indices.map(local);
    triangles.push({ points, min: Math.min(...points.map((p) => p.z)), max: Math.max(...points.map((p) => p.z)) });
  }
  if (triangles.length < 10) return null;
  const end = pad.end;
  const zBase = end + (N.length[digit] ?? 0.5) * -end;
  const cx = pad.c.x, cy = pad.c.y;
  // Intersect a radial ray with the actual skin triangles at this depth.
  // Selecting the largest nearby vertex instead made a nail stand up to
  // 1.8 mm off its skin and jump whenever a different vertex won the slice.
  const radiusAt = (z, phi) => {
    const dx = Math.sin(phi), dy = Math.cos(phi);
    let radius = null;
    for (const tri of triangles) {
      if (z < tri.min || z > tri.max) continue;
      const hits = [];
      for (let edge = 0; edge < 3; edge++) {
        const a = tri.points[edge], b = tri.points[(edge + 1) % 3];
        if (Math.abs(a.z - b.z) < 1e-12) continue;
        const t = (z - a.z) / (b.z - a.z);
        if (t >= 0 && t <= 1) hits.push({ x: lerp(a.x, b.x, t) - cx, y: lerp(a.y, b.y, t) - cy });
      }
      if (hits.length < 2) continue;
      const a = hits[0], ex = hits[1].x - a.x, ey = hits[1].y - a.y;
      const det = dx * ey - dy * ex;
      if (Math.abs(det) < 1e-12) continue;
      const r = (a.x * ey - a.y * ex) / det;
      const t = (a.x * dy - a.y * dx) / det;
      if (r > 0 && t >= -1e-7 && t <= 1 + 1e-7) radius = Math.max(radius ?? 0, r);
    }
    return radius;
  };
  const rows = N.rows, cols = N.cols;
  const position = [], uv = [], fitted = [];
  for (let r = 0; r < rows; r++) {
    const s = r / (rows - 1);
    const row = [];
    // A rounded base, gently narrowing corners and a short squoval tip.
    // There are no full-width rectangular ends or raised artificial caps.
    const width = 1 - 0.24 * Math.pow(1 - s, 4) - 0.1 * Math.pow(s, 5);
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1)) * 2 - 1;
      const phi = u * N.wrap * width;
      const corner = 0.00065 * u * u;
      const z = lerp(zBase, end - N.over, s) - corner * Math.pow(1 - s, 4) + corner * Math.pow(s, 4);
      // Just the free edge extends beyond the last skin. Its support point
      // is close to the rounded tip, not a copied full-width ring upstream.
      const supportZ = Math.max(z, end + 0.00035);
      const radius = radiusAt(supportZ, phi);
      if (radius == null) return null;
      row.push({ z, phi, radius, free: z < supportZ });
    }
    fitted.push(row);
  }
  // Fair the plate across and along the finger. Limit fairing to 0.08 mm
  // from the measured skin so smoothing cannot lift it into a separate cap.
  const fair = (r, c) => {
    const at = (rr, cc) => fitted[clamp(rr, 0, rows - 1)][clamp(cc, 0, cols - 1)].radius;
    const centre = at(r, c);
    const across = (at(r, c - 1) + 2 * centre + at(r, c + 1)) / 4;
    const along = (at(r - 1, c) + 2 * centre + at(r + 1, c)) / 4;
    return clamp((across + along) / 2, centre - 0.00008, centre + 0.00008);
  };
  for (let r = 0; r < rows; r++) {
    const s = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1)) * 2 - 1;
      const point = fitted[r][c];
      const side = 1 - Math.pow(Math.abs(u), 4);
      const base = clamp(s / 0.22, 0, 1);
      const lift = N.lift * side * base - 0.00006 * (1 - side) - 0.00006 * (1 - base);
      const rho = fair(r, c) + lift;
      position.push(cx + rho * Math.sin(point.phi), cy + rho * Math.cos(point.phi) - (point.free ? N.drop * 0.25 : 0), point.z);
      uv.push(u, s);
    }
  }
  const index = [];
  for (let r = 0; r + 1 < rows; r++)
    for (let c = 0; c + 1 < cols; c++) {
      const a = r * cols + c,
        bq = a + 1,
        d = a + cols,
        e = d + 1;
      // (Facing out of the back of the digit.)
      index.push(a, d, bq, bq, d, e);
    }
  const pos = Float32Array.from(position);
  // (Orientation: the plate's normals point away from the digit's axis.)
  const nrm = smoothNormals(pos, index);
  let dot = 0;
  for (let k = 0; k < pos.length / 3; k++) dot += nrm[3 * k + 1] * (pos[3 * k + 1] - cy) + nrm[3 * k] * (pos[3 * k] - cx);
  if (dot < 0) {
    for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
    for (let k = 0; k < nrm.length; k++) nrm[k] = -nrm[k];
  }
  return { position: pos, normal: nrm, uv: Float32Array.from(uv), index: Uint32Array.from(index), joint: distal };
}
