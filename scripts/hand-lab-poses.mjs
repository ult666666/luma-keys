// Dump hand poses for a scenario without a browser (same inputs as the hand
// lab page and the app: per-hand fingering, the scenario's tempo map at the
// practice speed, both hands from one handPoses() call), for
// scripts/hand-lab-lint.mjs and for timing studies.
//
//   node scripts/hand-lab-poses.mjs scenario.json out.json [--fps 120 | --dt beats] [--kw 36]
//        [--speed 1] [--from beat] [--to beat] [--frozen] [--waiting] [--since s] [--ahead beats] [--reduced]
//
// --fps (default 120) samples in real seconds, from 1 s before the first
// onset to 0.5 s after the last written end unless --from/--to (beats) are
// given; --dt samples in beats instead. The output is
// { scenario, speed, clockKey, kw, fps, frozen, waiting, frames: [{ t, beat, left, right }] }.
import fs from "node:fs";
import { scenarioInputs, sampleFrames } from "./hand-lab-scenario.mjs";

const [file, out] = process.argv.slice(2);
const args = Object.fromEntries(
  process.argv.slice(4).reduce((list, a, i, all) => {
    if (a.startsWith("--")) list.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
    return list;
  }, []),
);
if (!file || !out) {
  console.error("usage: node scripts/hand-lab-poses.mjs scenario.json out.json [--fps 120 | --dt beats] [--kw 36] [--speed 1] [--frozen] [--waiting]");
  process.exit(2);
}
const scenario = JSON.parse(fs.readFileSync(file, "utf8"));
const inputs = scenarioInputs(scenario, { speed: args.speed != null ? +args.speed : undefined });
const kw = +(args.kw || 36);
const fps = args.dt ? null : +(args.fps || 120);
const extra = {
  frozen: args.frozen === "1",
  waiting: args.waiting === "1",
  reducedMotion: args.reduced === "1",
  ahead: args.ahead != null ? +args.ahead : undefined,
  settle: args.since != null ? { since: +args.since } : null,
};
const frames = sampleFrames(inputs, {
  fps,
  dtBeats: args.dt ? +args.dt : null,
  fromBeat: args.from != null ? +args.from : null,
  toBeat: args.to != null ? +args.to : null,
  kw,
  extra,
});
fs.writeFileSync(
  out,
  JSON.stringify({ scenario, speed: inputs.speed, clockKey: inputs.clock.key, kw, fps, frozen: extra.frozen || extra.waiting, waiting: extra.waiting, frames }),
);
const span = frames.length ? `${frames[0].t.toFixed(3)}…${frames.at(-1).t.toFixed(3)} s` : "empty";
console.log(`${frames.length} frames (${span}, ${fps ? `${fps} fps` : `dt ${args.dt} beats`}, speed ${inputs.speed}) → ${out}`);
