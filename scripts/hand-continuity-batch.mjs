// Run the continuity probe over the twenty measured hand-passages (ten
// lab scenarios, both hands) and summarise them, so a rig change can be
// judged against all of them at once.
//
//   node scripts/hand-continuity-batch.mjs [probe options, e.g. ft=0.5] [--json out.json]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const SCENARIOS = ["S01", "S03", "S04", "S06", "S07", "S08", "S09", "S10", "S11", "S12"];
const args = process.argv.slice(2);
const out = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const extra = args.filter((a, i) => a !== "--json" && args[i - 1] !== "--json").join(",");
const opts = ["to=4.5", "tau=0.04", extra].filter(Boolean).join(",");
const rows = [];
for (const s of SCENARIOS) {
  const raw = execFileSync(
    process.execPath,
    ["scripts/hand-continuity-probe.mjs", `.qa-runs/hand-motion/scenarios/${s}.json`, opts],
    { encoding: "utf8", maxBuffer: 64 << 20 },
  );
  const d = JSON.parse(raw);
  for (const hand of ["left", "right"]) {
    const h = d[hand];
    if (!h) continue;
    rows.push({
      scenario: s,
      hand,
      spikes: h.eased.spikes,
      visible: h.eased.visible,
      originMax: h.eased.dO.max,
      jointMax: h.eased.dJoint.max,
      originP95: h.eased.dO.p95,
      contactMm: h.maxErrMm,
    });
  }
}
const total = {
  spikes: rows.reduce((a, r) => a + r.spikes, 0),
  visible: rows.reduce((a, r) => a + r.visible, 0),
  worstContactMm: Math.max(...rows.map((r) => r.contactMm)),
  within05: rows.filter((r) => r.contactMm <= 0.5).length,
  worstOriginMm: Math.max(...rows.map((r) => r.originMax)),
  worstJointDeg: Math.max(...rows.map((r) => r.jointMax)),
};
for (const r of rows)
  console.log(
    `${r.scenario} ${r.hand.padEnd(5)} spikes ${String(r.spikes).padStart(3)} visible ${String(r.visible).padStart(2)}  origin max ${r.originMax.toFixed(1).padStart(6)} mm  joint max ${r.jointMax.toFixed(1).padStart(6)}°  contact ${r.contactMm.toFixed(2)} mm`,
  );
console.log("TOTAL", JSON.stringify(total));
if (out) fs.writeFileSync(out, JSON.stringify({ opts, rows, total }, null, 2));
