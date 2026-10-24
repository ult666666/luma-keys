import test from "node:test";
import assert from "node:assert/strict";
import {
  focusedByPointer,
  keyOwner,
  markPointerFocus,
  noteFocus,
  noteKey,
  notePointer,
  restoreFocus,
} from "../src/focus-intent.mjs";

// Minimal stand-ins for DOM elements.
const el = (tagName, { type, role, editable = false, inside = null } = {}) => {
  const node = {
    tagName,
    type,
    role,
    isContentEditable: editable,
    parent: inside,
    focused: [],
    focus(options) {
      this.focused.push(options);
      noteFocus(this);
    },
    closest(selector) {
      for (let n = this; n; n = n.parent) {
        const tag = n.tagName.toLowerCase();
        if (
          selector.split(",").some((s) => {
            s = s.trim();
            if (s === tag) return true;
            if (s === "a[href]") return tag === "a";
            const r = s.match(/^\[role=(\w+)\]$/);
            return r && n.role === r[1];
          })
        )
          return n;
      }
      return null;
    },
  };
  return node;
};

test("a clicked button lets Space play; a button reached with Tab keeps Space", () => {
  const wait = el("BUTTON");
  notePointer(100);
  noteFocus(wait);
  assert.equal(focusedByPointer(wait), true);
  assert.equal(keyOwner(wait, { code: "Space", pointer: true }), "app");

  const next = el("BUTTON");
  noteKey("Tab", 200);
  noteFocus(next);
  assert.equal(focusedByPointer(next), false);
  assert.equal(keyOwner(next, { code: "Space", pointer: false }), "control");
  // Other shortcuts are never taken by a focused button.
  assert.equal(keyOwner(next, { code: "KeyR", pointer: false }), "app");
});

test("modifier keys alone do not turn a click into keyboard focus", () => {
  const b = el("BUTTON");
  notePointer(300);
  noteKey("Shift", 310);
  noteFocus(b);
  assert.equal(focusedByPointer(b), true);
});

test("text fields keep every key; a clicked list gives Space back", () => {
  assert.equal(keyOwner(el("INPUT", { type: "text" }), { code: "Space" }), "text");
  assert.equal(keyOwner(el("INPUT", { type: "number" }), { code: "KeyN" }), "text");
  assert.equal(keyOwner(el("TEXTAREA"), { code: "Space" }), "text");
  assert.equal(keyOwner(el("DIV", { editable: true }), { code: "Space" }), "text");
  assert.equal(keyOwner(el("SELECT"), { code: "KeyN", pointer: true }), "text");
  assert.equal(keyOwner(el("SELECT"), { code: "Space", pointer: true }), "app");
  assert.equal(keyOwner(el("SELECT"), { code: "Space", pointer: false }), "text");
  assert.equal(keyOwner(el("INPUT", { type: "range" }), { code: "Space", pointer: true }), "app");
  assert.equal(keyOwner(el("INPUT", { type: "checkbox" }), { code: "Space" }), "control");
  assert.equal(keyOwner(el("BODY"), { code: "Space" }), "app");
  const icon = el("SVG", { inside: el("BUTTON") });
  assert.equal(keyOwner(icon, { code: "Space", pointer: false }), "control");
  assert.equal(keyOwner(el("DIV", { role: "tab" }), { code: "Space" }), "control");
});

test("focus handed back after Esc keeps a clicked opener clicked, without a ring", () => {
  const gear = el("BUTTON");
  notePointer(400);
  noteFocus(gear);
  const opener = focusedByPointer(gear);
  noteKey("Escape", 500); // the dialog closes with Esc
  restoreFocus(gear, opener);
  assert.equal(focusedByPointer(gear), true);
  assert.deepEqual(gear.focused.at(-1), { focusVisible: false });
  // A keyboard opener gets its ring back.
  const tools = el("BUTTON");
  noteKey("Tab", 600);
  noteFocus(tools);
  restoreFocus(tools, focusedByPointer(tools), { preventScroll: true });
  assert.equal(focusedByPointer(tools), false);
  assert.deepEqual(tools.focused.at(-1), { preventScroll: true });
  markPointerFocus(tools);
  assert.equal(focusedByPointer(tools), true);
});
