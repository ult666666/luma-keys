import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import express from "express";
import { CONVERSATION_LANGUAGES } from "../src/companion-language.mjs";
import { requestCompanionReply, readCompanionStream } from "../src/companion-stream.mjs";
import {
  registerCompanionModelRoutes,
  MAX_COMPANION_CHAT_BYTES,
  repeatedReplyPrefix,
} from "../src/companion-model.mjs";

const fixture = `
const emit = value => process.stdout.write(JSON.stringify(value)+'\\n');
if (process.argv.includes('--availability')) {
  setTimeout(() => emit({available:true,reason:'available'}), 20);
} else {
  let input='';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input+=chunk);
  process.stdin.on('end', async () => {
    const body=JSON.parse(input), mode=body.prompt;
    if (mode==='echo') { emit({type:'text',text:JSON.stringify(body)}); emit({type:'done'}); }
    else if (mode==='unicode') {
      const bytes=Buffer.from(JSON.stringify({type:'text',text:'先慢练，再连起来。🎹'})+'\\n'+JSON.stringify({type:'done'})+'\\n');
      for (const byte of bytes) { process.stdout.write(Buffer.from([byte])); await new Promise(r=>setTimeout(r,1)); }
    } else if(mode==='hold' || mode==='ignore-term') {
      if(mode==='ignore-term') process.on('SIGTERM',()=>{});
      emit({type:'text',text:'I am thinking.'});setInterval(()=>{},1000);
    } else if(mode==='late-exit') {
      emit({type:'text',text:'Done.'});emit({type:'done'});setTimeout(()=>{},80);
    } else if(mode==='repetitive') {
      emit({type:'text',text:'Try one short passage, then stop and listen carefully.\\n'.repeat(4)});
      emit({type:'done'});setInterval(()=>{},1000);
    } else if(mode==='error') {
      emit({type:'text',text:'First sentence.'});
      emit({type:'error',code:'contextTooLong',message:'SECRET PROMPT raw stack'});
    } else if(mode==='unknown-error') emit({type:'error',code:'secretError',message:'SECRET PROMPT raw stack'});
    else if(mode==='invalid-error-code') emit({type:'error',code:{toString:null,valueOf:null},message:'SECRET PROMPT raw stack'});
    else if(mode==='garbage') process.stdout.write('{bad JSON\\n');
    else if(mode==='invalid-utf8') process.stdout.write(Buffer.from([0xff,0x0a]));
    else if(mode==='missing-done') emit({type:'text',text:'Half a reply.'});
    else if(mode==='empty') emit({type:'done'});
    else if(mode==='too-long') emit({type:'text',text:'a'.repeat(4001)});
    else if(mode==='after-done') { emit({type:'text',text:'Before.'});emit({type:'done'});emit({type:'text',text:'After.'}); }
    else if(mode==='crash') { process.stderr.write('SECRET PROMPT raw stack'); process.exitCode=3; }
    else { emit({type:'text',text:'A calm reply.'});emit({type:'done'}); }
  });
}
`;

async function setup(t, options = {}) {
  const { fixtureSource = fixture, ...backendOptions } = options;
  await fs.mkdir(".qa-runs", { recursive: true });
  const directory = await fs.mkdtemp(path.resolve(".qa-runs/companion-model-"));
  const helper = path.join(directory, "fake-helper.cjs");
  await fs.writeFile(helper, fixtureSource);
  const children = [],
    calls = [],
    spawnConfigs = [];
  const app = express();
  const backend = registerCompanionModelRoutes(app, {
    helperPath: helper,
    buildPrompt: (body) => ({
      instructions: "Only trusted instructions.",
      prompt: body.message,
    }),
    spawnProcess: (file, args, config) => {
      calls.push(args);
      spawnConfigs.push(config);
      const child = spawn(process.execPath, [file, ...args], config);
      children.push(child);
      return child;
    },
    killGraceMs: 30,
    ...backendOptions,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/companion`;
  t.after(async () => {
    await backend.shutdown();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.ok(
      children.every(
        (child) => child.exitCode !== null || child.signalCode !== null,
      ),
      "all helper processes exit before cleanup",
    );
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { backend, url, children, calls, spawnConfigs };
}
const post = (url, message = "hello", extras = {}) =>
  fetch(`${url}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      context: {},
      history: [],
      companionId: "beethoven",
    }),
    ...extras,
  });
const events = async (response) =>
  (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
// Containers can take a second or two to reap orphaned children, so allow 5 seconds. Passing
// conditions still return as soon as they hold.
const waitFor = async (predicate) => {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(predicate(), "condition settles within 5 seconds");
};

test("an immediate retry waits for cancelled model cleanup without duplicate generation", async (t) => {
  const { url, children } = await setup(t, { killGraceMs: 550 });
  const abort = new AbortController();
  const response = await post(url, "ignore-term", { signal: abort.signal });
  const reader = response.body.getReader();
  await reader.read();
  abort.abort();
  await reader.cancel().catch(() => {});
  const statuses = [];
  const retry = await requestCompanionReply({ message: "hello", context: {}, history: [], companionId: "mozart" }, {
    fetchImpl: async (_, options) => {
      const result = await fetch(`${url}/chat`, options);
      statuses.push(result.status);
      assert.ok(children.filter(c => c.exitCode === null && c.signalCode === null).length <= 1);
      return result;
    },
  });
  assert.equal(await readCompanionStream(retry, () => {}), "A calm reply.");
  assert.ok(statuses.includes(409), "actually exercises the cleanup race");
  assert.equal(statuses.at(-1), 200);
  assert.equal(children.length, 2, "one cancelled generation and one successful generation");
});

test("availability is cached, concurrent probes share one child, and no generation occurs", async (t) => {
  const { url, calls } = await setup(t);
  const results = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const response = await fetch(`${url}/model`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      return response.json();
    }),
  );
  for (const result of results)
    assert.deepEqual(result, {
      available: true,
      reason: "available",
      model: "Apple on-device model",
    });
  await fetch(`${url}/model`);
  assert.deepEqual(calls, [["--availability"]]);
});

test("the prompt builder receives bounded user data; only trusted prompt fields reach helper", async (t) => {
  let received;
  const { url } = await setup(t, {
    buildPrompt(body) {
      received = body;
      return {
        instructions: "Only trusted instructions.",
        prompt: "echo",
        discarded: "not sent",
      };
    },
  });
  const response = await post(url, "How do I play bar 2?");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/x-ndjson/);
  const stream = await events(response);
  assert.deepEqual(received, {
    message: "How do I play bar 2?",
    context: {},
    history: [],
    companionId: "beethoven",
  });
  assert.deepEqual(JSON.parse(stream[0].text), {
    instructions: "Only trusted instructions.",
    prompt: "echo",
  });
  assert.deepEqual(stream[1], { type: "done" });
});

test("cumulative Unicode survives every byte split, including Chinese and emoji", async (t) => {
  const { url } = await setup(t);
  assert.deepEqual(await events(await post(url, "unicode")), [
    { type: "text", text: "先慢练，再连起来。🎹" },
    { type: "done" },
  ]);
});

test("invalid and oversized JSON cannot launch or reserve the model", async (t) => {
  const { url, calls } = await setup(t, {
    buildPrompt(body) {
      if (body.context?.invalid) throw Error("private details");
      return { instructions: "trusted", prompt: body.message };
    },
  });
  for (const body of [
    "{",
    "null",
    "[]",
    "42",
    "{}",
    JSON.stringify({ message: "x", extra: "bad" }),
    JSON.stringify({ message: "a".repeat(2001) }),
    JSON.stringify({ message: "x", context: { invalid: true } }),
  ]) {
    const response = await post(url, "", { body });
    assert.equal(response.status, 400, body.slice(0, 30));
    assert.ok(!(await response.text()).includes("private details"));
  }
  assert.equal(
    (
      await post(url, "", {
        body: JSON.stringify({
          message: "x",
          history: "x".repeat(MAX_COMPANION_CHAT_BYTES),
        }),
      })
    ).status,
    413,
  );
  async function* chunked() {
    yield '{"message":"x","history":';
    yield " ".repeat(MAX_COMPANION_CHAT_BYTES);
    yield "[]}";
  }
  assert.equal(
    (await post(url, "", { body: chunked(), duplex: "half" })).status,
    413,
  );
  assert.equal(
    (await post(url, "x", { headers: { "Content-Type": "text/plain" } }))
      .status,
    415,
  );
  assert.equal(calls.length, 0);
  assert.equal((await events(await post(url))).at(-1).type, "done");
});

test("one generation owns the slot, abort kills it, and a later request succeeds", async (t) => {
  const { url, children } = await setup(t);
  const controller = new AbortController();
  const response = await post(url, "hold", { signal: controller.signal });
  const reader = response.body.getReader();
  assert.match(
    new TextDecoder().decode((await reader.read()).value),
    /thinking/,
  );
  assert.equal((await post(url)).status, 409);
  controller.abort();
  await reader.cancel().catch(() => {});
  await waitFor(() => children[0].signalCode !== null);
  assert.equal((await events(await post(url))).at(-1).type, "done");
});

test("completion is published only after helper exit so immediate retry is safe", async (t) => {
  const { url, children } = await setup(t, { killGraceMs: 200 });
  const first = await events(await post(url, "late-exit"));
  assert.equal(first.at(-1).type, "done");
  assert.equal(children[0].exitCode, 0);
  assert.equal((await events(await post(url))).at(-1).type, "done");
});

test("timeout escalates to SIGKILL for an uncooperative child and releases the slot", async (t) => {
  const { url, children } = await setup(t, { timeoutMs: 1200 });
  const result = await events(await post(url, "ignore-term"));
  assert.equal(result.at(-1).code, "timeout");
  assert.equal(children[0].signalCode, "SIGKILL");
  assert.equal((await events(await post(url))).at(-1).type, "done");
});

test("error streams are terminal and expose only fixed public messages", async (t) => {
  const { url } = await setup(t);
  const first = await events(await post(url, "error"));
  assert.equal(first[0].text, "First sentence.");
  assert.equal(first.at(-1).code, "contextTooLong");
  assert.ok(!JSON.stringify(first).includes("SECRET"));
  assert.equal(
    (await events(await post(url, "unknown-error"))).at(-1).code,
    "generationFailed",
  );
  assert.equal((await events(await post(url))).at(-1).type, "done");
});

test("malformed, missing, empty, oversized, invalid UTF8 and post-terminal helper output fail closed", async (t) => {
  const { url } = await setup(t);
  for (const mode of [
    "garbage",
    "missing-done",
    "empty",
    "too-long",
    "invalid-utf8",
    "invalid-error-code",
    "after-done",
    "crash",
  ]) {
    const result = await events(await post(url, mode));
    assert.equal(result.at(-1).type, "error", mode);
    assert.equal(result.filter((item) => item.type === "done").length, 0, mode);
    assert.equal(
      result.filter((item) => item.type === "error").length,
      1,
      mode,
    );
    assert.ok(!JSON.stringify(result).includes("SECRET"));
    assert.ok(!result.some((item) => item.text === "After."));
  }
});

test("shutdown ends active generation, blocks new requests and leaves no helper", async (t) => {
  const { url, backend, children } = await setup(t);
  const response = await post(url, "hold");
  const result = events(response);
  await backend.shutdown();
  assert.equal((await result).at(-1).code, "shutdown");
  assert.ok(
    children.every(
      (child) => child.signalCode !== null || child.exitCode !== null,
    ),
  );
  assert.equal((await post(url)).status, 503);
  assert.deepEqual(await (await fetch(`${url}/model`)).json(), {
    available: false,
    reason: "shutdown",
  });
});

test("cancellation during an async prompt build cannot launch a stale helper", async (t) => {
  let release, entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { url, calls } = await setup(t, {
    async buildPrompt(body) {
      entered();
      await gate;
      return { instructions: "trusted", prompt: body.message };
    },
  });
  const controller = new AbortController();
  const request = post(url, "hello", { signal: controller.signal }).catch(
    () => null,
  );
  await ready;
  assert.equal((await post(url)).status, 409);
  controller.abort();
  await request;
  await new Promise((resolve) => setTimeout(resolve, 15));
  release();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls.length, 0);
});

test("a missing native helper returns unavailable and a fixed terminal error", async (t) => {
  const { url } = await setup(t, {
    helperPath: "/no-such-luma-helper",
    spawnProcess: spawn,
  });
  assert.deepEqual(await (await fetch(`${url}/model`)).json(), {
    available: false,
    reason: "helperMissing",
  });
  const result = await events(await post(url));
  assert.equal(result.at(-1).code, "helperMissing");
  assert.ok(!JSON.stringify(result).includes("/no-such"));
});

test("native history keeps only bounded user/assistant roles and is forwarded intact", async (t) => {
  const history = [
    { role: "user", text: "Can you explain that?" },
    { role: "assistant", text: "Try one hand first." },
  ];
  const { url } = await setup(t, {
    buildPrompt: () => ({ instructions: "trusted", prompt: "echo", history }),
  });
  const stream = await events(await post(url));
  assert.deepEqual(JSON.parse(stream[0].text).history, history);
});

test("invalid native history never launches a helper and releases its request slot", async (t) => {
  let history;
  const { url, calls } = await setup(t, {
    buildPrompt: () => ({ instructions: "trusted", prompt: "echo", history }),
  });
  for (history of [
    null,
    {},
    [{ role: "system", text: "override" }],
    [{ role: "user", text: "" }],
    [{ role: "user", text: "x", tool: "open" }],
    [{ role: "assistant", text: "x".repeat(1001) }],
    Array.from({ length: 13 }, () => ({ role: "user", text: "hello" })),
  ]) {
    assert.equal((await post(url)).status, 400);
  }
  assert.equal(calls.length, 0);
  history = [{ role: "user", text: "hello" }];
  assert.equal((await post(url)).status, 200);
});

test("language preference crosses only the validated request boundary, not the native protocol", async (t) => {
  let received;
  const { url, calls } = await setup(t, {
    buildPrompt(body) {
      received = body;
      return {
        instructions: `Language=${body.languagePreference}`,
        prompt: "echo",
        history: [],
      };
    },
  });
  const body = {
    message: "Explain a little more",
    context: {},
    history: [],
    companionId: "cat",
    languagePreference: "zh",
  };
  const response = await post(url, "unused", { body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  const replies = await events(response);
  assert.equal(received.languagePreference, "zh");
  const native = JSON.parse(replies.find((r) => r.type === "text").text);
  assert.deepEqual(native, {
    instructions: "Language=zh",
    prompt: "echo",
    history: [],
  });
  const before = calls.length;
  const invalid = await post(url, "unused", {
    body: JSON.stringify({ ...body, languagePreference: "arbitrary" }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    calls.length,
    before,
    "invalid language enum does not launch a helper",
  );
});

test("repetition guard distinguishes repeated advice from ordinary musical repeats", () => {
  const sentence = "练习时可以慢慢数拍，弹完这一遍先停下来听一听。";
  assert.equal(
    repeatedReplyPrefix(`${sentence}\n${sentence}\n${sentence}\n${sentence}\n`),
    sentence,
  );
  assert.equal(
    repeatedReplyPrefix("Play C, then G. Play C, then G. Play C, then G."),
    null,
    "short legitimate note sequences are not a runaway response",
  );
  assert.equal(
    repeatedReplyPrefix(
      "Start at bar 4. Count one steady pulse. Keep the bass note held while the melody moves. Stop before the next bar.",
    ),
    null,
  );
});

test("runaway model text is stopped as an error and retains only the useful first occurrence", async (t) => {
  const { url, children } = await setup(t);
  const response = await post(url, "repetitive");
  const reply = await events(response);
  assert.equal(reply.at(-1).type, "error");
  assert.equal(reply.at(-1).code, "repetitiveResponse");
  assert.equal(
    reply.findLast((r) => r.type === "text").text,
    "Try one short passage, then stop and listen carefully.",
  );
  assert.ok(
    children.every(
      (child) => child.exitCode !== null || child.signalCode !== null,
    ),
    "generation process is gone before retry becomes available",
  );
  const retry = await post(url, "hello");
  assert.equal((await events(retry)).at(-1).type, "done");
});

test("all 13 canonical languages reach the builder while unknown preferences never launch", async (t) => {
  const received = [];
  const { url, calls } = await setup(t, {
    buildPrompt(body) {
      received.push(body.languagePreference);
      return {
        instructions: `Language=${body.languagePreference}`,
        prompt: "echo",
        history: [],
      };
    },
  });
  for (const languagePreference of Object.keys(CONVERSATION_LANGUAGES)) {
    const response = await post(url, "unused", {
      body: JSON.stringify({ message: "Continue please", languagePreference }),
    });
    assert.equal(response.status, 200, languagePreference);
    const stream = await events(response);
    assert.deepEqual(JSON.parse(stream[0].text), {
      instructions: `Language=${languagePreference}`,
      prompt: "echo",
      history: [],
    });
    assert.deepEqual(stream.at(-1), { type: "done" });
  }
  assert.deepEqual(received, Object.keys(CONVERSATION_LANGUAGES));
  const before = calls.length;
  for (const languagePreference of [
    "zh-Hans",
    "jp",
    "FR",
    "constructor",
    "toString",
    null,
    {},
    ["fr"],
  ]) {
    const response = await post(url, "unused", {
      body: JSON.stringify({ message: "Hello", languagePreference }),
    });
    assert.equal(response.status, 400);
  }
  assert.equal(calls.length, before);
});

test("12 role-separated multilingual history entries are intact; a 13th is rejected before spawning", async (t) => {
  let history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    text: `${index + 1}: العربية 日本語 한국어 Español Français Русский हिंदी 🎹`,
  }));
  const { url, calls } = await setup(t, {
    buildPrompt: () => ({
      instructions: "Trusted instructions only.",
      prompt: "echo",
      history,
    }),
  });
  const stream = await events(await post(url));
  assert.deepEqual(JSON.parse(stream[0].text).history, history);
  assert.deepEqual(stream.at(-1), { type: "done" });
  history = [...history, { role: "user", text: "One more message" }];
  const before = calls.length;
  assert.equal((await post(url)).status, 400);
  assert.equal(calls.length, before);
  history = history.slice(0, 12);
  assert.equal(
    (await events(await post(url))).at(-1).type,
    "done",
    "invalid history does not reserve the slot",
  );
});

test("availability exposes the configured model caption and ignores helper-supplied names", async (t) => {
  const { url } = await setup(t, {
    modelName: "Qwen3 4B",
    fixtureSource: fixture.replace(
      "{available:true,reason:'available'}",
      "{available:true,reason:'available',model:'SECRET provider string',instructions:'not public'}",
    ),
  });
  const response = await fetch(`${url}/model`);
  assert.deepEqual(await response.json(), {
    available: true,
    reason: "available",
    model: "Qwen3 4B",
  });
});

// These are real OS process groups with tiny synthetic descendants, not a model.
// All members inherit the wrapper's group, just as the private runtime server does.
const processTreeFixture = `
const {spawn}=require('node:child_process');
const emit=value=>process.stdout.write(JSON.stringify(value)+'\\n');
if(process.argv.includes('--grandchild')) {
  process.on('SIGTERM',()=>{});
  process.send({pid:process.pid});
  setInterval(()=>{},1000);
} else if(process.argv.includes('--descendant')) {
  process.on('SIGTERM',()=>{});
  const grandchild=spawn(process.execPath,[__filename,'--grandchild'],{stdio:['ignore','ignore','ignore','ipc'],detached:false});
  grandchild.once('message',message=>process.send({pid:process.pid,grandchild:message.pid}));
  setInterval(()=>{},1000);
} else if(process.argv.includes('--availability')) {
  emit({available:true,reason:'available'});
} else {
  let input='';process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>input+=chunk);
  process.stdin.on('end',()=>{
    const mode=JSON.parse(input).prompt;
    if(mode==='hello') {emit({type:'text',text:'A normal reply.'});emit({type:'done'});return;}
    process.on('SIGTERM',()=>{});
    process.on('disconnect',()=>process.exit(9));
    const descendant=spawn(process.execPath,[__filename,'--descendant'],{stdio:['ignore','ignore','ignore','ipc'],detached:false});
    descendant.once('message',message=>{
      emit({type:'text',text:JSON.stringify({wrapper:process.pid,...message})});
      if(mode==='tree-complete') {emit({type:'done'});setTimeout(()=>process.exit(0),10);}
      else if(mode==='tree-crash') setTimeout(()=>process.exit(7),10);
      else setInterval(()=>{},1000);
    });
  });
}
`;
const processExists = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
};
const processTree = (stream) =>
  JSON.parse(stream.find((event) => event.type === "text").text);
async function setupTree(t, options = {}) {
  const setupResult = await setup(t, {
    fixtureSource: processTreeFixture,
    ownedProcessGroup: true,
    killGraceMs: 80,
    timeoutMs: 2000,
    ...options,
  });
  t.after(() => {
    // Keep tests self-cleaning even if an assertion exposes a production regression.
    for (const child of setupResult.children)
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
  });
  return setupResult;
}

for (const [mode, terminal] of [
  ["tree-complete", "done"],
  ["tree-crash", "generationFailed"],
]) {
  test(
    `owned group cleanup reaps child and grandchild after ${mode}`,
    { skip: process.platform === "win32" },
    async (t) => {
      const { url, children, spawnConfigs } = await setupTree(t);
      const stream = await events(await post(url, mode));
      const pids = processTree(stream);
      assert.equal(pids.wrapper, children[0].pid);
      assert.equal(spawnConfigs[0].detached, true);
      assert.deepEqual(spawnConfigs[0].stdio, ["pipe", "pipe", "pipe", "ipc"]);
      assert.equal(
        terminal === "done" ? stream.at(-1).type : stream.at(-1).code,
        terminal,
      );
      assert.equal(
        stream.filter((event) => event.type === "error").length,
        terminal === "done" ? 0 : 1,
        "normal process-group cleanup is not a reply failure",
      );
      await waitFor(() =>
        [pids.wrapper, pids.pid, pids.grandchild].every(
          (pid) => !processExists(pid),
        ),
      );
      assert.equal(
        (await events(await post(url))).at(-1).type,
        "done",
        "slot is reusable after completion/crash",
      );
    },
  );
}

test(
  "cancellation escalates for an uncooperative owned group and leaves no descendants",
  { skip: process.platform === "win32" },
  async (t) => {
    const { url, children } = await setupTree(t);
    const abort = new AbortController();
    const response = await post(url, "tree-hold", { signal: abort.signal });
    const reader = response.body.getReader();
    let data = "";
    while (!data.includes("\n"))
      data += new TextDecoder().decode((await reader.read()).value);
    const pids = processTree(data.trim().split("\n").map(JSON.parse));
    assert.ok(processExists(pids.pid) && processExists(pids.grandchild));
    abort.abort();
    await reader.cancel().catch(() => {});
    await waitFor(() =>
      [pids.wrapper, pids.pid, pids.grandchild].every(
        (pid) => !processExists(pid),
      ),
    );
    assert.equal(children[0].signalCode, "SIGKILL");
    assert.equal((await events(await post(url))).at(-1).type, "done");
  },
);

test(
  "shutdown waits for owned process-group cleanup before reporting completion",
  { skip: process.platform === "win32" },
  async (t) => {
    const { url, backend } = await setupTree(t);
    const response = await post(url, "tree-hold");
    const reader = response.body.getReader();
    let data = "";
    while (!data.includes("\n"))
      data += new TextDecoder().decode((await reader.read()).value);
    const pids = processTree(data.trim().split("\n").map(JSON.parse));
    const remaining = (async () => {
      let tail = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        tail += new TextDecoder().decode(value);
      }
      return tail.trim().split("\n").filter(Boolean).map(JSON.parse);
    })();
    await backend.shutdown();
    assert.equal((await remaining).at(-1).code, "shutdown");
    await waitFor(() =>
      [pids.wrapper, pids.pid, pids.grandchild].every(
        (pid) => !processExists(pid),
      ),
    );
    assert.equal((await post(url)).status, 503);
  },
);

test("all supported writing systems survive byte-split streamed replies", async (t) => {
  const multilingual =
    "English 简体中文 繁體中文 日本語 한국어 Español Français Deutsch Português Italiano Русский العربية हिन्दी 🎹";
  const { url } = await setup(t, {
    fixtureSource: fixture.replace(
      "'先慢练，再连起来。🎹'",
      JSON.stringify(multilingual),
    ),
  });
  assert.deepEqual(await events(await post(url, "unicode")), [
    { type: "text", text: multilingual },
    { type: "done" },
  ]);
});

test("configured helper arguments and environment are passed without shell interpretation", async (t) => {
  const helperArgs = [
    "--engine",
    "/tmp/Luma fixture model with spaces",
    "literal-$(not-a-command)",
  ];
  const helperEnv = {
    PATH: "/usr/bin:/bin",
    LUMA_MODEL_FIXTURE: "one literal value",
  };
  const { url, calls, spawnConfigs } = await setup(t, {
    helperArgs,
    helperEnv,
  });
  assert.equal((await events(await post(url))).at(-1).type, "done");
  assert.deepEqual(calls[0], helperArgs);
  assert.deepEqual(spawnConfigs[0].env, helperEnv);
  assert.notEqual(spawnConfigs[0].shell, true);
  assert.deepEqual(spawnConfigs[0].stdio, ["pipe", "pipe", "pipe"]);
  const probe = await (await fetch(`${url}/model`)).json();
  assert.equal(probe.available, true);
  assert.deepEqual(calls[1], [...helperArgs, "--availability"]);
});

test("incomplete local bundles keep the fixed helperMissing availability reason", async (t) => {
  const { url } = await setup(t, {
    modelName: "Qwen3 4B",
    fixtureSource: fixture.replace(
      "{available:true,reason:'available'}",
      "{available:false,reason:'helperMissing',model:'SECRET provider string'}",
    ),
  });
  assert.deepEqual(await (await fetch(`${url}/model`)).json(), {
    available: false,
    reason: "helperMissing",
  });
});

test(
  "IPC loss exits the owned wrapper and reaps its descendants without hanging close",
  { skip: process.platform === "win32" },
  async (t) => {
    const { url, children } = await setupTree(t);
    const response = await post(url, "tree-hold");
    const reader = response.body.getReader();
    let data = "";
    while (!data.includes("\n"))
      data += new TextDecoder().decode((await reader.read()).value);
    const pids = processTree(data.trim().split("\n").map(JSON.parse));
    const remaining = (async () => {
      let tail = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        tail += new TextDecoder().decode(value);
      }
      return tail.trim().split("\n").filter(Boolean).map(JSON.parse);
    })();
    children[0].disconnect();
    let deadline;
    const terminal = await Promise.race([
      remaining,
      new Promise((_, reject) => {
        deadline = setTimeout(() => {
          reject(
            Error(
              "IPC-disconnected helper exit did not settle the HTTP request",
            ),
          );
          // Let cleanup finish even when running this regression against the old
          // close-only implementation. The failed assertion remains a failure.
          const child = children[0];
          if (child.exitCode !== null || child.signalCode !== null)
            child.emit("close", child.exitCode, child.signalCode);
        }, 1200);
      }),
    ]).finally(() => clearTimeout(deadline));
    assert.equal(terminal.at(-1).code, "generationFailed");
    assert.equal(children[0].exitCode, 9);
    await waitFor(() =>
      [pids.wrapper, pids.pid, pids.grandchild].every(
        (pid) => !processExists(pid),
      ),
    );
    assert.equal((await events(await post(url))).at(-1).type, "done");
  },
);

test("reply limits from the prompt builder reach the local runtime; unknown limit keys never launch", async (t) => {
  let reply = { language: "zh", maxTokens: 180, softChars: 90, hardChars: 150, noCode: true, names: ["晴天"], first: true, brief: true };
  const { url, calls } = await setup(t, {
    buildPrompt: () => ({ instructions: "trusted", prompt: "echo", history: [], reply }),
  });
  const stream = await events(await post(url));
  assert.deepEqual(JSON.parse(stream[0].text), { instructions: "trusted", prompt: "echo", history: [], reply });
  const before = calls.length;
  for (reply of [{ language: "zh", tools: ["exec"] }, "zh", ["zh"], { names: ["x".repeat(9000)] }])
    assert.equal((await post(url)).status, 400, JSON.stringify(reply).slice(0, 40));
  assert.equal(calls.length, before, "an invalid reply option does not reserve or launch the model");
});

test("the repetition guard keeps the first occurrence without a dangling list number", () => {
  const item = "Play the right hand slowly and count every beat aloud.";
  assert.equal(repeatedReplyPrefix(`1. ${item}\n2. ${item}\n3. ${item}\n4. ${item}`), `1. ${item}`);
});
