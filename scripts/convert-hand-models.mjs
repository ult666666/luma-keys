// Convert the vendored Microsoft MRTK RiggedHandVisualizer into Luma's
// 25-joint, metre-based hand models. No output is written without --out.
//
// node scripts/convert-hand-models.mjs --out path/to/output
//
// Source positions, normals, UVs and skin weights are retained. The left hand
// is an anatomical reflection of the source right hand, including winding
// and joint frames. See Assets/hands/mrtk/README.md for provenance.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { CHAINS, PARENT, handTemplate } from "../src/hand3d-rig.mjs";

const { values } = parseArgs({
  options: { out: { type: "string" }, help: { type: "boolean", short: "h" } },
  allowPositionals: false,
});
if (values.help) {
  console.log(
    "Usage: node scripts/convert-hand-models.mjs --out <directory>\nWrites left.glb, right.glb, LICENSE.md and PROVENANCE.json. No default output directory.",
  );
  process.exit(0);
}
if (!values.out?.trim()) {
  console.error(
    "An explicit --out <directory> is required. No files were written.",
  );
  process.exit(1);
}
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceDirectory = path.join(projectRoot, "Assets/hands/mrtk");
const sourcePath = path.join(sourceDirectory, "R_Hand_MRTK_Rig.fbx");
const licensePath = path.join(sourceDirectory, "LICENSE.md");
const output = path.resolve(values.out);
const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const expectedSourceHash =
  "32fb64b8a9963b0751958d0023178cfc29fb2c07edfabc64e83ad7f2b7e9f04d";
const sourceHash = sha256(fs.readFileSync(sourcePath));
if (sourceHash !== expectedSourceHash)
  throw new Error(
    "The vendored MRTK FBX differs from the pinned source. Check provenance before converting.",
  );
const names = Object.keys(PARENT),
  V = (...n) => new THREE.Vector3(...n);
if (names.length !== 25)
  throw new Error("Expected the 25-joint WebXR hand contract.");
const AX = V(1, 0, 0),
  AY = V(0, 1, 0),
  AZ = V(0, 0, 1);
const preset = {
  wrist: "R_Wrist",
  fingers: {
    index: "R_Pointer",
    middle: "R_Middle",
    ring: "R_Ring",
    pinky: "R_Pinky",
  },
};

function glb(tpl) {
  const json = {
    asset: {
      version: "2.0",
      generator: "Luma Keys MRTK hand converter 2",
      copyright: "Copyright (c) Microsoft Corporation. MIT License.",
    },
    scene: 0,
    scenes: [{ nodes: Array.from({ length: 26 }, (_, i) => i) }],
    nodes: [{ name: "Hand", mesh: 0, skin: 0 }],
    meshes: [],
    skins: [],
    buffers: [],
    bufferViews: [],
    accessors: [],
  };
  const chunks = [];
  let size = 0;
  function add(array, type, target, bounds = false) {
    const start = size;
    const raw = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    chunks.push(raw);
    size += raw.length;
    const pad = (4 - (size % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      size += pad;
    }
    const view = { buffer: 0, byteOffset: start, byteLength: raw.length };
    if (target) view.target = target;
    const acc = {
      bufferView: json.bufferViews.length,
      componentType:
        array instanceof Float32Array
          ? 5126
          : array instanceof Uint16Array
            ? 5123
            : 5125,
      count:
        array.length / { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type],
      type,
    };
    if (bounds) {
      acc.min = [Infinity, Infinity, Infinity];
      acc.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < array.length; i++) {
        acc.min[i % 3] = Math.min(acc.min[i % 3], array[i]);
        acc.max[i % 3] = Math.max(acc.max[i % 3], array[i]);
      }
    }
    json.bufferViews.push(view);
    json.accessors.push(acc);
    return json.accessors.length - 1;
  }
  const attributes = {
    POSITION: add(tpl.position, "VEC3", 34962, true),
    NORMAL: add(tpl.normal, "VEC3", 34962),
    TEXCOORD_0: add(tpl.uv, "VEC2", 34962),
    JOINTS_0: add(tpl.joints, "VEC4", 34962),
    WEIGHTS_0: add(tpl.weights, "VEC4", 34962),
  };
  json.meshes = [
    {
      name: tpl.hand,
      primitives: [
        { attributes, indices: add(tpl.index, "SCALAR", 34963), mode: 4 },
      ],
    },
  ];
  const inverse = new Float32Array(25 * 16);
  names.forEach((name, i) => {
    const { p, q } = tpl.bind.get(name);
    json.nodes.push({ name, translation: p.toArray(), rotation: q.toArray() });
    new THREE.Matrix4()
      .compose(p, q, V(1, 1, 1))
      .invert()
      .toArray(inverse, i * 16);
  });
  json.skins = [
    {
      joints: names.map((_, i) => i + 1),
      inverseBindMatrices: add(inverse, "MAT4"),
    },
  ];
  json.buffers = [{ byteLength: size }];
  let jsonBytes = Buffer.from(JSON.stringify(json));
  const pad = (4 - (jsonBytes.length % 4)) % 4;
  if (pad) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(pad, 32)]);
  const binary = Buffer.concat(chunks);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(28 + jsonBytes.length + binary.length, 8);
  head.writeUInt32LE(jsonBytes.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binary.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jsonBytes, binHead, binary]);
}
// FBXLoader expands every triangle corner. Reuse a vertex only when every
// attribute is bit-identical, so UV seams, normal splits and skinning survive.
function indexExactAttributes(template) {
  const attributes = [
    ["position", 3],
    ["normal", 3],
    ["uv", 2],
    ["joints", 4],
    ["weights", 4],
  ];
  const originalCount = template.position.length / 3;
  const stride = attributes.reduce(
    (sum, [name, size]) => sum + size * template[name].BYTES_PER_ELEMENT,
    0,
  );
  const unique = new Map(),
    originals = [],
    remap = new Uint32Array(originalCount);
  for (let vertex = 0; vertex < originalCount; vertex++) {
    const row = Buffer.allocUnsafe(stride);
    let offset = 0;
    for (const [name, size] of attributes) {
      const array = template[name],
        bytes = size * array.BYTES_PER_ELEMENT;
      Buffer.from(array.buffer, array.byteOffset + vertex * bytes, bytes).copy(
        row,
        offset,
      );
      offset += bytes;
    }
    const key = row.toString("hex");
    if (!unique.has(key)) {
      unique.set(key, originals.length);
      originals.push(vertex);
    }
    remap[vertex] = unique.get(key);
  }
  const result = {
    ...template,
    index: Uint32Array.from(template.index, (i) => remap[i]),
  };
  for (const [name, size] of attributes) {
    const source = template[name],
      compact = new source.constructor(originals.length * size);
    originals.forEach((vertex, i) =>
      compact.set(
        source.subarray(vertex * size, (vertex + 1) * size),
        i * size,
      ),
    );
    result[name] = compact;
  }
  return result;
}

function mirror(tpl) {
  const position = tpl.position.slice(),
    normal = tpl.normal.slice(),
    index = tpl.index.slice();
  for (let i = 0; i < position.length; i += 3) {
    position[i] *= -1;
    normal[i] *= -1;
  }
  for (let i = 0; i < index.length; i += 3) {
    const v = index[i + 1];
    index[i + 1] = index[i + 2];
    index[i + 2] = v;
  }
  const bind = new Map(
    [...tpl.bind].map(([name, { p, q }]) => {
      const pp = p.clone();
      pp.x *= -1;
      const y = AY.clone().applyQuaternion(q),
        z = AZ.clone().applyQuaternion(q);
      y.x *= -1;
      z.x *= -1;
      const x = y.clone().cross(z).normalize();
      const qq = new THREE.Quaternion()
        .setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
        .normalize();
      return [name, { p: pp, q: qq }];
    }),
  );
  return { ...tpl, hand: "left", position, normal, index, bind };
}
const bytes = fs.readFileSync(sourcePath);
const scene = new FBXLoader().parse(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  "",
);
scene.updateMatrixWorld(true);
let mesh;
scene.traverse((o) => {
  if (o.isSkinnedMesh) mesh = o;
});
const source = mesh.geometry.attributes,
  bones = mesh.skeleton.bones,
  byName = new Map(bones.map((b, i) => [b.name, { b, i }]));
const pos = (name) => byName.get(name).b.getWorldPosition(V());
const mappings = new Map();
const bindSource = new Map();
const add = (name, sourceName) => {
  const { b } = byName.get(sourceName);
  mappings.set(sourceName, name);
  bindSource.set(name, {
    p: b.getWorldPosition(V()),
    q: b.getWorldQuaternion(new THREE.Quaternion()),
  });
};
add("wrist", preset.wrist);

CHAINS.thumb.forEach((name, i) =>
  add(name, ["R_Thumb_1", "R_Thumb_2", "R_Thumb_3", "R_Thumb_end"][i]),
);
for (const [f, prefix] of Object.entries(preset.fingers)) {
  CHAINS[f]
    .slice(1)
    .forEach((name, i) => add(name, `${prefix}_${i === 3 ? "end" : i + 1}`));
  if (f === "pinky") add(CHAINS[f][0], "R_WristPadding");
  else {
    const prox = bindSource.get(CHAINS[f][1]);
    bindSource.set(CHAINS[f][0], {
      p: pos(preset.wrist).lerp(prox.p, 0.36),
      q: prox.q.clone(),
    });
  }
}
const origin = bindSource.get("wrist").p;
const O = bindSource
  .get(CHAINS.middle[1])
  .p.clone()
  .lerp(bindSource.get(CHAINS.ring[1]).p, 0.5);
const F = O.sub(origin).normalize(),
  across = bindSource
    .get(CHAINS.pinky[1])
    .p.clone()
    .sub(bindSource.get(CHAINS.index[1]).p);
const U = across.cross(F).normalize(),
  S = F.clone().cross(U).normalize();
const canonical = new THREE.Matrix4()
  .makeBasis(S, U, F.clone().negate())
  .invert();
const cq = new THREE.Quaternion().setFromRotationMatrix(canonical);
const bind = new Map(
  [...bindSource].map(([name, b]) => {
    const p = b.p
      .clone()
      .sub(origin)
      .applyMatrix4(canonical)
      .multiplyScalar(0.01);
    // The FBX points along local -X. Preserve its twist while expressing
    // local -Z toward each tip and +Y on the back of the digit.
    const y = AY.clone().applyQuaternion(b.q).applyQuaternion(cq).normalize();
    const z = AX.clone().applyQuaternion(b.q).applyQuaternion(cq).normalize();
    const x = y.clone().cross(z).normalize();
    const q = new THREE.Quaternion()
      .setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
      .normalize();
    return [name, { p, q }];
  }),
);
const count = source.position.count,
  position = new Float32Array(count * 3),
  normal = new Float32Array(count * 3),
  uv = Float32Array.from(source.uv.array),
  joints = new Uint16Array(count * 4),
  weights = new Float32Array(count * 4),
  index = mesh.geometry.index
    ? Uint32Array.from(mesh.geometry.index.array)
    : Uint32Array.from({ length: count }, (_, i) => i);
const normalMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
let normalized = 0;
for (let v = 0; v < count; v++) {
  V()
    .fromBufferAttribute(source.position, v)
    .applyMatrix4(mesh.matrixWorld)
    .sub(origin)
    .applyMatrix4(canonical)
    .multiplyScalar(0.01)
    .toArray(position, v * 3);
  V()
    .fromBufferAttribute(source.normal, v)
    .applyMatrix3(normalMat)
    .applyQuaternion(cq)
    .normalize()
    .toArray(normal, v * 3);
  const w = new Map();
  for (let k = 0; k < 4; k++) {
    const sourceName = bones[source.skinIndex.array[v * 4 + k]].name,
      name = mappings.get(sourceName);
    if (!name) throw new Error("No bone mapping " + sourceName);
    const j = names.indexOf(name),
      value = source.skinWeight.array[v * 4 + k];
    w.set(j, (w.get(j) || 0) + value);
  }
  const entries = [...w].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]),
    sum = entries.reduce((n, [, w]) => n + w, 0);
  if (Math.abs(sum - 1) > 1e-5) normalized++;
  if (!sum) throw new Error("Unweighted vertex " + v);
  entries.forEach(([j, w], k) => {
    joints[v * 4 + k] = j;
    weights[v * 4 + k] = w / sum;
  });
}
const right = indexExactAttributes({
    hand: "right",
    names,
    bind,
    position,
    normal,
    uv,
    joints,
    weights,
    index,
  }),
  left = mirror(right);
const outputs = [];
const encoded = [];
for (const template of [right, left]) {
  const buffer = glb(template);
  const parsed = handTemplate(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
    template.hand,
  );
  for (const [name, array] of Object.entries(parsed)) {
    if (ArrayBuffer.isView(array) && !array.every(Number.isFinite))
      throw new Error(`Non-finite ${name} in ${template.hand} model`);
  }
  let maxWeightError = 0;
  for (let i = 0; i < template.position.length / 3; i++)
    maxWeightError = Math.max(
      maxWeightError,
      Math.abs(
        template.weights.slice(i * 4, i * 4 + 4).reduce((a, b) => a + b, 0) - 1,
      ),
    );
  if (maxWeightError > 1e-6) throw new Error("Invalid normalized skin weights");
  const file = template.hand + ".glb";
  outputs.push({
    file,
    sha256: sha256(buffer),
    bytes: buffer.length,
    sourceVertices: count,
    vertices: template.position.length / 3,
    triangles: index.length / 3,
    joints: names.length,
    maxWeightError,
  });
  encoded.push({ file, buffer });
}
const sourceUrl =
  "https://github.com/microsoft/MixedRealityToolkit-Unity/blob/5c6ab1f6fc064c9a4d9c786ae966c98c03d8b500/Assets/MRTK/SDK/Features/UX/Prefabs/RiggedHandVisualizer/R_Hand_MRTK_Rig.fbx";
const provenance = {
  converter: "scripts/convert-hand-models.mjs",
  version: 2,
  source: {
    file: "Assets/hands/mrtk/R_Hand_MRTK_Rig.fbx",
    url: sourceUrl,
    commit: "5c6ab1f6fc064c9a4d9c786ae966c98c03d8b500",
    sha256: sourceHash,
    bytes: bytes.length,
  },
  license: {
    spdx: "MIT",
    copyright: "Microsoft Corporation",
    file: "LICENSE.md",
    sha256: sha256(fs.readFileSync(licensePath)),
  },
  dependencies: { threeRevision: THREE.REVISION },
  conversion: [
    "Preserve source mesh positions, normals and UVs; convert centimetres to metres and rotate into canonical hand space.",
    "FBXLoader keeps the four strongest skin influences; merge duplicate mapped joints and normalize retained weights.",
    "Preserve original thumb and finger joints. Add three zero-weight metacarpal anchors at 36% of wrist-to-MCP for index, middle and ring. Use the original weighted wrist-padding joint as pinky metacarpal.",
    "Preserve source bone twist with local -Z toward tips and +Y dorsal. Store 25 world-space joint nodes and inverse bind matrices.",
    "Reflect right-hand X coordinates to produce the left hand, reversing triangle winding and reflecting joint rotations.",
    "Index triangle vertices only when position, normal, UV, joint indices and weights are bit-identical; preserve expanded triangle attributes and winding.",
    "Mesh preparation, posing and skin texture baking are separate build steps.",
  ],
  normalizedVertices: normalized,
  outputs,
};
// Validate both complete outputs before creating or writing the destination.
fs.mkdirSync(output, { recursive: true });
for (const { file, buffer } of encoded)
  fs.writeFileSync(path.join(output, file), buffer);
fs.copyFileSync(licensePath, path.join(output, "LICENSE.md"));
fs.writeFileSync(
  path.join(output, "PROVENANCE.json"),
  JSON.stringify(provenance, null, 2) + "\n",
);
console.log(
  JSON.stringify({ output, sourceSha256: sourceHash, outputs }, null, 2),
);
