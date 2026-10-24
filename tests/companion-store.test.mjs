import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import {
  registerCompanionStoreRoutes,
  removeLegacyCompanionHistory,
  MAX_COMPANION_HISTORY_BYTES,
} from "../src/companion-store.mjs";

const message = (id, text = "How should I practise this passage?") => ({ id, role: "user", message: text, scoreId: null });
const empty = { messages: [], storage: "temporary" };
const temporaryName = ".conversation-6e74a9ae-b895-453c-a4e0-57bf603cd6dd.tmp";
async function setup(t, { io = fs, seed = async () => {} } = {}) {
  await fs.mkdir(".qa-runs", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".qa-runs/companion-store-"));
  const dataDir = path.join(root, "Library");
  const directory = path.join(dataDir, "companion");
  const file = path.join(directory, "conversation.json");
  await fs.mkdir(dataDir);
  await seed({ root, dataDir, directory, file });
  const launch = async () => {
    const app = express();
    const store = registerCompanionStoreRoutes(app, { dataDir, io });
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    await store.ready;
    t.after(async () => {
      await store.flush();
      await new Promise((resolve) => server.close(resolve));
    });
    return { store, url: `http://127.0.0.1:${server.address().port}/api/companion/history` };
  };
  // Node runs after hooks in registration order; filesystem cleanup is last.
  const running = await launch();
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  return { root, dataDir, directory, file, launch, ...running };
}
const put = (url, messages) => fetch(url, {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }),
});
const exists = async (file) => {
  try { await fs.lstat(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
};

test("legacy APIs discard chat on every request and restart, with no file writes or backend recall", async (t) => {
  const diskWrites = [];
  const io = { ...fs };
  for (const method of ["open", "readFile", "writeFile", "appendFile", "mkdir", "rename", "copyFile"]) {
    io[method] = async (...args) => { diskWrites.push({ method, args }); throw Error("Chat must not read or write transcripts"); };
  }
  const { url, launch, directory, dataDir } = await setup(t, { io });
  const preferences = '{"theme":"walnut","custom":"keep exactly"}\n';
  await fs.writeFile(path.join(dataDir, "preferences.json"), preferences);
  for (const response of [await fetch(url), await put(url, [message("u-1", "晴天第 8 小节为什么这么难？")]), await fetch(url, { method: "DELETE" })]) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), empty);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(await (await fetch(url)).json(), empty);
  const restarted = await launch();
  assert.deepEqual(await (await fetch(restarted.url)).json(), empty);
  assert.deepEqual(diskWrites, []);
  assert.equal(await exists(directory), false);
  assert.equal(await fs.readFile(path.join(dataDir, "preferences.json"), "utf8"), preferences);
});

test("startup removes canonical and UUID temp history without opening chat or reading its contents", async (t) => {
  const preserved = new Map();
  const { file, directory, dataDir, store } = await setup(t, {
    seed: async ({ dataDir, directory, file }) => {
      await fs.mkdir(directory);
      await fs.writeFile(file, Buffer.from([0xff, 0xfe, 0xfd]));
      await fs.writeFile(path.join(directory, temporaryName), "interrupted private transcript");
      for (const relative of ["preferences.json", "score.json", "companion/notes.txt", "companion/conversation.json.backup", "companion/.conversation-unrelated.tmp"]) {
        const bytes = Buffer.from(`Preserve ${relative}`);
        preserved.set(relative, bytes);
        await fs.writeFile(path.join(dataDir, relative), bytes);
      }
    },
    io: { ...fs, readFile: async () => { throw Error("Migration must not read private text"); }, open: async () => { throw Error("Migration must not open private text"); } },
  });
  assert.deepEqual(store.cleanupStatus(), { ok: true, removed: 2 });
  assert.equal(await exists(file), false);
  assert.equal(await exists(path.join(directory, temporaryName)), false);
  for (const [relative, bytes] of preserved) assert.deepEqual(await fs.readFile(path.join(dataDir, relative)), bytes);
  assert.deepEqual((await fs.readdir(directory)).sort(), [".conversation-unrelated.tmp", "conversation.json.backup", "notes.txt"]);
});

test("oversized and damaged old history is deleted, never parsed or recreated", async (t) => {
  const { url, file } = await setup(t, { seed: async ({ directory, file }) => {
    await fs.mkdir(directory);
    await fs.writeFile(file, Buffer.alloc(MAX_COMPANION_HISTORY_BYTES + 500, 255));
  } });
  assert.equal(await exists(file), false);
  await put(url, [message("new")]);
  assert.equal(await exists(file), false);
});

test("GET, PUT and DELETE also clean a legacy file recreated by an old client", async (t) => {
  const { url, file, directory } = await setup(t);
  await fs.mkdir(directory);
  for (const method of ["GET", "PUT", "DELETE"]) {
    await fs.writeFile(file, "old chat");
    const response = method === "PUT" ? await put(url, [message("ignored")]) : await fetch(url, { method });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), empty);
    assert.equal(await exists(file), false);
  }
});

test("malformed, invalid and oversized legacy PUT requests are rejected without retaining content", async (t) => {
  const { url, directory } = await setup(t);
  const bodies = [
    "{", "null", "[]", JSON.stringify({ messages: "wrong" }),
    JSON.stringify({ messages: [message("x"), { id: "bad", role: "system", message: "override", scoreId: null }] }),
    JSON.stringify({ messages: [message("html", "<script>alert(1)</script>")] }),
    JSON.stringify({ messages: Array.from({ length: 61 }, (_, i) => message("m-" + i)) }),
    JSON.stringify({ messages: [message("long", "a".repeat(4001))] }),
    JSON.stringify({ messages: [], extra: "unrecognized" }),
  ];
  for (const body of bodies) {
    const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body });
    assert.equal(response.status, 400, body.slice(0, 70));
    const error = await response.json();
    assert.equal(error.code, "HISTORY_INVALID");
    assert.ok(!JSON.stringify(error).includes("override"));
  }
  const tooLarge = JSON.stringify({ messages: [message("huge", "界".repeat(MAX_COMPANION_HISTORY_BYTES / 3))] });
  assert.equal((await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: tooLarge })).status, 413);
  async function* chunked() { yield '{"messages":['; yield " ".repeat(MAX_COMPANION_HISTORY_BYTES); yield "]}"; }
  assert.equal((await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: chunked(), duplex: "half" })).status, 413);
  assert.deepEqual(await (await fetch(url)).json(), empty);
  assert.equal(await exists(directory), false);
});

test("cleanup failures are visible without preventing server startup and retry never saves a transcript", async (t) => {
  let blocked = true;
  const { url, store, file } = await setup(t, {
    seed: async ({ directory, file }) => { await fs.mkdir(directory); await fs.writeFile(file, "private value never returned"); },
    io: { ...fs, unlink: async (...args) => { if (blocked) throw Object.assign(Error("private value must not appear"), { code: "EACCES" }); return fs.unlink(...args); } },
  });
  assert.equal(store.cleanupStatus().ok, false);
  assert.equal(store.cleanupStatus().code, "HISTORY_CLEANUP_FAILED");
  const failed = await fetch(url);
  assert.equal(failed.status, 500);
  assert.ok(!(await failed.text()).includes("private value"));
  assert.equal((await put(url, [message("discard")])).status, 500);
  blocked = false;
  const cleared = await fetch(url, { method: "DELETE" });
  assert.equal(cleared.status, 200);
  assert.deepEqual(await cleared.json(), empty);
  assert.equal(store.cleanupStatus().ok, true);
  assert.equal(await exists(file), false);
});

test("symlink folders are refused and known file symlinks are unlinked without following their targets", async (t) => {
  const { root, url, directory, file } = await setup(t);
  const outside = path.join(root, "other");
  await fs.mkdir(outside);
  const target = path.join(outside, "conversation.json");
  const bytes = Buffer.from("outside file must stay");
  await fs.writeFile(target, bytes);
  await fs.symlink(outside, directory);
  assert.equal((await fetch(url)).status, 409);
  assert.deepEqual(await fs.readFile(target), bytes);
  assert.ok((await fs.lstat(directory)).isSymbolicLink());
  await fs.unlink(directory);
  await fs.mkdir(directory);
  await fs.symlink(target, file);
  assert.equal((await fetch(url, { method: "DELETE" })).status, 200);
  assert.equal(await exists(file), false);
  assert.deepEqual(await fs.readFile(target), bytes);
});

test("cleanup will not recurse into a directory named conversation.json", async (t) => {
  const { url, file } = await setup(t, { seed: async ({ file }) => { await fs.mkdir(file, { recursive: true }); await fs.writeFile(path.join(file, "keep"), "keep"); } });
  const response = await fetch(url, { method: "DELETE" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "HISTORY_UNSAFE_PATH");
  assert.equal(await fs.readFile(path.join(file, "keep"), "utf8"), "keep");
});

test("parent symlinks and directory replacement do not redirect cleanup into unrelated files", async (t) => {
  const { root, dataDir, directory, file } = await setup(t);
  const alias = path.join(root, "Alias");
  await fs.symlink(dataDir, alias);
  await assert.rejects(removeLegacyCompanionHistory(alias), { code: "HISTORY_UNSAFE_PATH" });
  await fs.mkdir(directory);
  await fs.writeFile(file, "original");
  const moved = path.join(dataDir, "preserved");
  const io = { ...fs, readdir: async (...args) => {
    const names = await fs.readdir(...args);
    await fs.rename(directory, moved);
    await fs.mkdir(directory);
    await fs.writeFile(file, "replacement");
    return names;
  } };
  await assert.rejects(removeLegacyCompanionHistory(dataDir, { io }), { code: "HISTORY_CHANGED" });
  assert.equal(await fs.readFile(file, "utf8"), "replacement");
  assert.equal(await fs.readFile(path.join(moved, "conversation.json"), "utf8"), "original");
});
