import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceSheetFollower,
  cacheSheetCursorImage,
  resetSheetFollower,
  sheetScrollTarget,
} from "../src/sheet-follow.mjs";

function fixture(entries = 10000, start = 192 * 16, count = 8 * 16) {
  const stats = { constructors: 0, scanned: 0, advances: 0 };
  const sheet = { entries, start, end: Math.min(entries, start + count) };
  class Iterator {
    constructor(value, timestamp = { RealValue: value.start / 16 }) {
      stats.constructors++;
      this.sheet = value;
      this.index = Math.max(0, Math.ceil(timestamp.RealValue * 16 - 1e-7));
      stats.scanned += this.index + 1;
      this.voiceEntries = [this.index];
      this.SkipInvisibleNotes = true;
    }
    get CurrentSourceTimestamp() {
      return { RealValue: this.index / 16 };
    }
    get CurrentVoiceEntries() {
      return this.voiceEntries;
    }
    get EndReached() {
      return this.index >= this.sheet.end;
    }
    moveToNextVisibleVoiceEntry() {
      stats.advances++;
      // Match OSMD's in-place array clearing, which makes its clone unsafe.
      this.voiceEntries.length = 0;
      this.index++;
      this.voiceEntries.push(this.index);
    }
  }
  const cursor = {
    Hidden: false,
    resetIterator() {
      this.iterator = new Iterator(sheet);
    },
    get Iterator() {
      return this.iterator;
    },
  };
  return { instance: { Sheet: sheet }, cursor, stats };
}

test("Appassionata-length late passages construct only two iterators, with no replay cost per onset", () => {
  const { instance, cursor, stats } = fixture();
  let state = resetSheetFollower(instance, cursor);
  const initialization = { ...stats };
  assert.deepEqual(cursor.Iterator.CurrentVoiceEntries, [3072]);
  assert.deepEqual(state.next.CurrentVoiceEntries, [3073]);
  for (let entry = 3072; entry < 3200; entry++) {
    const next = advanceSheetFollower(instance, cursor, state, entry / 16);
    state = next.state;
    assert.equal(cursor.Iterator.CurrentSourceTimestamp.RealValue, entry / 16);
    assert.deepEqual(cursor.Iterator.CurrentVoiceEntries, [entry]);
  }
  assert.equal(stats.constructors, 2);
  assert.equal(stats.scanned, initialization.scanned);
  assert.equal(stats.advances - initialization.advances, 2 * 127);
});

test("frames inside a held onset do no iterator work, and backward seeks reset only when necessary", () => {
  const { instance, cursor, stats } = fixture();
  let state = resetSheetFollower(instance, cursor);
  state = advanceSheetFollower(instance, cursor, state, 194.25).state;
  const before = { ...stats };
  for (const value of [194.26, 194.27, 194.26, 194.255]) {
    const step = advanceSheetFollower(instance, cursor, state, value);
    assert.equal(step.changed, false);
    state = step.state;
  }
  assert.deepEqual(stats, before);
  const rewind = advanceSheetFollower(instance, cursor, state, 192);
  assert.equal(rewind.changed, true);
  assert.equal(cursor.Iterator.CurrentSourceTimestamp.RealValue, 192);
  assert.equal(stats.constructors, 4);
  assert.deepEqual(cursor.Iterator.CurrentVoiceEntries, [3072]);
});

test("last passage entry remains selected when the lookahead reaches its end", () => {
  const { instance, cursor } = fixture(10000, 5000, 3);
  let state = resetSheetFollower(instance, cursor);
  state = advanceSheetFollower(instance, cursor, state, 5002 / 16).state;
  assert.equal(state.next.EndReached, true);
  assert.equal(cursor.Iterator.EndReached, false);
  assert.equal(cursor.Iterator.CurrentSourceTimestamp.RealValue, 5002 / 16);
  assert.equal(
    advanceSheetFollower(instance, cursor, state, 5002.9 / 16).changed,
    false,
  );
});

test("oversized grand staff has one fixed scroll target instead of oscillating edges", () => {
  // Native baseline: 112px viewport; 118px two-staff marker near this system.
  const geometry = {
    clientHeight: 112,
    scrollHeight: 900,
    markerTop: 95.5,
    markerHeight: 118,
  };
  let scrollTop = 113.5;
  const trace = [];
  for (let i = 0; i < 40; i++) {
    scrollTop = sheetScrollTarget({ ...geometry, scrollTop });
    trace.push(scrollTop);
  }
  assert.deepEqual([...new Set(trace)], [83.5]);
  assert.equal(
    sheetScrollTarget({ ...geometry, markerTop: 340, scrollTop }),
    328,
  );
  assert.equal(
    sheetScrollTarget({ ...geometry, markerTop: 0, scrollTop: 328 }),
    0,
  );
});

test("fully visible systems stay still and a line below the view turns the page to the top", () => {
  const geometry = {
    clientHeight: 300,
    scrollHeight: 900,
    markerTop: 50,
    markerHeight: 120,
    scrollTop: 0,
  };
  assert.equal(sheetScrollTarget(geometry), 0);
  const target = sheetScrollTarget({ ...geometry, markerTop: 240 });
  assert.equal(target, 228);
  assert.equal(
    sheetScrollTarget({ ...geometry, markerTop: 240, scrollTop: target }),
    target,
  );
  assert.equal(sheetScrollTarget({ ...geometry, markerTop: 850 }), 600);
  assert.equal(
    sheetScrollTarget({ ...geometry, clientHeight: 0, scrollTop: 50 }),
    50,
  );
});

test("cursor raster cache keeps position work intact while regenerating only for changed appearance", () => {
  let rasterizations = 0;
  const cursor = {
    cursorElement: { src: "" },
    CursorOptions: { type: 0, color: "#6cd8b4", alpha: 0.35 },
    updateStyle(width, options = this.CursorOptions) {
      rasterizations++;
      this.cursorElement.src = `${width}:${options.color}:${options.alpha}`;
    },
  };
  cacheSheetCursorImage(cursor);
  for (let i = 0; i < 120; i++)
    cursor.updateStyle(25.5, { ...cursor.CursorOptions });
  assert.equal(rasterizations, 1);
  cursor.updateStyle(33, { ...cursor.CursorOptions });
  assert.equal(rasterizations, 2);
  cursor.CursorOptions = { ...cursor.CursorOptions, alpha: 0.5 };
  cursor.updateStyle(33);
  assert.equal(rasterizations, 3);
  assert.doesNotThrow(() => cacheSheetCursorImage({}));
});
