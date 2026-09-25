import test from "node:test";
import assert from "node:assert/strict";
import { InputNotes } from "../src/input-notes.mjs";
import { bindMIDIInputs } from "../src/midi-input.mjs";

test("Overlapping input owners hold a pitch until its last owner releases", () => {
  const notes = new InputNotes();
  const original = notes.press(60, "midi:1:0:60");
  original.voice = { id: 1 };
  assert.equal(notes.press(60, "computer:KeyA"), null);
  assert.equal(notes.press(60, "computer:KeyA"), null);
  assert.equal(notes.release(60, "unrelated-key"), null);
  assert.equal(notes.release(60, "midi:1:0:60"), null);
  assert.equal(notes.current(original), true);
  assert.equal(notes.release(60, "computer:KeyA"), original);
  assert.equal(notes.current(original), false);
});

test("Release, focus loss and disconnect invalidate only the pending notes they own", () => {
  const notes = new InputNotes();
  const pending = notes.press(60, "midi:1:0:60");
  notes.press(60, "computer:KeyA");
  const other = notes.press(64, "midi:2:0:64");
  assert.deepEqual(
    notes.releaseSources((s) => s.startsWith("midi:1:")),
    [],
  );
  assert.equal(notes.current(pending), true);
  assert.equal(notes.current(other), true);
  notes.release(60, "computer:KeyA");
  const replacement = notes.press(60, "computer:KeyA");
  assert.equal(notes.current(pending), false);
  assert.equal(
    notes.discard(pending),
    false,
    "An old rejected sound cannot remove a new note",
  );
  assert.equal(notes.current(replacement), true);
  notes.clear();
  assert.equal(notes.current(replacement), false);
  assert.equal(notes.current(other), false);
});

test("MIDI rebinding preserves connected notes, disconnect cleans only its port, and channels own independent notes", () => {
  const events = [];
  const first = {
    id: "a",
    name: "Piano",
    state: "connected",
    onmidimessage: null,
  };
  const second = {
    id: "b",
    name: "Other piano",
    state: "connected",
    onmidimessage: null,
  };
  const access = {
    inputs: new Map([
      ["a", first],
      ["b", second],
    ]),
    onstatechange: null,
  };
  const binding = bindMIDIInputs(
    access,
    Object.fromEntries(
      ["noteOn", "noteOff", "pedal", "disconnect", "status"].map((key) => [
        key,
        (...args) => events.push([key, ...args]),
      ]),
    ),
  );
  const receive = first.onmidimessage;
  receive({ data: [144, 60, 100] });
  receive({ data: [145, 60, 100] });
  const ons = events.filter((e) => e[0] === "noteOn");
  assert.equal(ons.length, 2);
  assert.notEqual(ons[0][3], ons[1][3]);
  access.onstatechange({ port: first });
  binding.refresh();
  assert.equal(first.onmidimessage, receive);
  assert.equal(events.filter((e) => e[0] === "disconnect").length, 0);
  receive({ data: [144, 60, 0] });
  assert.deepEqual(events.at(-1), ["noteOff", 60, ons[0][3]]);
  receive({ data: [177, 64, 127] });
  assert.equal(events.at(-1)[0], "pedal");
  assert.equal(events.at(-1)[1], true);
  first.state = "disconnected";
  access.inputs.delete("a");
  access.onstatechange({ port: first });
  assert.equal(first.onmidimessage, null);
  assert.equal(typeof second.onmidimessage, "function");
  assert.equal(events.filter((e) => e[0] === "disconnect").length, 1);
  const oldCount = events.length;
  receive({ data: [144, 60, 127] });
  assert.equal(events.length, oldCount);
  first.state = "connected";
  access.inputs.set("a", first);
  access.onstatechange({ port: first });
  assert.notEqual(first.onmidimessage, receive);
  const reboundCount = events.length;
  receive({ data: [144, 60, 100] });
  assert.equal(
    events.length,
    reboundCount,
    "Queued messages from an old binding must be ignored",
  );
  binding.dispose();
  assert.equal(first.onmidimessage, null);
  assert.equal(second.onmidimessage, null);
  assert.equal(access.onstatechange, null);
  const count = events.length;
  binding.refresh();
  receive({ data: [144, 60, 100] });
  assert.equal(events.length, count);
});

test("Malformed and unrelated MIDI messages never become note attempts", () => {
  const input = { state: "connected" },
    events = [];
  const access = { inputs: new Map([["a", input]]) };
  const binding = bindMIDIInputs(
    access,
    Object.fromEntries(
      ["noteOn", "noteOff", "pedal", "disconnect", "status"].map((key) => [
        key,
        (...args) => events.push([key, ...args]),
      ]),
    ),
  );
  const before = events.length;
  for (const data of [
    [144, 60],
    [144, 60, NaN],
    [144, -1, 100],
    [144, 60, 128],
    [248],
    [224, 0, 64],
    [144, 60.5, 100],
    [-112, 60, 100],
    [400, 60, 100],
  ])
    input.onmidimessage({ data });
  assert.equal(events.length, before);
  binding.dispose();
});
