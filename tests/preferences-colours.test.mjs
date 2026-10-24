import test from "node:test";
import assert from "node:assert/strict";
import {
  COLOUR_CHOICES,
  COLOUR_THEMES,
  defaultReading,
  readPreferences,
  validatePreferences,
} from "../src/preferences.mjs";
import { COMPANIONS } from "../src/companions.mjs";

test("the app is neutral by default", () => {
  assert.equal(defaultReading().colours, "neutral");
  assert.equal(readPreferences({}).preferences.reading.colours, "neutral");
  assert.equal(readPreferences(null).preferences.reading.colours, "neutral");
  assert.deepEqual(COLOUR_CHOICES, [
    "neutral",
    "companion",
    "mint",
    "lavender",
    "rose",
    "ocean",
    "walnut",
  ]);
});

test("every colour choice round-trips", () => {
  for (const colours of COLOUR_CHOICES) {
    const { preferences, issues } = readPreferences({ reading: { colours } });
    assert.deepEqual(issues, [], colours);
    assert.equal(preferences.reading.colours, colours);
    assert.equal(
      validatePreferences(preferences).reading.colours,
      colours,
      `${colours} survives a save`,
    );
  }
});

test("older settings files open neutral, whatever room they kept", () => {
  // Files written before `colours` existed: companionStyle on or off, every
  // companion and every legacy theme. None of them may force room colours.
  for (const companion of COMPANIONS.map((c) => c.id))
    for (const companionStyle of [true, false])
      for (const theme of COLOUR_THEMES) {
        const legacy = {
          theme,
          pet: "cat",
          reading: { companion, companionStyle, room: "hall", speed: 0.5 },
        };
        const { preferences, issues } = readPreferences(legacy);
        assert.deepEqual(issues, []);
        assert.equal(
          preferences.reading.colours,
          "neutral",
          `${companion}/${companionStyle}/${theme}`,
        );
        // The old fields still parse and the rest of the file survives.
        assert.equal(preferences.theme, theme);
        assert.equal(preferences.reading.companionStyle, companionStyle);
        assert.equal(preferences.reading.companion, companion);
        assert.equal(preferences.reading.room, "hall");
        assert.equal(preferences.reading.speed, 0.5);
      }
});

test("a damaged colour choice recovers alone and is flagged", () => {
  for (const colours of ["", "Neutral", "beethoven", "custom", 1, true, null, {}]) {
    const { preferences, issues } = readPreferences({
      theme: "ocean",
      reading: { colours, companion: "mozart", hand: "left" },
    });
    assert.deepEqual(issues, ["Reading preferences"], String(colours));
    assert.equal(preferences.reading.colours, "neutral");
    assert.equal(preferences.reading.companion, "mozart");
    assert.equal(preferences.reading.hand, "left");
    assert.equal(preferences.theme, "ocean");
    assert.throws(
      () => validatePreferences({ reading: { colours } }),
      /Reading preferences/,
    );
  }
});

test("colours and the piano room sound are independent", () => {
  const { preferences } = readPreferences({
    reading: { colours: "companion", room: "dry", companion: "langlang" },
  });
  assert.equal(preferences.reading.colours, "companion");
  assert.equal(preferences.reading.room, "dry");
  const neutral = readPreferences({
    reading: { colours: "neutral", room: "hall" },
  }).preferences;
  assert.equal(neutral.reading.room, "hall");
});
