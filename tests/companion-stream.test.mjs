import test from "node:test";
import assert from "node:assert/strict";
import { readCompanionStream, requestCompanionReply } from "../src/companion-stream.mjs";
function response(text, size = 7) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += size)
          controller.enqueue(bytes.slice(i, i + size));
        controller.close();
      },
    }),
  );
}
test("waiting for model cleanup can be stopped before another request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = requestCompanionReply({ message: "hello" }, {
    signal: controller.signal,
    fetchImpl: async () => {
      calls++;
      setTimeout(() => controller.abort(), 20);
      return new Response('{"code":"modelBusy"}', { status: 409 });
    },
  });
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls, 1);
});
test("model cleanup retries are bounded and do not hide unrelated HTTP errors", async () => {
  for (const [status, code] of [[409, "invalidRequest"], [503, "unavailable"], [400, "invalidRequest"]]) {
    let calls = 0;
    const result = await requestCompanionReply({}, { fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ code }), { status });
    } });
    assert.equal(result.status, status);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const result = await requestCompanionReply({}, { fetchImpl: async () => {
    calls++;
    return new Response('{"code":"modelBusy"}', { status: 409 });
  } });
  assert.equal(calls, 9);
  assert.equal(result.status, 409);
});
test("model stream preserves split Unicode and cumulative revisions", async () => {
  const seen = [];
  const text = await readCompanionStream(
    response(
      '{"type":"text","text":"先慢慢练🎹"}\n{"type":"text","text":"先慢慢练，再加速。"}\n{"type":"done"}\n',
      1,
    ),
    (t) => seen.push(t),
  );
  assert.deepEqual(seen, ["先慢慢练🎹", "先慢慢练，再加速。"]);
  assert.equal(text, seen[1]);
});
test("model stream rejects early EOF and terminal failure after text", async () => {
  await assert.rejects(
    readCompanionStream(response('{"type":"text","text":"hello"}\n'), () => {}),
    /before the reply finished/,
  );
  await assert.rejects(
    readCompanionStream(
      response(
        '{"type":"text","text":"hello"}\n{"type":"error","message":"Model unavailable"}\n',
      ),
      () => {},
    ),
    /Model unavailable/,
  );
});
test("model stream bounds and validates model output", async () => {
  for (const text of [
    "oops\n",
    '{"type":"done"}\n',
    JSON.stringify({ type: "text", text: "a".repeat(4001) }) + "\n",
    '{"type":"tool","name":"shell"}\n',
  ])
    await assert.rejects(readCompanionStream(response(text), () => {}));
});
test("model stream reports pre-stream failure", async () => {
  await assert.rejects(
    readCompanionStream(
      new Response('{"error":"A reply is already running."}', { status: 409 }),
      () => {},
    ),
    /already running/,
  );
});
