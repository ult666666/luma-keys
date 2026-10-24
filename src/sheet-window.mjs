import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";

const options = {
  ignoreAttributes: false,
  preserveOrder: true,
  parseTagValue: false,
  trimValues: false,
};
const attributeOrder = [
  "divisions",
  "key",
  "time",
  "staves",
  "part-symbol",
  "instruments",
  "clef",
  "staff-details",
  "transpose",
  "directive",
  "measure-style",
];
const persistent = new Set(attributeOrder.slice(0, -2));
const unsupportedContext =
  /<(?:measure-style|glissando|slide|wavy-line|extend)\b/;
const spanning = new Set([
  "tie",
  "tied",
  "slur",
  "tuplet",
  "wedge",
  "octave-shift",
  "pedal",
  "dashes",
  "bracket",
  "ending",
]);
const tag = (node) => Object.keys(node).find((key) => key !== ":@");
const childText = (nodes, name) =>
  nodes
    .find((node) => node[name])
    ?.[name]?.find((node) => node["#text"] !== undefined)?.["#text"] || "";

/** Prepare a read-only index once per XML. Compact engraving receives a small
 * source window; score playback and the Review viewer keep the original XML.
 * Context spans expand the window. Unsupported/very long contexts fall back
 * to the original document rather than dropping written information. */
export function compileSheetWindows(xml) {
  if (typeof xml !== "string" || XMLValidator.validate(xml) !== true)
    return null;
  // These notations need additional state beyond the indexed piano spanners.
  // Keep their complete document rather than risk truncating a written mark.
  if (unsupportedContext.test(xml)) return null;
  let tree;
  try {
    tree = new XMLParser(options).parse(xml);
  } catch {
    return null;
  }
  const root = tree.find((node) => node["score-partwise"]);
  if (!root) return null;
  const parts = root["score-partwise"].filter((node) => node.part);
  const total = parts[0]?.part.filter((node) => node.measure).length || 0;
  if (
    !total ||
    parts.some(
      (part) => part.part.filter((node) => node.measure).length !== total,
    )
  )
    return null;
  const indexed = parts.map((part) => {
    const measures = part.part.filter((node) => node.measure);
    const attributes = [],
      activeBefore = [],
      state = new Map(),
      active = new Map();
    let spanChanges;
    const walk = (nodes, index, staff = "1", voice = "1", pitch = "") => {
      for (const node of nodes) {
        const name = tag(node),
          children = node[name];
        if (!Array.isArray(children)) continue;
        if (name === "attributes") {
          for (const attr of children) {
            const type = tag(attr);
            if (persistent.has(type)) {
              const number = attr[":@"]?.["@_number"] || "";
              // An unnumbered key/time/transpose replaces the state of every
              // staff; a later numbered value overrides only that staff.
              if (!number && ["key", "time", "transpose"].includes(type))
                for (const key of state.keys())
                  if (key.startsWith(`${type}:`)) state.delete(key);
              state.set(`${type}:${number}`, attr);
            }
          }
        }
        const nextStaff = childText(children, "staff") || staff;
        const nextVoice = childText(children, "voice") || voice;
        const pitchNodes = children.find((n) => n.pitch)?.pitch || [];
        const nextPitch =
          name === "note"
            ? `${childText(pitchNodes, "step")}:${Number(childText(pitchNodes, "alter") || 0)}:${childText(pitchNodes, "octave")}`
            : pitch;
        if (spanning.has(name)) {
          const type = node[":@"]?.["@_type"];
          const key = `${name}:${nextStaff}:${node[":@"]?.["@_number"] || "1"}${name === "tie" || name === "tied" ? `:${nextPitch}` : ""}`;
          // Polyphonic MusicXML can place a same-measure stop before its
          // start in document order. Count endpoints per measure, retaining
          // an ongoing span until all voices/occurrences have ended.
          const delta = ["stop", "discontinue"].includes(type)
            ? -1
            : [
                  "start",
                  "crescendo",
                  "diminuendo",
                  "up",
                  "down",
                  "sostenuto",
                ].includes(type)
              ? 1
              : 0;
          if (delta) spanChanges.set(key, (spanChanges.get(key) || 0) + delta);
        }
        walk(children, index, nextStaff, nextVoice, nextPitch);
      }
    };
    for (let i = 0; i < total; i++) {
      attributes.push([...state.values()]);
      activeBefore.push(
        active.size
          ? Math.min(...[...active.values()].map((span) => span.start))
          : null,
      );
      spanChanges = new Map();
      walk(measures[i].measure, i);
      for (const [key, delta] of spanChanges) {
        const previous = active.get(key),
          count = (previous?.count || 0) + delta;
        if (count > 0) active.set(key, { start: previous?.start ?? i, count });
        else active.delete(key);
      }
    }
    activeBefore.push(
      active.size
        ? Math.min(...[...active.values()].map((span) => span.start))
        : null,
    );
    return { part, measures, attributes, activeBefore };
  });
  const fallback = () => ({
    xml,
    offset: 0,
    total,
    windowed: false,
    measureCount: total,
  });
  return {
    total,
    window(first, last) {
      const from = Math.max(0, Math.min(total - 1, Math.trunc(first) - 1));
      const to = Math.max(from, Math.min(total - 1, Math.trunc(last) - 1));
      if (!Number.isFinite(from) || !Number.isFinite(to) || to - from > 31)
        return fallback();
      let start = Math.max(0, from - 1),
        end = Math.min(total, to + 2);
      // Include the beginnings/endings of active ties, slurs, pedals and 8va.
      // Stop expanding at a bounded context, using the untouched full source
      // when a long spanner or unusual notation requires more information.
      for (let guard = 0; guard < 64; guard++) {
        const previous = `${start}:${end}`;
        for (const part of indexed) {
          const before = part.activeBefore[start];
          if (before !== null) start = Math.min(start, before);
          if (end < total && part.activeBefore[end] !== null) end++;
        }
        if (end - start > 64) return fallback();
        if (`${start}:${end}` === previous) break;
        if (guard === 63) return fallback();
      }
      if (start === 0 && end === total) return fallback();
      const replacements = new Map(
        indexed.map(({ part, measures, attributes }) => {
          const chosen = measures.slice(start, end);
          if (start > 0 && attributes[start].length) {
            const attrs = attributes[start]
              .slice()
              .sort(
                (a, b) =>
                  attributeOrder.indexOf(tag(a)) -
                  attributeOrder.indexOf(tag(b)),
              );
            chosen[0] = {
              ...chosen[0],
              measure: [{ attributes: attrs }, ...chosen[0].measure],
            };
          }
          return [part, { ...part, part: chosen }];
        }),
      );
      const document = tree.map((node) =>
        node === root
          ? {
              ...root,
              "score-partwise": root["score-partwise"].map(
                (child) => replacements.get(child) || child,
              ),
            }
          : node,
      );
      return {
        xml: new XMLBuilder(options).build(document),
        offset: start,
        total,
        windowed: true,
        measureCount: end - start,
      };
    },
  };
}
