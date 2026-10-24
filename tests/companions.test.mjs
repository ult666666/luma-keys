import test from "node:test";
import assert from "node:assert/strict";
import { COMPANIONS, companionFor } from "../src/companions.mjs";

test("six companion profiles have distinct identities and supported appearance settings", () => {
  assert.deepEqual(COMPANIONS.map(({ id }) => id), ["beethoven", "langlang", "mozart", "liszt", "cat", "bunny"]);
  const expected = {
    beethoven: ["Beethoven", "The walnut study", "walnut", "room"],
    langlang: ["Lang Lang", "The concert room", "ocean", "hall"],
    mozart: ["Mozart", "The porcelain salon", "lavender", "dry"],
    liszt: ["Liszt", "The midnight salon", "rose", "hall"],
    cat: ["Luma", "The garden room", "mint", "room"],
    bunny: ["Mochi", "The rose room", "rose", "room"],
  };
  for (const profile of COMPANIONS) {
    assert.deepEqual([profile.name, profile.roomName, profile.theme, profile.room], expected[profile.id]);
    for (const key of ["zh", "paletteName", "description", "ritual"]) assert.ok(typeof profile[key] === "string" && profile[key].trim().length > 0, `${profile.id}.${key}`);
    assert.equal(profile.swatches.length, 3);
    assert.ok(profile.swatches.every((color) => /^#[0-9a-f]{6}$/i.test(color)));
    assert.equal(companionFor(profile.id), profile);
  }
});

test("unknown IDs always use Beethoven without treating names or object keys as IDs", () => {
  for (const id of [undefined, null, "", "dog", "Lang Lang", "__proto__", "constructor", {}, 0]) {
    assert.equal(companionFor(id), COMPANIONS[0]);
  }
});

test("catalog, profiles and independent swatch arrays are immutable", () => {
  assert.ok(Object.isFrozen(COMPANIONS));
  assert.equal(new Set(COMPANIONS).size, 6);
  assert.equal(new Set(COMPANIONS.map((profile) => profile.swatches)).size, 6);
  const snapshot = structuredClone(COMPANIONS);
  assert.throws(() => COMPANIONS.push({ id: "new" }), TypeError);
  for (const profile of COMPANIONS) {
    assert.ok(Object.isFrozen(profile));
    assert.ok(Object.isFrozen(profile.swatches));
    assert.throws(() => { profile.name = "changed"; }, TypeError);
    assert.throws(() => { profile.swatches[0] = "#000000"; }, TypeError);
  }
  assert.deepEqual(COMPANIONS, snapshot);
});
