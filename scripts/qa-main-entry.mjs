import { spawn } from "node:child_process";

// Packaged Electron does not accept --require preloads. Pause at the first
// main-module statement so a QA hook is installed before startup can show a
// synchronous native dialog. The executable and its ASAR remain untouched.
export async function launchAtMainEntry(executablePath, env, hook) {
  const child = spawn(
    executablePath,
    ["--inspect-brk=0", "--remote-debugging-port=0", "--mute-audio"],
    { env, stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "",
    socket,
    exited = false,
    launchError;
  child.once("error", (error) => {
    launchError = error;
  });
  const exit = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      exited = true;
      resolve({ code, signal });
    });
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-65536);
    if (stderr.includes("Waiting for the debugger to disconnect"))
      socket?.close();
  });
  const endpoint = async (label) => {
    const until = Date.now() + 60000;
    while (Date.now() < until) {
      if (launchError) throw launchError;
      const line = stderr
        .split("\n")
        .find((line) => line.startsWith(`${label} listening on `));
      const match = line?.match(/listening on (ws:\/\/\S+)/);
      if (match) return match[1];
      if (exited) throw Error(`App exited before ${label}: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error(`No ${label} endpoint within 60s: ${stderr}`);
  };
  try {
    socket = new WebSocket(await endpoint("Debugger"));
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let nextId = 0;
    const pending = new Map(),
      listeners = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      } else listeners.get(message.method)?.(message.params);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error(`Main inspector timed out: ${method}`));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const paused = new Promise((resolve) =>
      listeners.set("Debugger.paused", resolve),
    );
    await send("Debugger.enable");
    await send("Runtime.runIfWaitingForDebugger");
    const { callFrames } = await Promise.race([
      paused,
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(Error("App did not pause at main entry")),
          15000,
        );
        timer.unref();
      }),
    ]);
    const installed = await send("Debugger.evaluateOnCallFrame", {
      callFrameId: callFrames[0].callFrameId,
      expression: hook,
      returnByValue: true,
    });
    if (installed.exceptionDetails)
      throw Error(
        `Main-entry hook failed: ${JSON.stringify(installed.exceptionDetails)}`,
      );
    await send("Debugger.resume");
    return {
      child,
      exit,
      endpoint: () => endpoint("DevTools"),
      stderr: () => stderr,
      close: async () => {
        if (!exited) {
          await send("Runtime.evaluate", {
            expression: "require('electron').app.quit()",
            includeCommandLineAPI: true,
          }).catch(() => {});
        }
        socket.close();
        const done = await Promise.race([
          exit,
          new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 5000);
            timer.unref();
          }),
        ]);
        if (!done) child.kill("SIGKILL");
        await exit;
      },
    };
  } catch (error) {
    socket?.close();
    child.kill("SIGKILL");
    throw error;
  }
}
