import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import { runOwnedCommand, runWorkerTask } from "../scripts/qa-lifecycle.mjs";

const fixture = new URL("./fixtures/qa-worker.mjs", import.meta.url);
const options = { timeout: 10000 };
async function unrelated(t) {
  const server = http.createServer((_, res) => res.end("unrelated"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
async function assertClosed(port) {
  await assert.rejects(
    new Promise((resolve, reject) => {
      const socket = net.connect(port, "127.0.0.1");
      socket.setTimeout(1000);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", reject);
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error("socket timed out"));
      });
    }),
    { code: "ECONNREFUSED" },
  );
}

test("owned commands complete and capture stdout/stderr", options, async () => {
  let output = "";
  await runOwnedCommand(
    process.execPath,
    ["-e", "console.log('ok'); console.error('detail')"],
    {
      onOutput: (chunk) => (output += chunk),
    },
  );
  assert.match(output, /ok/);
  assert.match(output, /detail/);
});
test("owned commands reject failure and spawn errors", options, async () => {
  await assert.rejects(
    runOwnedCommand(process.execPath, ["-e", "process.exit(7)"]),
    /7/,
  );
  await assert.rejects(
    runOwnedCommand("/nonexistent/luma-qa-command", []),
    /ENOENT/,
  );
});
test(
  "abort stops a TERM-resistant descendant without touching another listener",
  options,
  async (t) => {
    const other = await unrelated(t);
    const controller = new AbortController();
    t.after(() => controller.abort());
    let port;
    let ready;
    const listening = new Promise((resolve) => (ready = resolve));
    const childSource = `const h=require('node:http'); process.on('SIGTERM',()=>{}); const s=h.createServer((q,r)=>r.end('child')); s.listen(0,'127.0.0.1',()=>console.log(s.address().port));`;
    const parentSource = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{stdio:['ignore','inherit','inherit']}); setInterval(()=>{},1000);`;
    const run = runOwnedCommand(process.execPath, ["-e", parentSource], {
      signal: controller.signal,
      onOutput: (chunk) => {
        if (/^\d+\s*$/.test(chunk)) {
          port = Number(chunk.trim());
          ready();
        }
      },
    });
    const rejected = assert.rejects(run, /cancel|abort|deadline/i);
    await listening;
    assert.equal(
      await (await fetch(`http://127.0.0.1:${port}`)).text(),
      "child",
    );
    controller.abort(new Error("test deadline"));
    await rejected;
    await assertClosed(port);
    assert.equal(await (await fetch(other)).text(), "unrelated");
  },
);
test("already cancelled command never launches", options, async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled before launch"));
  await assert.rejects(
    runOwnedCommand(process.execPath, ["-e", "process.exit(0)"], {
      signal: controller.signal,
    }),
    /cancelled/,
  );
});
// macOS answers EPERM, not ESRCH, while the last members of a process group
// are exiting or waiting to be reaped. The last case answers the first group
// probes that way on every platform.
for (const [code, eperm] of [
  [0, 0],
  [7, 0],
  [0, 3],
]) {
  test(
    `command exit ${code} cleans a detached stdio descendant${eperm ? " while macOS answers EPERM" : ""}`,
    options,
    async (t) => {
      let answers = eperm;
      if (eperm) {
        const kill = process.kill;
        process.kill = (pid, signal) => {
          if (pid < 0 && signal === 0 && answers > 0) {
            answers--;
            throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
          }
          return kill.call(process, pid, signal);
        };
        t.after(() => {
          process.kill = kill;
        });
      }
      const other = await unrelated(t);
      let owned;
      const source = `const s=require('node:http').createServer((q,r)=>r.end('descendant')); process.on('SIGTERM',()=>{}); s.listen(0,'127.0.0.1',()=>process.send({port:s.address().port,pid:process.pid}));`;
      const parent = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(source)}],{stdio:['ignore','ignore','ignore','ipc']});c.once('message',m=>{console.log(JSON.stringify(m));c.disconnect();c.unref();process.exit(${code})});`;
      const run = runOwnedCommand(process.execPath, ["-e", parent], {
        onOutput: (chunk) => {
          owned = JSON.parse(chunk);
        },
      });
      t.after(() => {
        if (owned) {
          try {
            process.kill(owned.pid, "SIGKILL");
          } catch {}
        }
      });
      if (code === 0) await run;
      else await assert.rejects(run, /7/);
      assert.equal(answers, 0);
      await assertClosed(owned.port);
      assert.equal(await (await fetch(other)).text(), "unrelated");
    },
  );
}
test("worker needs a result and normal exit", options, async () => {
  assert.deepEqual(await runWorkerTask(fixture, { mode: "done" }), {
    checks: ["done"],
  });
  await assert.rejects(
    runWorkerTask(fixture, { mode: "error" }),
    /worker fixture failure/,
  );
  await assert.rejects(runWorkerTask(fixture, { mode: "empty" }), /result/i);
});
for (const mode of ["result-hang", "cpu-hang"]) {
  test(
    `deadline terminates ${mode} worker and releases only its socket`,
    options,
    async (t) => {
      const other = await unrelated(t);
      const controller = new AbortController();
      t.after(() => controller.abort());
      let port;
      let ready;
      const listening = new Promise((resolve) => (ready = resolve));
      const run = runWorkerTask(
        fixture,
        { mode },
        {
          signal: controller.signal,
          onMessage: (message) => {
            if (message.type === "port") {
              port = message.port;
              ready();
            }
          },
        },
      );
      const rejected = assert.rejects(run, /deadline/);
      await listening;
      controller.abort(new Error("test deadline"));
      await rejected;
      await assertClosed(port);
      assert.equal(await (await fetch(other)).text(), "unrelated");
    },
  );
}
