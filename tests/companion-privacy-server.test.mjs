import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import { demos } from "../src/music.mjs";

test("actual server startup removes old chat before listening while preserving music, preferences and exports", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "luma-chat-privacy-"));
  const dataDir = path.join(root, "Library");
  const directory = path.join(dataDir, "companion");
  await fs.mkdir(directory, { recursive: true });
  const transcript = path.join(directory, "conversation.json");
  await fs.writeFile(transcript, '{"messages":[{"private":"old chat"}]}');
  const score = demos()[0];
  const preserved = new Map([
    [path.join(dataDir, score.id + ".json"), JSON.stringify(score)],
    [path.join(dataDir, "preferences.json"), '{"theme":"rose","practiceLog":{"keep":"untouched"}}'],
    [path.join(root, "Exports", "saved.practice.json"), JSON.stringify(score)],
  ]);
  for (const [file, bytes] of preserved) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes); }
  const running = [];
  t.after(async () => {
    for (const app of running) { await app.shutdown(); await new Promise(resolve => app.server.close(resolve)); }
    await fs.rm(root, { recursive: true, force: true });
  });
  const launch = async () => {
    const app = await startServer({ port: 0, dataDir, companionEngineDir: path.join(root, "no-model"), companionHelper: path.join(root, "no-helper") });
    running.push(app);
    return `http://127.0.0.1:${app.port}`;
  };
  const base = await launch();
  await assert.rejects(fs.stat(transcript), { code: "ENOENT" });
  const health = await (await fetch(base + "/api/health")).json();
  assert.deepEqual(health.companionHistory, { storage: "temporary", cleanup: { ok: true, removed: 1 } });
  assert.equal((await (await fetch(base + "/api/library")).json()).scores[0].id, score.id);
  const sent = await fetch(base + "/api/companion/history", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ id: "new", role: "user", message: "Please keep this temporary", scoreId: null }] }) });
  assert.equal(sent.status, 200);
  assert.deepEqual(await sent.json(), { messages: [], storage: "temporary" });
  const restarted = await launch();
  assert.deepEqual(await (await fetch(restarted + "/api/companion/history")).json(), { messages: [], storage: "temporary" });
  assert.deepEqual(await fs.readdir(directory), []);
  for (const [file, bytes] of preserved) assert.equal(await fs.readFile(file, "utf8"), bytes);
});
