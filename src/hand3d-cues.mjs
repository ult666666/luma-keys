// The 3-D hands' 2-D cues, drawn in the same WebGL picture as the hands
// (hand3d.mjs): beneath them, each key a hand holds shaded as gone down and
// the dotted footprint where a finger will land; above them, the finger
// numbers on their rings and the outline of a thumb passing under the hand.
// Screen space, in the canvas's CSS pixels (y down). Every primitive goes
// into one of a few batched meshes rebuilt per redraw, so a frame costs a
// handful of draw calls and no 2-D canvas work; the rings come from an atlas
// drawn once per set of hand colours.
//
//   const cues = createCues();
//   cues.begin(width, height);
//   cues.shade(x0, y0, x1, y1, [r, g, b, aTop], [r, g, b, aBottom]);    // beneath
//   cues.dashed(points, { closed, width, color, dash, gap, over });      // beneath, or over
//   cues.ring(x, y, radius, { hand, style, finger, alpha });            // over
//   cues.end();
//   cues.render(renderer, "under" | "over");
//   cues.setInk(ink); cues.dispose();
import * as THREE from "three";

// A filled badge means contact, including the exact placement shown in Wait.
// A released number may linger briefly as it fades, but must no longer imply
// that its key is held. Displaced badges keep a quiet tether to their origin.
export function fingerRingCue(ring, radius) {
  const style = ring.ghost > 0.5 || ring.hidden ? "ghost" : ring.f.onKey ? "filled" : "ready";
  const displacement = ring.want - ring.y;
  const leader = ring.f.keyX != null && Math.abs(displacement) > radius * 1.5
    ? [{ x: ring.x, y: ring.y + Math.sign(displacement) * radius }, { x: ring.x, y: ring.want }]
    : null;
  return { style, leader };
}

// The interval cut out of a key column by a capsule expanded by the badge
// radius. A capsule is the union of its endpoint discs and the rectangle
// between them; intersecting those shapes avoids a per-pixel search.
function capsuleColumn(x, capsule, extra) {
  const { a, b } = capsule;
  const radius = capsule.r + extra;
  if (x < Math.min(a.x, b.x) - radius || x > Math.max(a.x, b.x) + radius) return null;
  const ys = [];
  for (const point of [a, b]) {
    const dx = x - point.x;
    if (Math.abs(dx) <= radius) {
      const dy = Math.sqrt(Math.max(0, radius * radius - dx * dx));
      ys.push(point.y - dy, point.y + dy);
    }
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length > 1e-9) {
    const nx = -dy * radius / length, ny = dx * radius / length;
    const corners = [
      { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny },
    ];
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i], q = corners[(i + 1) % corners.length];
      if (Math.abs(q.x - p.x) < 1e-9) {
        if (Math.abs(x - p.x) < 1e-9) ys.push(p.y, q.y);
      } else {
        const t = (x - p.x) / (q.x - p.x);
        if (t >= 0 && t <= 1) ys.push(p.y + t * (q.y - p.y));
      }
    }
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}

// Run after badges have been placed clear of the other hand. Pair spacing
// must stay in that same clear interval: pushing one badge apart must never
// put it back onto unrelated skin. Its x/key, desired fingertip position and
// contact/ghost meaning are untouched, including an already covered fallback.
export function separateFingerRings(rings, { radius, bedTop, bedBottom, silhouettes = {} }) {
  const clearance = radius + 1.5;
  const bounds = new Map(rings.map(ring => {
    let top = bedTop, bottom = bedBottom;
    const other = silhouettes[ring.hand === 'left' ? 'right' : 'left'] || [];
    for (const capsule of other) {
      const interval = capsuleColumn(ring.x, capsule, clearance);
      if (!interval) continue;
      const [from, to] = interval;
      if (to <= ring.y + 1e-7) top = Math.max(top, Math.min(ring.y, to + 1e-6));
      else if (from >= ring.y - 1e-7) bottom = Math.min(bottom, Math.max(ring.y, from - 1e-6));
      else {
        // The original clearance pass found the whole key covered. Keep
        // its least-covered position and existing filled/ghost fallback.
        top = bottom = ring.y;
        break;
      }
    }
    return [ring, { top, bottom }];
  }));
  const minGap = 2.3 * radius;
  // A constrained badge can pass the remaining displacement to its next
  // neighbour. Keep this small relaxation bounded even in dense crossings.
  for (let iteration = 0; iteration < 24; iteration++) {
    let moved = false;
    for (let a = 0; a < rings.length; a++)
      for (let b = a + 1; b < rings.length; b++) {
        const A = rings[a], B = rings[b];
        const dx = Math.abs(B.x - A.x);
        if (dx >= minGap) continue;
        const need = Math.sqrt(minGap * minGap - dx * dx);
        const dy = B.y - A.y;
        if (Math.abs(dy) >= need - 0.01) continue;
        const ab = A.f.keyBlack || 0, bb = B.f.keyBlack || 0;
        const aUp = Math.abs(dy) > 0.01 ? A.y < B.y : ab !== bb ? ab > bb : A.want <= B.want;
        const [hi, lo] = aUp ? [A, B] : [B, A];
        const push = need - Math.abs(dy);
        const roomUp = Math.max(0, hi.y - bounds.get(hi).top);
        const roomDown = Math.max(0, bounds.get(lo).bottom - lo.y);
        let up = Math.min(push * (lo.weight / (hi.weight + lo.weight)), roomUp);
        const down = Math.min(push - up, roomDown);
        up = Math.min(push - down, roomUp);
        hi.y -= up;
        lo.y += down;
        moved ||= up + down > 0.01;
      }
    if (!moved) break;
  }
  return rings;
}

const STYLES = ["filled", "ready", "ghost"];
// (The atlas: a cell per hand × style × finger, drawn at this radius in
// device pixels — finer than the largest ring at the largest pixel ratio.)
const CELL = 64;
const ATLAS_R = 22;
const FONT = "Manrope, -apple-system, BlinkMacSystemFont, sans-serif";

// Premultiplied output throughout (the canvas is premultiplied).
const vertexColorShader = {
  vertexShader: `
    attribute vec4 color4;
    varying vec4 vColor;
    void main() {
      vColor = color4;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec4 vColor;
    void main() { gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a); }`,
};
const dashShader = {
  vertexShader: `
    attribute vec4 color4;
    attribute vec3 dash; // (distance along the line, dash length, gap length)
    varying vec4 vColor;
    varying vec3 vDash;
    void main() {
      vColor = color4;
      vDash = dash;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec4 vColor;
    varying vec3 vDash;
    void main() {
      float period = vDash.y + vDash.z;
      if (vDash.z > 0.0 && mod(vDash.x, period) > vDash.y) discard;
      gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a);
    }`,
};
const spriteShader = {
  uniforms: { atlas: { value: null } },
  vertexShader: `
    attribute float alpha;
    varying vec2 vUv;
    varying float vAlpha;
    void main() {
      vUv = uv;
      vAlpha = alpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D atlas;
    varying vec2 vUv;
    varying float vAlpha;
    void main() { gl_FragColor = texture2D(atlas, vUv) * vAlpha; }`,
};

function batch(max, layout, shader, uniforms = null) {
  const g = new THREE.BufferGeometry();
  const attrs = {};
  for (const [name, size] of Object.entries(layout)) {
    const a = new THREE.BufferAttribute(new Float32Array(max * 4 * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, (attrs[name] = a));
  }
  const index = new Uint16Array(max * 6);
  for (let q = 0; q < max; q++) index.set([4 * q, 4 * q + 1, 4 * q + 2, 4 * q, 4 * q + 2, 4 * q + 3], 6 * q);
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    ...shader,
    uniforms: uniforms || shader.uniforms || {},
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    attrs,
    count: 0,
    max,
    // A quad from four vertices, each { position: [x, y], ...attributes }.
    quad(vs) {
      if (this.count >= this.max) return false;
      const q = this.count++;
      vs.forEach((v, k) => {
        for (const [name, a] of Object.entries(this.attrs)) {
          const val = v[name];
          const at = (4 * q + k) * a.itemSize;
          if (name === "position") {
            a.array[at] = val[0];
            a.array[at + 1] = val[1];
            a.array[at + 2] = 0;
          } else if (typeof val === "number") a.array[at] = val;
          else for (let c = 0; c < a.itemSize; c++) a.array[at + c] = val[c];
        }
      });
      return true;
    },
    end() {
      for (const a of Object.values(this.attrs)) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, this.count * 4 * a.itemSize);
        a.needsUpdate = true;
      }
      g.setDrawRange(0, this.count * 6);
      mesh.visible = this.count > 0;
    },
    dispose() {
      g.dispose();
      material.dispose();
    },
  };
}

// The ring atlas: each finger number on its ring, per hand and style (the
// app's ring styles: a filled ring for a finger on its key or striking, a
// light one for a finger getting ready, a dashed ghost for a thumb hidden
// under the hand), with its soft shadow. Premultiplied.
function drawAtlas(ink) {
  const cols = 8;
  const cells = 2 * STYLES.length * 5;
  const rows = Math.ceil(cells / cols);
  const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(cols * CELL, rows * CELL) : Object.assign(document.createElement("canvas"), { width: cols * CELL, height: rows * CELL });
  const c = canvas.getContext("2d");
  const at = {};
  let n = 0;
  for (const hand of ["left", "right"])
    STYLES.forEach((style) => {
      for (let finger = 1; finger <= 5; finger++) {
        const x = (n % cols) * CELL + CELL / 2,
          y = Math.floor(n / cols) * CELL + CELL / 2;
        at[`${hand}|${style}|${finger}`] = n++;
        const hk = ink[hand];
        const rgb = `rgb(${hk.rgb.join(",")})`;
        const R = ATLAS_R;
        c.save();
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = `700 ${Math.round(R * 1.18)}px ${FONT}`;
        if (style === "ghost") {
          c.beginPath();
          c.arc(x, y, R, 0, Math.PI * 2);
          c.fillStyle = "rgba(255, 250, 242, 0.22)";
          c.fill();
          c.lineWidth = 3.2;
          c.setLineDash([6.4, 4.6]);
          c.strokeStyle = rgb;
          c.stroke();
          c.setLineDash([]);
          c.shadowColor = "rgba(0,0,0,0.6)";
          c.shadowBlur = 4;
          c.fillStyle = "#fffaf2";
          c.fillText(String(finger), x, y + 0.8);
        } else {
          const filled = style === "filled";
          c.beginPath();
          c.arc(x, y, R, 0, Math.PI * 2);
          const face = c.createLinearGradient(x, y - R, x, y + R);
          face.addColorStop(0, filled ? `rgb(${hk.rgb.map(v => Math.round(v + (255 - v) * 0.2)).join(",")})` : "#fffdf7");
          face.addColorStop(1, filled ? rgb : "#f5eddf");
          c.fillStyle = face;
          c.shadowColor = "rgba(0,0,0,0.3)";
          c.shadowBlur = 5;
          c.shadowOffsetY = 2;
          c.fill();
          c.shadowColor = "transparent";
          c.lineWidth = 2.8;
          c.strokeStyle = filled ? "rgba(255, 250, 240, 0.96)" : `rgba(${hk.rgb.join(",")}, 0.96)`;
          c.stroke();
          // A small upper rim gives the marker a tactile finish. Its number
          // remains dark on a solid face, with the ready state ringed.
          c.beginPath();
          c.arc(x, y, R - 2.5, Math.PI * 1.1, Math.PI * 1.8);
          c.strokeStyle = "rgba(255,255,255,0.42)";
          c.lineWidth = 1.6;
          c.stroke();
          c.fillStyle = hk.ink;
          c.fillText(String(finger), x, y + 0.8);
        }
        c.restore();
      }
    });
  return { canvas, at, cols, rows };
}

export function createCues({ maxQuads = 384, maxDash = 1200, maxRings = 24 } = {}) {
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
  const under = new THREE.Scene(),
    over = new THREE.Scene();
  const shades = batch(maxQuads, { position: 3, color4: 4 }, vertexColorShader);
  const dashUnder = batch(maxDash, { position: 3, color4: 4, dash: 3 }, dashShader);
  const dashOver = batch(maxDash, { position: 3, color4: 4, dash: 3 }, dashShader);
  const atlasTex = new THREE.Texture();
  atlasTex.colorSpace = THREE.NoColorSpace;
  atlasTex.premultiplyAlpha = true;
  atlasTex.generateMipmaps = true;
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  atlasTex.magFilter = THREE.LinearFilter;
  atlasTex.flipY = false;
  const rings = batch(maxRings, { position: 3, uv: 2, alpha: 1 }, spriteShader, { atlas: { value: atlasTex } });
  under.add(shades.mesh, dashUnder.mesh);
  over.add(dashOver.mesh, rings.mesh);
  let atlas = null;
  let inkKey = "";
  const api = {
    camera,
    // (For checks: what the last redraw drew.)
    counts: { shades: 0, dashes: 0, rings: 0 },
    setInk(ink) {
      const key = JSON.stringify(ink);
      if (key === inkKey && atlas) return;
      inkKey = key;
      atlas = drawAtlas(ink);
      atlasTex.image = atlas.canvas;
      atlasTex.needsUpdate = true;
    },
    // (The app's font arrives after the first atlas: draw it again then.)
    refreshFont(ink) {
      inkKey = "";
      api.setInk(ink);
    },
    begin(width, height) {
      camera.left = 0;
      camera.right = width;
      camera.top = 0;
      camera.bottom = height;
      camera.updateProjectionMatrix();
      shades.count = dashUnder.count = dashOver.count = rings.count = 0;
    },
    // A rectangle shaded from its top colour to its bottom one ([r, g, b, a], 0…255 and 0…1).
    shade(x0, y0, x1, y1, top, bottom = top) {
      const t = [top[0] / 255, top[1] / 255, top[2] / 255, top[3]],
        b = [bottom[0] / 255, bottom[1] / 255, bottom[2] / 255, bottom[3]];
      shades.quad([
        { position: [x0, y0], color4: t },
        { position: [x0, y1], color4: b },
        { position: [x1, y1], color4: b },
        { position: [x1, y0], color4: t },
      ]);
    },
    // A dashed (or solid: gap 0) line through `points` ({ x, y }), `width` px wide.
    // (`alphaAt(x, y)`: how much of it shows there — it dissolves with the
    // picture over the bed's lower edge.)
    dashed(points, { closed = false, width = 1.3, color = [255, 255, 255, 1], dash = 3, gap = 2.5, over: top = false, alphaAt = null } = {}) {
      const target = top ? dashOver : dashUnder;
      const base = [color[0] / 255, color[1] / 255, color[2] / 255, color[3]];
      const colAt = (p) => (alphaAt ? [base[0], base[1], base[2], base[3] * alphaAt(p.x, p.y)] : base);
      const pts = closed ? [...points, points[0]] : points;
      let s = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i],
          b = pts[i + 1];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const l = Math.hypot(dx, dy);
        if (!(l > 1e-3)) continue;
        const nx = (-dy / l) * width * 0.5,
          ny = (dx / l) * width * 0.5;
        const ca = colAt(a),
          cb = colAt(b);
        if (
          !target.quad([
            { position: [a.x + nx, a.y + ny], color4: ca, dash: [s, dash, gap] },
            { position: [a.x - nx, a.y - ny], color4: ca, dash: [s, dash, gap] },
            { position: [b.x - nx, b.y - ny], color4: cb, dash: [s + l, dash, gap] },
            { position: [b.x + nx, b.y + ny], color4: cb, dash: [s + l, dash, gap] },
          ])
        )
          break;
        s += l;
      }
    },
    // A finger's number on its ring, centred at (x, y), radius r px.
    ring(x, y, r, { hand, style = "filled", finger, alpha = 1 }) {
      if (!atlas || !(alpha > 0.002)) return;
      const n = atlas.at[`${hand}|${style}|${finger}`];
      if (n == null) return;
      const W = atlas.cols * CELL,
        H = atlas.rows * CELL;
      const cx = (n % atlas.cols) * CELL,
        cy = Math.floor(n / atlas.cols) * CELL;
      // (The cell drawn so its ring is `r` px.)
      const half = (CELL / 2) * (r / ATLAS_R);
      const u0 = cx / W,
        u1 = (cx + CELL) / W,
        v0 = cy / H,
        v1 = (cy + CELL) / H;
      rings.quad([
        { position: [x - half, y - half], uv: [u0, v0], alpha },
        { position: [x - half, y + half], uv: [u0, v1], alpha },
        { position: [x + half, y + half], uv: [u1, v1], alpha },
        { position: [x + half, y - half], uv: [u1, v0], alpha },
      ]);
    },
    end() {
      for (const b of [shades, dashUnder, dashOver, rings]) b.end();
      api.counts = { shades: shades.count, dashes: dashUnder.count + dashOver.count, rings: rings.count };
    },
    render(renderer, phase) {
      renderer.render(phase === "under" ? under : over, camera);
    },
    // (Both scenes, for compiling ahead.)
    get scenes() {
      return [under, over];
    },
    get empty() {
      return { under: !shades.count && !dashUnder.count, over: !dashOver.count && !rings.count };
    },
    dispose() {
      for (const b of [shades, dashUnder, dashOver, rings]) b.dispose();
      atlasTex.dispose();
    },
  };
  return api;
}
