import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";

/** Per-turn NDJSON streams over one owned IPC worker. The route retains its
 * validation, single-request lock and disconnect semantics; the worker owns
 * the model process across replies and notices if its parent disappears. */
export function createCompanionSession({ runtimePath, engineDir, spawnProcess = spawn, killGraceMs = 1500 } = {}) {
  let worker, closing = false, nextId = 0, closed, resolveClosed;
  const jobs = new Map();
  function finish(job, error = false) {
    if (job.finished) return;
    job.finished = true; clearTimeout(job.cancelTimer); jobs.delete(job.id);
    if (error) job.child.stdout.write(JSON.stringify({ type: "error", code: "generationFailed" }) + "\n");
    job.child.stdout.end(); job.child.stderr.end();
    job.child.emit("exit", error ? 1 : 0, null);
    job.child.emit("close", error ? 1 : 0, null);
    job.resolve({ code: error ? 1 : 0, signal: null });
  }
  function start() {
    if (closing) throw Error("Conversation is closing");
    if (worker) return worker;
    closed = new Promise(resolve => { resolveClosed = resolve; });
    const child = spawnProcess(process.execPath, [runtimePath, "--engine", engineDir, "--session"], {
      detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { PATH: "/usr/bin:/bin", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8", ELECTRON_RUN_AS_NODE: "1", ...(process.env.LUMA_COMPANION_TIMINGS ? { LUMA_COMPANION_TIMINGS: process.env.LUMA_COMPANION_TIMINGS } : {}) },
    });
    worker = child;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      // Reap owned descendants even after an unexpected worker crash.
      if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
      for (const job of jobs.values()) finish(job, true);
      if (worker === child) worker = null;
      resolveClosed();
    };
    child.once("error", settle); child.once("exit", settle);
    child.on("message", packet => {
      const job = jobs.get(packet?.id);
      if (!job || job.finished) return;
      if (packet.closed === true) finish(job);
      else if (packet.event) job.child.stdout.write(JSON.stringify(packet.event) + "\n");
    });
    return child;
  }
  function send(packet, job) {
    try { start().send(packet, error => { if (error && job) finish(job, true); }); }
    catch { if (job) finish(job, true); }
  }
  return {
    warm() { if (!closing) send({ type: "warm" }); },
    launch() {
      if (closing) throw Error("Conversation is closing");
      const child = new EventEmitter(), id = ++nextId, buffers = [];
      let size = 0;
      const job = { id, child, sent: false, finished: false };
      const taskClosed = new Promise(resolve => { job.resolve = resolve; });
      child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.stdin = new Writable({
        write(bytes, _encoding, done) {
          size += bytes.length;
          if (size > 100 * 1024) { finish(job, true); done(); return; }
          buffers.push(bytes); done();
        },
        final(done) {
          if (!job.finished) {
            try {
              const value = JSON.parse(Buffer.concat(buffers).toString("utf8"));
              job.sent = true; send({ type: "generate", id, value }, job);
            } catch { finish(job, true); }
          }
          done();
        },
      });
      jobs.set(id, job);
      const stop = () => {
        if (job.finished) return;
        if (!job.sent) finish(job);
        else if (!job.cancelTimer) {
          const owner = worker;
          job.cancelTimer = setTimeout(() => {
            if (owner?.pid) { try { process.kill(-owner.pid, "SIGKILL"); } catch {} }
          }, killGraceMs);
          send({ type: "cancel", id }, job);
        }
      };
      child.kill = stop;
      return { child, stop, closed: taskClosed };
    },
    async shutdown() {
      closing = true;
      if (!worker) return;
      const child = worker, wait = closed;
      try { child.send({ type: "shutdown" }, () => {}); } catch {}
      const timer = setTimeout(() => {
        if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
      }, killGraceMs);
      await wait; clearTimeout(timer);
    },
  };
}
