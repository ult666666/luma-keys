import test from "node:test";
import assert from "node:assert/strict";
import permissions from "../microphone-permission.cjs";

const origin = "http://127.0.0.1:43210";
const own = { getURL: () => `${origin}/` };
const request = (extra = {}) => ({ isMainFrame: true, requestingUrl: `${origin}/practice`, mediaTypes: ["audio"], ...extra });
const check = (extra = {}) => ({ isMainFrame: true, requestingUrl: `${origin}/practice`, mediaType: "audio", ...extra });

test("microphone permission permits only audio for the app's own main frame", () => {
  assert.equal(permissions.allowRequest(own, "media", origin, request()), true);
  assert.equal(permissions.allowCheck(own, "media", origin, origin, check()), true);
  for (const details of [request({ isMainFrame: false }), request({ requestingUrl: "https://foreign.example/" }), request({ mediaTypes: ["video"] }), request({ mediaTypes: ["audio", "video"] }), request({ mediaTypes: [] }), request({ mediaTypes: undefined })])
    assert.equal(permissions.allowRequest(own, "media", origin, details), false, JSON.stringify(details));
  for (const details of [check({ isMainFrame: false }), check({ requestingUrl: "https://foreign.example/" }), check({ mediaType: "video" }), check({ mediaType: "unknown" }), check({ mediaType: undefined })])
    assert.equal(permissions.allowCheck(own, "media", origin, origin, details), false, JSON.stringify(details));
});

test("foreign windows, ports, requesting origins and unrelated permission types stay denied", () => {
  for (const url of ["https://foreign.example/", "http://127.0.0.1:43211/", `${origin}.foreign.example/`, `${origin}@foreign.example/`]) {
    const foreign = { getURL: () => url };
    assert.equal(permissions.allowRequest(foreign, "media", origin, request()), false, url);
    assert.equal(permissions.allowCheck(foreign, "media", origin, origin, check()), false, url);
  }
  assert.equal(permissions.allowRequest(null, "media", origin, request()), false);
  assert.equal(permissions.allowCheck(null, "media", origin, origin, check()), false);
  for (const requestingOrigin of ["https://foreign.example", "http://127.0.0.1:43211", `${origin}/`, "null", ""])
    assert.equal(permissions.allowCheck(own, "media", requestingOrigin, origin, check()), false, requestingOrigin);
  for (const permission of ["camera", "microphone", "geolocation", "display-capture", "notifications", "clipboard-read", "midiSysex"]) {
    assert.equal(permissions.allowRequest(own, permission, origin, request()), false, permission);
    assert.equal(permissions.allowCheck(own, permission, origin, origin, check()), false, permission);
  }
});

test("existing MIDI permission remains available only within the app origin", () => {
  assert.equal(permissions.allowRequest(own, "midi", origin, request()), true);
  assert.equal(permissions.allowCheck(own, "midi", origin, origin, check()), true);
  assert.equal(permissions.allowRequest(own, "midi", origin, request({ isMainFrame: false })), false);
  assert.equal(permissions.allowCheck(own, "midi", "https://foreign.example", origin, check()), false);
});
