// Bakes the 3-D hands' skin detail into the hand models' own UV layout:
//
//   public/models/hands/{left,right}-skin-n.png   RGB  tangent-space normal
//                                                  A    roughness
//   public/models/hands/{left,right}-skin-d.png   R    hue (0.5 neutral; up redder — knuckles,
//                                                       fingertips — down bluer: veins)
//                                                  G    cavity (creases, folds: darker)
//                                                  B    nail plate
//                                                  A    nail whiteness (free edge, lunula)
//
//   node scripts/bake-hand-maps.mjs [--size 1024] [--preview dir]
//
// The converted MRTK hands have UVs but no skin texture: their skin is one
// smooth surface, which renders as a rubber glove. This lays out what a
// hand's back shows, in millimetres on the prepared model (hand3d-rig.mjs
// prepareTemplate — the same model the renderer draws): each nail (its plate,
// cuticle fold, lunula and free edge), the creases over every finger's
// middle and last joints and over the knuckles, the thumb's joints, the
// extensor tendons and a few veins over the back of the hand, the redder
// skin over the knuckles and at the fingertips. The heights become a
// normal map in the tangent frame three.js builds from the same mesh
// (BufferGeometry.computeTangents), so the renderer only samples it.
// Everything is a deterministic function of the model, so a bake is
// reproducible; tests/hand3d.test.mjs checks the shipped maps against
// BAKE_VERSION.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { handTemplate, prepareTemplate, HandRig, POSTURE, CHAINS, FINGERS, DIGITS } from "../src/hand3d-rig.mjs";
import { HAND_RENDER_GEOMETRY } from "../src/hand3d-data.mjs";

export const BAKE_VERSION = 9;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((list, a, i, all) => {
    if (a.startsWith("--")) list.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
    return list;
  }, []),
);
const SIZE = +(args.size || 1024);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/models/hands");

// ---- PNG (RGBA, 8 bit) ------------------------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
export function encodePNG(rgba, w, h) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  const tries = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < h; y++) {
    line.set(rgba.subarray(y * stride, (y + 1) * stride));
    // (Each row with the filter that leaves the smallest residuals.)
    let best = 0,
      bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const t = tries[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? line[i - 4] : 0,
          b = y ? prev[i] : 0,
          c = i >= 4 && y ? prev[i - 4] : 0;
        let p;
        if (f === 0) p = 0;
        else if (f === 1) p = a;
        else if (f === 2) p = b;
        else if (f === 3) p = (a + b) >> 1;
        else {
          const pa = Math.abs(b - c),
            pb = Math.abs(a - c),
            pc = Math.abs(a + b - 2 * c);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (line[i] - p) & 0xff;
        t[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    raw.set(tries[best], y * (stride + 1) + 1);
    prev.set(line);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---- noise -------------------------------------------------------------------------------
const fract = (x) => x - Math.floor(x);
function hash3(x, y, z) {
  let px = fract(x * 0.1031),
    py = fract(y * 0.1031),
    pz = fract(z * 0.1031);
  const d = px * (pz + 31.32) + py * (py + 31.32) + pz * (px + 31.32);
  px += d;
  py += d;
  pz += d;
  return fract((px + py) * pz);
}
function vnoise(x, y, z) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const fx = s(x - ix),
    fy = s(y - iy),
    fz = s(z - iz);
  const h = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  const l = (a, b, k) => a + (b - a) * k;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy), l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const band = (x, a, b, soft) => smooth((x - a) / soft + 0.5) * (1 - smooth((x - b) / soft + 0.5));
const gauss = (x, s) => Math.exp(-(x * x) / (s * s));

// ---- the anatomy, from the prepared model ------------------------------------------------
// Every joint's bind frame (model space, mm) as plain numbers for the hot loop:
// position, and the rows of its inverse rotation (world → joint).
function frames(rig) {
  const out = {};
  for (const [name, b] of rig.bind) {
    const inv = b.q.clone().invert();
    const m = new THREE.Matrix4().makeRotationFromQuaternion(inv).elements;
    out[name] = { p: [b.p.x * 1000, b.p.y * 1000, b.p.z * 1000], r: [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]] };
  }
  return out;
}
// A point (mm, model space) in a joint's frame: [across, dorsal, along] (along: toward the tip).
function local(f, x, y, z, out) {
  const dx = x - f.p[0],
    dy = y - f.p[1],
    dz = z - f.p[2];
  out[0] = f.r[0] * dx + f.r[1] * dy + f.r[2] * dz;
  out[1] = f.r[3] * dx + f.r[4] * dy + f.r[5] * dz;
  out[2] = -(f.r[6] * dx + f.r[7] * dy + f.r[8] * dz);
  return out;
}
function localDir(f, x, y, z, out) {
  out[0] = f.r[0] * x + f.r[1] * y + f.r[2] * z;
  out[1] = f.r[3] * x + f.r[4] * y + f.r[5] * z;
  out[2] = -(f.r[6] * x + f.r[7] * y + f.r[8] * z);
  return out;
}

// The skin's features at a point: height (mm) and the colour, cavity and
// roughness around it. `ctx`: the texel's digit memberships and normal.
export function makeSkin(tpl, rig) {
  const F = frames(rig);
  const k = rig.scale; // (the model's size against the original)
  const len = (a, b) => Math.hypot(F[a].p[0] - F[b].p[0], F[a].p[1] - F[b].p[1], F[a].p[2] - F[b].p[2]);
  const digits = DIGITS.map((d, di) => {
    const ch = CHAINS[d];
    const thumb = d === "thumb";
    const pad = rig.pads[d];
    return {
      d,
      di,
      thumb,
      // (Joint frames: the thumb's MCP and IP; a finger's MCP, PIP, DIP.)
      mcp: F[ch[thumb ? 1 : 1]],
      pip: thumb ? null : F[ch[2]],
      ip: thumb ? F[ch[2]] : F[ch[3]],
      lastLen: pad.len * 1000,
      padR: pad.r * 1000,
      prox: thumb ? len(ch[1], ch[2]) : len(ch[1], ch[2]),
      mid: thumb ? 0 : len(ch[2], ch[3]),
      // Nail: length, half-width (mm on the original model, scaled).
      nail: (thumb ? [14.2, 6.6] : d === "pinky" ? [10.6, 4.4] : d === "index" ? [12.6, 5.1] : d === "middle" ? [13.4, 5.4] : [12.8, 5.1]).map((v) => v * k),
      seed: 17.3 * (di + 1),
    };
  });
  // The back of the hand (hand frame: x across, y up out of the back, z toward the wrist).
  const toHand = new THREE.Matrix4().makeRotationFromQuaternion(rig.toHand).elements;
  const O = rig.origin.clone().multiplyScalar(1000);
  const H = (x, y, z, out) => {
    const dx = x - O.x,
      dy = y - O.y,
      dz = z - O.z;
    out[0] = toHand[0] * dx + toHand[4] * dy + toHand[8] * dz;
    out[1] = toHand[1] * dx + toHand[5] * dy + toHand[9] * dz;
    out[2] = toHand[2] * dx + toHand[6] * dy + toHand[10] * dz;
    return out;
  };
  const HD = (x, y, z, out) => {
    out[0] = toHand[0] * x + toHand[4] * y + toHand[8] * z;
    out[1] = toHand[1] * x + toHand[5] * y + toHand[9] * z;
    out[2] = toHand[2] * x + toHand[6] * y + toHand[10] * z;
    return out;
  };
  const hp = (j) => H(F[j].p[0], F[j].p[1], F[j].p[2], [0, 0, 0]);
  const heads = FINGERS.map((f) => hp(CHAINS[f][1]));
  const wristH = hp("wrist");
  // The extensor tendons: from each knuckle head toward the middle of the wrist.
  const tendons = heads.map((h, j) => ({
    a: [h[0], h[2] + 7 * k],
    b: [h[0] + (wristH[0] - h[0]) * 0.62, wristH[2] - 6 * k],
    w: [0.85, 1, 0.9, 0.6][j],
  }));
  // A few veins over the back of the hand: polylines (hand frame x, z; mm),
  // from between the knuckles toward the wrist, a little wandering.
  const veins = [];
  {
    const between = [0, 1, 2].map((j) => [(heads[j][0] + heads[j + 1][0]) / 2, (heads[j][2] + heads[j + 1][2]) / 2 + 12 * k]);
    const starts = [between[0], between[1], between[2], [heads[3][0] + 5 * k, heads[3][2] + 18 * k]];
    starts.forEach((s, v) => {
      const pts = [s];
      let [x, z] = s;
      const toward = wristH[0] + (v - 1.5) * 9 * k;
      for (let i = 1; i <= 8; i++) {
        z += ((wristH[2] - 4 * k - s[1]) / 8) * (1 + 0.15 * Math.sin(v * 3.1 + i));
        x += (toward - x) * 0.18 + 2.2 * k * Math.sin(v * 1.7 + i * 1.3);
        pts.push([x, z]);
      }
      veins.push({ pts, w: [0.75, 1, 0.8, 0.6][v], r: [1.15, 1.35, 1.2, 1.0][v] * k });
    });
    // (A cross branch joining the middle two.)
    veins.push({ pts: [veins[1].pts[4], [(veins[1].pts[5][0] + veins[2].pts[5][0]) / 2, veins[1].pts[5][1] + 6 * k], veins[2].pts[6]], w: 0.6, r: 1.0 * k });
  }
  const segD = (px, pz, a, b) => {
    const ex = b[0] - a[0],
      ez = b[1] - a[1];
    const l2 = ex * ex + ez * ez || 1;
    const t = clamp(((px - a[0]) * ex + (pz - a[1]) * ez) / l2, 0, 1);
    return [Math.hypot(px - (a[0] + ex * t), pz - (a[1] + ez * t)), t];
  };
  const L = [0, 0, 0],
    N = [0, 0, 0],
    hh = [0, 0, 0],
    hn = [0, 0, 0];

  // Creases across a joint's back: lines at `at` (mm along, from the joint),
  // bowed, each `span` mm long across with soft ends; depth, width (mm).
  function creases(along, across, lines, depth, width, seed) {
    let h = 0;
    for (let i = 0; i < lines.length; i++) {
      const [at, span, w] = lines[i];
      const wob = 0.18 * (vnoise(across * 0.35 + seed, i * 7.1, seed) - 0.5);
      const a = along - (at + wob - 0.03 * across * across);
      if (Math.abs(a) > 3 * width) continue;
      const ends = 1 - smooth((Math.abs(across) - span) / 1.2 + 0.5);
      if (!(ends > 0)) continue;
      // (Each line broken a little along its length.)
      const brk = 0.65 + 0.35 * vnoise(across * 0.9 + seed * 3, i * 3.3 + seed, 1.7);
      h -= depth * w * ends * brk * gauss(a, width);
    }
    return h;
  }

  // The skin at (x, y, z) mm with normal n; `memb`: membership per digit (5)
  // and of the back of the hand. Writes { h, red, cav, nail, white, rough };
  // `heightOnly` skips the rest.
  return function skin(x, y, z, nx, ny, nz, memb, out, heightOnly = false) {
    let h = 0,
      red = 0,
      blue = 0,
      cav = 0,
      nail = 0,
      white = 0,
      rough = 0.5;
    for (const g of digits) {
      const m = memb[g.di];
      if (!(m > 0.02)) continue;
      // The nail, in the last joint's frame.
      local(g.ip, x, y, z, L);
      localDir(g.ip, nx, ny, nz, N);
      const along = L[2],
        across = L[0];
      const [nl, nw] = g.nail;
      const tipEnd = g.lastLen;
      const centre = tipEnd - 0.5 * nl - 0.2 * k;
      // (Only on the back of the digit: its normal out of the back.)
      const back = smooth((N[1] - 0.05) / 0.35);
      if (back > 0 && along > centre - nl) {
        // A rounded plate, its base (cuticle) a curve, its free edge at the tip.
        const u = across / nw,
          v = (along - centre) / (0.5 * nl);
        const r = Math.pow(Math.pow(Math.abs(u), 2.8) + Math.pow(Math.abs(v), 3.2), 1 / 3);
        const plate = (1 - smooth((r - 0.93) / 0.09 + 0.5)) * back;
        const fold = gauss(r - 1.07, 0.07) * back * (v < 0.6 ? 1 : 0.2);
        h += 0.24 * plate * m - 0.13 * fold * m;
        // The same mask also controls height detail below, so it must be
        // available to both the full and finite-difference sampling paths.
        nail = Math.max(nail, plate * m);
        if (!heightOnly) {
          // The free edge (pale, past the nail bed) and the lunula (pale crescent at its base).
          const edge = smooth((along - (tipEnd - 1.9 * k)) / (0.5 * k));
          const lunula = (1 - smooth((v + 0.62) / 0.12)) * (1 - smooth((Math.abs(u) - 0.55) / 0.2));
          white = Math.max(white, plate * m * Math.max(edge, 0.55 * lunula));
          cav = Math.max(cav, 0.55 * fold * m);
          rough = rough * (1 - plate * m) + (0.2 + 0.1 * edge) * plate * m;
        }
      }
      if (!heightOnly) {
        // The fingertip flushes (all round).
        red += 0.42 * m * smooth((along - (tipEnd - 7 * k)) / (4 * k));
        // The pad of the fingertip is a little shinier.
        rough -= 0.05 * m * smooth((along - (tipEnd - 8 * k)) / (3 * k)) * smooth((-N[1] - 0.2) / 0.4);
      }
      // The last joint's creases (its back): two or three short lines.
      {
        const bk = smooth((N[1] - 0.1) / 0.35);
        if (bk > 0 && Math.abs(along) < 4 * k) {
          const c = creases(along, across, g.thumb ? [[-2.0 * k, 4.6 * k, 0.75], [-0.7 * k, 5.8 * k, 1], [0.6 * k, 5.6 * k, 0.95], [1.9 * k, 4.0 * k, 0.6]] : [[-1.3 * k, 3.6 * k, 0.8], [0.0, 4.4 * k, 1], [1.3 * k, 3.4 * k, 0.65]], g.thumb ? 0.14 : 0.1, 0.4 * k, g.seed);
          h += c * bk * m;
          if (!heightOnly) {
            cav = Math.max(cav, clamp(-c * 3.6, 0, 1) * bk * m);
            red += (g.thumb ? 0.3 : 0.28) * bk * m * gauss(along, 3.2 * k) * gauss(across, 5 * k);
          }
        }
      }
      if (g.thumb) {
        // The thumb's MCP: a few faint lines, and its knuckle a little red.
        local(g.mcp, x, y, z, L);
        localDir(g.mcp, nx, ny, nz, N);
        const bk = smooth((N[1] - 0.1) / 0.35);
        if (bk > 0 && Math.abs(L[2]) < 6 * k) {
          const c = creases(L[2], L[0], [[-2.0 * k, 5 * k, 0.6], [-0.6 * k, 6.2 * k, 0.85], [0.8 * k, 5.6 * k, 0.7]], 0.08, 0.4 * k, g.seed + 5);
          h += c * bk * m + 0.3 * bk * m * gauss(L[2], 3.5 * k) * gauss(L[0], 5 * k);
          if (!heightOnly) {
            cav = Math.max(cav, clamp(-c * 4, 0, 1) * bk * m);
            red += 0.3 * bk * m * gauss(L[2], 4 * k) * gauss(L[0], 5.5 * k);
          }
        }
        continue;
      }
      // The middle joint (PIP): the deepest creases, over a soft pad.
      local(g.pip, x, y, z, L);
      localDir(g.pip, nx, ny, nz, N);
      {
        const bk = smooth((N[1] - 0.05) / 0.35);
        if (bk > 0 && Math.abs(L[2]) < 7 * k) {
          const c = creases(
            L[2],
            L[0],
            [
              [-2.3 * k, 4.5 * k, 0.65],
              [-0.3 * k, 6.2 * k, 1],
              [1.8 * k, 4.5 * k, 0.7],
            ],
            0.16,
            0.62 * k,
            g.seed + 11,
          );
          const pad = 0.45 * gauss(L[2] + 0.6 * k, 3.6 * k) * gauss(L[0], 5 * k);
          h += (c + pad) * bk * m;
          if (!heightOnly) {
            cav = Math.max(cav, clamp(-c * 3.6, 0, 1) * bk * m);
            red += 0.5 * bk * m * gauss(L[2] + 0.4 * k, 4.2 * k) * gauss(L[0], 5.5 * k);
            rough += 0.06 * bk * m * gauss(L[2], 4 * k) * gauss(L[0], 5.5 * k);
          }
        }
      }
      // The knuckle (MCP): a few fine lines over its head, the skin redder.
      local(g.mcp, x, y, z, L);
      localDir(g.mcp, nx, ny, nz, N);
      {
        const bk = smooth((N[1] - 0.1) / 0.35);
        if (bk > 0 && L[2] > -6 * k && L[2] < 9 * k) {
          const c = creases(L[2], L[0], [[1.4 * k, 4.6 * k, 0.6], [2.8 * k, 5.4 * k, 0.75], [4.2 * k, 4.4 * k, 0.5]], 0.1, 0.5 * k, g.seed + 23);
          h += c * bk * m;
          if (!heightOnly) {
            cav = Math.max(cav, clamp(-c * 4, 0, 1) * bk * m);
            red += 0.42 * bk * m * gauss(L[2] - 0.5 * k, 4.6 * k) * gauss(L[0], 6 * k);
          }
        }
      }
    }
    // The back of the hand.
    const mb = memb[5];
    if (mb > 0.02) {
      H(x, y, z, hh);
      HD(nx, ny, nz, hn);
      const bk = smooth((hn[1] - 0.15) / 0.4);
      if (bk > 0) {
        for (const t of tendons) {
          const [d, s] = segD(hh[0], hh[2], t.a, t.b);
          const along = smooth(s / 0.12) * (1 - smooth((s - 0.72) / 0.28));
          h += 0.14 * t.w * gauss(d, 2.5 * k) * along * bk * mb;
          if (!heightOnly) rough += 0.03 * t.w * gauss(d, 2.4 * k) * along * bk * mb;
        }
        for (const v of veins) {
          let best = Infinity;
          for (let i = 0; i + 1 < v.pts.length; i++) best = Math.min(best, segD(hh[0], hh[2], v.pts[i], v.pts[i + 1])[0]);
          const g = gauss(best, 1.3 * v.r) * bk * mb * v.w;
          h += 0.06 * g;
          if (!heightOnly) blue += 0.32 * g;
        }
        // Height and derivative samples must contain the same surface terms.
        // Previously the wrist texture was omitted from derivative samples,
        // introducing a false normal instead of a skin wrinkle.
        const dry = 0.016 * (vnoise(hh[0] * 0.24, hh[2] * 0.82, 2.3) - 0.5);
        h += dry * bk * mb;
        if (!heightOnly) {
          // The valleys between the knuckle heads: a little in shadow.
          for (let j = 0; j < 3; j++) {
            const mx = (heads[j][0] + heads[j + 1][0]) / 2,
              mz = (heads[j][2] + heads[j + 1][2]) / 2 + 5 * k;
            cav = Math.max(cav, 0.35 * gauss(hh[0] - mx, 3.2 * k) * gauss(hh[2] - mz, 7 * k) * bk * mb);
          }
        }
      }
    }
    // Small irregular skin relief breaks the smooth rubber-like highlight.
    // It is baked in physical space once, follows the skinning, and is
    // mip-filtered with the map rather than shimmering as screen noise.
    const grain = vnoise(x * 0.8, y * 0.8, z * 0.8);
    const pores = vnoise(x * 1.3 + 3.7, y * 1.3, z * 1.3);
    h += (0.026 * (grain - 0.5) + 0.009 * (pores - 0.5)) * (1 - nail);
    rough += 0.065 * (grain - 0.5) * (1 - nail);
    out.h = h;
    if (heightOnly) return out;
    out.red = red;
    out.blue = blue;
    out.cav = cav;
    out.nail = nail;
    out.white = white;
    out.rough = rough;
    return out;
  };
}

// ---- the bake ------------------------------------------------------------------------------
export function bakeHand(tpl, size = SIZE) {
  const rig = new HandRig(tpl);
  const skin = makeSkin(tpl, rig);
  const n = tpl.position.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(tpl.position, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(tpl.normal, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(tpl.uv, 2));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(tpl.index), 1));
  g.computeTangents();
  const T = g.getAttribute("tangent").array;
  // Each vertex's membership of each digit (its skin weights on the digit's
  // bones; the fingers' metacarpals are the back of the hand) and of the back.
  const digitOf = new Map();
  for (const d of DIGITS) for (const j of CHAINS[d]) digitOf.set(tpl.names.indexOf(j), d === "thumb" || !j.endsWith("metacarpal") ? DIGITS.indexOf(d) : 5);
  digitOf.set(tpl.names.indexOf("wrist"), 5);
  const memb = new Float32Array(n * 6);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 4; c++) {
      const w = tpl.weights[4 * i + c];
      if (!(w > 0)) continue;
      const d = digitOf.get(tpl.joints[4 * i + c]);
      if (d != null) memb[6 * i + d] += w;
    }
  const S = size;
  const covered = new Uint8Array(S * S);
  const nrm = new Uint8ClampedArray(S * S * 4);
  const det = new Uint8ClampedArray(S * S * 4);
  const P = tpl.position,
    NN = tpl.normal,
    UV = tpl.uv,
    I = tpl.index;
  const out = {},
    oh = {};
  const mb = new Float32Array(6);
  const e = 0.06; // mm, for the height's gradient
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t],
      b = I[t + 1],
      c = I[t + 2];
    const ax = UV[2 * a] * S,
      ay = UV[2 * a + 1] * S,
      bx = UV[2 * b] * S,
      by = UV[2 * b + 1] * S,
      cx = UV[2 * c] * S,
      cy = UV[2 * c + 1] * S;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (!(Math.abs(area) > 1e-9)) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)),
      x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)),
      y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy) + 1));
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const sx = px + 0.5,
          sy = py + 0.5;
        let w0 = ((bx - sx) * (cy - sy) - (cx - sx) * (by - sy)) / area;
        let w1 = ((cx - sx) * (ay - sy) - (ax - sx) * (cy - sy)) / area;
        let w2 = 1 - w0 - w1;
        // (Texel centres inside, or within a hair of an edge.)
        const lim = -0.5 / Math.sqrt(Math.abs(area));
        if (w0 < lim || w1 < lim || w2 < lim) continue;
        const idx = py * S + px;
        const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
        if (covered[idx] === 2 || (covered[idx] === 1 && !inside)) continue;
        if (!inside) {
          w0 = Math.max(0, w0);
          w1 = Math.max(0, w1);
          w2 = Math.max(0, w2);
          const s = w0 + w1 + w2;
          w0 /= s;
          w1 /= s;
          w2 /= s;
        }
        covered[idx] = inside ? 2 : 1;
        const lerp3 = (arr, k) => arr[3 * a + k] * w0 + arr[3 * b + k] * w1 + arr[3 * c + k] * w2;
        const x = lerp3(P, 0) * 1000,
          y = lerp3(P, 1) * 1000,
          z = lerp3(P, 2) * 1000;
        let nx = lerp3(NN, 0),
          ny = lerp3(NN, 1),
          nz = lerp3(NN, 2);
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        for (let d = 0; d < 6; d++) mb[d] = memb[6 * a + d] * w0 + memb[6 * b + d] * w1 + memb[6 * c + d] * w2;
        skin(x, y, z, nx, ny, nz, mb, out);
        // The height's gradient over the surface: the perturbed normal.
        const h0 = out.h;
        const gx = (skin(x + e, y, z, nx, ny, nz, mb, oh, true).h - h0) / e;
        const gy = (skin(x, y + e, z, nx, ny, nz, mb, oh, true).h - h0) / e;
        const gz = (skin(x, y, z + e, nx, ny, nz, mb, oh, true).h - h0) / e;
        const dn = gx * nx + gy * ny + gz * nz;
        let px2 = nx - (gx - dn * nx),
          py2 = ny - (gy - dn * ny),
          pz2 = nz - (gz - dn * nz);
        const pl = Math.hypot(px2, py2, pz2) || 1;
        px2 /= pl;
        py2 /= pl;
        pz2 /= pl;
        // Into the tangent frame three.js builds: T (Gram-Schmidt on N), B = N × T · w.
        let tx = T[4 * a] * w0 + T[4 * b] * w1 + T[4 * c] * w2,
          ty = T[4 * a + 1] * w0 + T[4 * b + 1] * w1 + T[4 * c + 1] * w2,
          tz = T[4 * a + 2] * w0 + T[4 * b + 2] * w1 + T[4 * c + 2] * w2;
        const tw = T[4 * a + 3] * w0 + T[4 * b + 3] * w1 + T[4 * c + 3] * w2 < 0 ? -1 : 1;
        const tdn = tx * nx + ty * ny + tz * nz;
        tx -= tdn * nx;
        ty -= tdn * ny;
        tz -= tdn * nz;
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        const bx2 = (ny * tz - nz * ty) * tw,
          by2 = (nz * tx - nx * tz) * tw,
          bz2 = (nx * ty - ny * tx) * tw;
        const ts = px2 * tx + py2 * ty + pz2 * tz,
          bs = px2 * bx2 + py2 * by2 + pz2 * bz2,
          ns = px2 * nx + py2 * ny + pz2 * nz;
        const o = idx * 4;
        nrm[o] = Math.round((ts * 0.5 + 0.5) * 255);
        nrm[o + 1] = Math.round((bs * 0.5 + 0.5) * 255);
        nrm[o + 2] = Math.round((ns * 0.5 + 0.5) * 255);
        nrm[o + 3] = Math.round(clamp(out.rough, 0, 1) * 255);
        det[o] = Math.round(clamp(0.5 + 0.5 * out.red - 0.5 * out.blue, 0, 1) * 255);
        det[o + 1] = Math.round(clamp(out.cav, 0, 1) * 255);
        det[o + 2] = Math.round(clamp(out.nail, 0, 1) * 255);
        det[o + 3] = Math.round(clamp(out.white, 0, 1) * 255);
      }
  }
  // Islands grown outward a few texels, so mipmaps and filtering never pull
  // in the empty texture between them.
  const filled = Uint8Array.from(covered, (v) => (v ? 1 : 0));
  for (let pass = 0; pass < 10; pass++) {
    const next = filled.slice();
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        if (filled[i]) continue;
        let cnt = 0;
        const acc = [0, 0, 0, 0, 0, 0, 0, 0];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
          const j = yy * S + xx;
          if (!filled[j]) continue;
          cnt++;
          for (let ch = 0; ch < 4; ch++) {
            acc[ch] += nrm[4 * j + ch];
            acc[4 + ch] += det[4 * j + ch];
          }
        }
        if (!cnt) continue;
        for (let ch = 0; ch < 4; ch++) {
          nrm[4 * i + ch] = acc[ch] / cnt;
          det[4 * i + ch] = acc[4 + ch] / cnt;
        }
        next[i] = 1;
      }
    filled.set(next);
  }
  // Beyond that, neutral.
  for (let i = 0; i < S * S; i++)
    if (!filled[i]) {
      nrm.set([128, 128, 255, 128], 4 * i);
      det.set([128, 0, 0, 0], 4 * i);
    }
  return { size: S, normal: nrm, detail: det, coverage: covered.reduce((s, v) => s + (v ? 1 : 0), 0) / (S * S) };
}

// ---- main ------------------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const t0 = Date.now();
  const models = {};
  for (const hand of ["left", "right"]) {
    const buf = fs.readFileSync(path.join(OUT, `${hand}.glb`));
    models[hand] = crypto.createHash("sha256").update(buf).digest("hex");
    const tpl = prepareTemplate(handTemplate(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), hand), POSTURE, HAND_RENDER_GEOMETRY);
    const res = bakeHand(tpl, SIZE);
    const n = encodePNG(res.normal, SIZE, SIZE),
      d = encodePNG(res.detail, SIZE, SIZE);
    fs.writeFileSync(path.join(OUT, `${hand}-skin-n.png`), n);
    fs.writeFileSync(path.join(OUT, `${hand}-skin-d.png`), d);
    console.log(`${hand}: ${SIZE}² · coverage ${(res.coverage * 100).toFixed(1)}% · normal ${(n.length / 1024).toFixed(0)} KB · detail ${(d.length / 1024).toFixed(0)} KB · ${Date.now() - t0} ms`);
  }
  fs.writeFileSync(path.join(OUT, "skin-maps.json"), JSON.stringify({ version: BAKE_VERSION, size: SIZE, geometry: HAND_RENDER_GEOMETRY, models }, null, 1) + "\n");
}
