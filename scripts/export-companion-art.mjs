import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { build } from "esbuild";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "Assets", "Companions");
const portraits = [
  {
    id: "beethoven",
    name: "Beethoven",
    file: "Beethoven.svg",
    viewBox: "0 0 180 180",
    source: "src/BeethovenAvatar.jsx",
  },
  {
    id: "langlang",
    name: "Lang Lang",
    file: "Lang Lang.svg",
    viewBox: "0 0 180 180",
    source: "src/MaestroAvatar.jsx",
  },
  {
    id: "mozart",
    name: "Mozart",
    file: "Mozart.svg",
    viewBox: "0 0 180 180",
    source: "src/MaestroAvatar.jsx",
  },
  {
    id: "liszt",
    name: "Liszt",
    file: "Liszt.svg",
    viewBox: "0 0 180 180",
    source: "src/MaestroAvatar.jsx",
  },
  {
    id: "cat",
    name: "Luma",
    file: "Luma.svg",
    viewBox: "0 0 180 160",
    source: "src/screens/StudioCompanion.jsx",
  },
  {
    id: "bunny",
    name: "Mochi",
    file: "Mochi.svg",
    viewBox: "0 0 180 160",
    source: "src/screens/StudioCompanion.jsx",
  },
];

// Compile only the artwork renderer, entirely in memory. App styles are not
// imported into the exported documents; the static expression is baked below.
const bundle = await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      import { createElement } from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import CompanionPortrait from './src/CompanionPortrait.jsx';
      export function renderPortrait(character) {
        return renderToStaticMarkup(createElement(CompanionPortrait, {
          character, mood: 'idle', width: 180, height: 180,
          xmlns: 'http://www.w3.org/2000/svg'
        }));
      }
    `,
    resolveDir: root,
    sourcefile: "companion-art-renderer.jsx",
    loader: "jsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  loader: { ".css": "empty" },
  packages: "external",
  logLevel: "silent",
});

const renderer = { exports: {} };
const run = runInThisContext(
  `(function(require, module, exports) {\n${bundle.outputFiles[0].text}\n})`,
  { filename: path.join(root, "scripts", "companion-art-renderer.cjs") },
);
run(createRequire(import.meta.url), renderer, renderer.exports);

const escapeXML = (text) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );

function standalone(portrait) {
  let svg = renderer.exports.renderPortrait(portrait.id);
  // The app's portraits are decorative; each standalone file has its own name.
  svg = svg.replace(/\saria-hidden="true"/, "");
  svg = svg.replace(/^<svg\b/, '<svg role="img"');
  // Neutral eyes are the default static expression. Opacity attributes keep
  // this correct even in SVG editors that omit embedded or external CSS.
  svg = svg.replace(
    /(<g\b[^>]*class="[^"]*\b(?:beethoven|maestro)-smiling-eyes\b[^"]*"[^>]*)(>)/g,
    '$1 opacity="0"$2',
  );
  svg = svg.replace(
    /(<svg\b[^>]*>)/,
    `$1<title>${escapeXML(portrait.name)}</title>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`;
}

const commandArguments = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};
const pathToken =
  /[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;

function validatePath(data, name) {
  if (typeof data !== "string" || !data.trim())
    throw new Error(`${name}: empty path`);
  if (data.replace(pathToken, "").replace(/[\s,]/g, ""))
    throw new Error(`${name}: invalid path characters`);
  const tokens = data.match(pathToken) || [];
  if (!/^[Mm]$/.test(tokens[0]))
    throw new Error(`${name}: path must start with moveto`);
  for (let index = 0; index < tokens.length;) {
    const command = tokens[index++].toUpperCase();
    const count = commandArguments[command];
    if (count === undefined)
      throw new Error(`${name}: unknown path command ${command}`);
    let values = 0;
    while (index < tokens.length && !/^[a-z]$/i.test(tokens[index])) {
      if (!Number.isFinite(Number(tokens[index++])))
        throw new Error(`${name}: non-finite path coordinate`);
      values++;
    }
    if (
      (count === 0 && values !== 0) ||
      (count > 0 && (values === 0 || values % count !== 0))
    ) {
      throw new Error(`${name}: incomplete ${command} geometry`);
    }
  }
}

const parser = new XMLParser({ ignoreAttributes: false });
const shapes = new Set([
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
]);

function validate(svg, portrait) {
  const syntax = XMLValidator.validate(svg);
  if (syntax !== true)
    throw new Error(`${portrait.file}: invalid XML: ${syntax.err.msg}`);
  const document = parser.parse(svg);
  const picture = document.svg;
  if (!picture || picture["@_xmlns"] !== "http://www.w3.org/2000/svg")
    throw new Error(`${portrait.file}: missing SVG namespace`);
  if (picture["@_viewBox"] !== portrait.viewBox)
    throw new Error(`${portrait.file}: source viewBox changed`);
  if (
    String(picture["@_width"]) !== "180" ||
    String(picture["@_height"]) !== "180"
  )
    throw new Error(`${portrait.file}: wrong export dimensions`);
  if (picture["@_data-character"] !== portrait.id)
    throw new Error(`${portrait.file}: wrong character`);
  if (picture.title !== portrait.name)
    throw new Error(`${portrait.file}: missing title`);
  let geometry = 0;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    for (const [tag, value] of Object.entries(node)) {
      const items = Array.isArray(value) ? value : [value];
      if (
        [
          "script",
          "foreignObject",
          "image",
          "animate",
          "animateTransform",
        ].includes(tag)
      ) {
        throw new Error(
          `${portrait.file}: expected static inline vector artwork`,
        );
      }
      if (shapes.has(tag)) {
        for (const shape of items) {
          geometry++;
          if (tag === "path") validatePath(shape["@_d"], portrait.file);
          for (const attribute of [
            "x",
            "y",
            "cx",
            "cy",
            "r",
            "rx",
            "ry",
            "width",
            "height",
            "x1",
            "x2",
            "y1",
            "y2",
          ]) {
            const number = shape[`@_${attribute}`];
            if (number !== undefined && !Number.isFinite(Number(number)))
              throw new Error(`${portrait.file}: invalid ${attribute}`);
          }
        }
      }
      if (!tag.startsWith("@_")) visit(value);
    }
  }
  visit(picture);
  if (geometry < 10 || Buffer.byteLength(svg) < 1000)
    throw new Error(`${portrait.file}: missing portrait geometry`);
  return { geometry, bytes: Buffer.byteLength(svg) };
}

// Validate all six before replacing any existing exported artwork.
const assets = portraits.map((portrait) => {
  const svg = standalone(portrait);
  const evidence = validate(svg, portrait);
  return { portrait, svg, evidence };
});
await mkdir(output, { recursive: true });
for (const { portrait, svg } of assets)
  await writeFile(path.join(output, portrait.file), svg);

const readme = `# Companion artwork

Six original stylized illustrations used by Luma Keys. Each file is a standalone, transparent SVG with a static neutral expression and no external assets, fonts or stylesheets. They can be resized without losing detail.

| Portrait | SVG | Source artwork | Original viewBox |
| --- | --- | --- | --- |
${portraits.map((p) => `| ${p.name} | [${p.file}](<${p.file}>) | [${p.source}](../../${p.source}) | ${p.viewBox} |`).join("\n")}

All files declare a 180 × 180 pixel size. The original viewBox is preserved: the cat and bunny drawings use 180 × 160 and are centered by SVG's default aspect-ratio behavior.

The app selects these drawings through [CompanionPortrait.jsx](../../src/CompanionPortrait.jsx). Listening, conducting and celebration animations remain in the app; these exported files are static.

Regenerate from the Luma Keys project folder:

\`\`\`sh
node scripts/export-companion-art.mjs
\`\`\`

The script renders the existing React artwork in memory, validates the SVG markup and path geometry, and replaces only these six SVG files and this README. It uses the project's installed esbuild, React and fast-xml-parser packages; it does not build or launch the app.
`;
await writeFile(path.join(output, "README.md"), readme);

// Check the actual saved files, including original viewBoxes and drawables.
for (const { portrait } of assets) {
  const evidence = validate(
    await readFile(path.join(output, portrait.file), "utf8"),
    portrait,
  );
  console.log(
    `${portrait.file}: ${evidence.geometry} shapes, ${evidence.bytes} bytes, viewBox ${portrait.viewBox}`,
  );
}
console.log(`Saved 6 SVG portraits and README to ${output}`);
