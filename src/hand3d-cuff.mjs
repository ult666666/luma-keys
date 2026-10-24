// A fitted knitted cuff, in the wrist bone's frame. It finishes the teaching
// hand below the palm without changing any joint, key contact or finger mesh.
import * as THREE from "three";
import { smoothNormals } from "./hand3d-rig.mjs";

export function cuffGeometry(tpl, rig) {
  const wrist = tpl.bind.get("wrist");
  const toH = p => p.clone().sub(rig.origin).applyQuaternion(rig.toHand);
  const w = toH(wrist.p);
  const pts = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < tpl.position.length / 3; i++) {
    const p = toH(v.fromArray(tpl.position, i * 3));
    if (Math.abs(p.z - w.z) < 0.004 * rig.scale) pts.push(p);
  }
  if (pts.length < 8) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 0.0013 * rig.scale;
  const ry = (Math.max(...ys) - Math.min(...ys)) / 2 + 0.0014 * rig.scale;
  // Its lip surrounds the wider skin immediately above the wrist, rather
  // than cutting through it. The distal sleeve retains this fitted ellipse.
  const skin = [];
  for (let i = 0; i < tpl.position.length / 3; i++) skin.push(toH(v.fromArray(tpl.position, i * 3)));
  const back = rig.toHand.clone().invert();
  const invW = wrist.q.clone().invert();
  const rows = 12, cols = 65;
  const position = [], uv = [], index = [];
  for (let r = 0; r < rows; r++) {
    const s = r / (rows - 1);
    // A rounded hem, a soft roll at its lip, then the sleeve toward the player.
    const hem = 0.00065 * Math.exp(-Math.pow((s - 0.10) / 0.09, 2));
    const width = 1 + 0.07 * s;
    const z = w.z + (-0.008 + 0.043 * s) * rig.scale;
    const slice = skin.filter(p => Math.abs(p.z - Math.min(z, w.z + 0.002 * rig.scale)) < 0.003 * rig.scale);
    const x0 = slice.length ? Math.min(...slice.map(p => p.x)) : cx - rx;
    const x1 = slice.length ? Math.max(...slice.map(p => p.x)) : cx + rx;
    const y0 = slice.length ? Math.min(...slice.map(p => p.y)) : cy - ry;
    const y1 = slice.length ? Math.max(...slice.map(p => p.y)) : cy + ry;
    const centreX = (x0 + x1) / 2, centreY = (y0 + y1) / 2;
    const radiusX = Math.max(rx, (x1 - x0) / 2 + 0.0018 * rig.scale);
    const radiusY = Math.max(ry, (y1 - y0) / 2 + 0.0018 * rig.scale);
    for (let c = 0; c < cols; c++) {
      const t = c / (cols - 1), a = t * Math.PI * 2;
      const round = t => Math.sign(t) * Math.pow(Math.abs(t), 0.65);
      v.set(centreX + (radiusX * width + hem) * round(Math.sin(a)), centreY + (radiusY * width + hem) * round(Math.cos(a)), z);
      v.applyQuaternion(back).add(rig.origin).sub(wrist.p).applyQuaternion(invW);
      position.push(v.x, v.y, v.z);
      uv.push(t, s);
    }
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + cols;
    index.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const p = new Float32Array(position), ix = new Uint16Array(index);
  return { position: p, normal: smoothNormals(p, ix), uv: new Float32Array(uv), index: ix, joint: "wrist" };
}
