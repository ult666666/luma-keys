import { spawn } from "node:child_process";
import { Worker } from "node:worker_threads";

const cancellation = (signal) =>
  signal?.reason instanceof Error ? signal.reason : new Error("QA cancelled");

// Spawn without a shell. The process group belongs to this command alone, so
// escalation can include esbuild/other children without inspecting user PIDs.
export function runOwnedCommand(
  command,
  args,
  { cwd, signal, onOutput = () => {} } = {},
) {
  if (signal?.aborted) return Promise.reject(cancellation(signal));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let closed = false;
    let escalated = false;
    let tail = "";
    let error;
    let killTimer;
    let stopTimer;
    const kill = (name) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, name);
      } catch (e) {
        if (e.code !== "ESRCH") error ||= e;
      }
    };
    const finish = () => {
      if (!closed || (signal?.aborted && !escalated)) return;
      clearTimeout(killTimer);
      clearTimeout(stopTimer);
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) reject(cancellation(signal));
      else if (error) reject(error);
      else resolve({ output: tail });
    };
    const abort = () => {
      kill("SIGTERM");
      killTimer = setTimeout(() => {
        kill("SIGKILL");
        escalated = true;
        finish();
      }, 250);
      stopTimer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        child.unref();
        child.stdout.destroy();
        child.stderr.destroy();
        reject(new Error("Owned command did not stop after cancellation"));
      }, 5000);
    };
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        tail = (tail + chunk).slice(-131072);
        onOutput(chunk);
      });
    }
    child.once("error", (e) => (error = e));
    child.once("close", (code, exitSignal) => {
      closed = true;
      if (code !== 0)
        error ||= new Error(
          `Command failed (${exitSignal || code}): ${tail.slice(-2000)}`,
        );
      finish();
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

// A result is provisional until the thread exits. Termination also closes the
// thread's loopback listener, even when a story blocks its JavaScript loop.
export function runWorkerTask(
  script,
  workerData,
  { signal, onMessage = () => {}, onOutput = () => {} } = {},
) {
  if (signal?.aborted) return Promise.reject(cancellation(signal));
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, {
      workerData,
      stdout: true,
      stderr: true,
    });
    let result;
    let received = false;
    let error;
    let stopTimer;
    const abort = () => {
      onMessage({ type: "terminated-by-controller" });
      worker.terminate().catch((e) => (error = e));
      stopTimer = setTimeout(() => {
        worker.unref();
        const e = new Error("Worker did not stop after cancellation");
        e.workerStopped = false;
        reject(e);
      }, 5000);
    };
    for (const stream of [worker.stdout, worker.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", onOutput);
    }
    worker.on("message", (message) => {
      if (message?.type === "result") {
        if (received) error ||= new Error("Worker sent duplicate results");
        received = true;
        result = message.value;
      }
      onMessage(message);
    });
    worker.once("error", (e) => (error = e));
    worker.once("exit", (code) => {
      clearTimeout(stopTimer);
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) reject(cancellation(signal));
      else if (error) reject(error);
      else if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
      else if (!received) reject(new Error("Worker exited without a result"));
      else resolve(result);
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
