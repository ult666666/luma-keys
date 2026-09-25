// Own the native engine in a small process that survives long enough to stop it
// if the desktop process crashes or is force-quit (the IPC channel disconnects).
const { spawn } = require("node:child_process");
const [engine, tessdata, output, input] = process.argv.slice(2);
let child,
  stopping = false,
  finished = false,
  killTimer;
function stop() {
  if (stopping || finished) return;
  stopping = true;
  if (!child) return;
  child.kill("SIGTERM");
  killTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }, 3000);
}
process.on("disconnect", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.stdout.on("error", stop);
process.stderr.on("error", stop);
child = spawn(
  engine,
  ["-batch", "-transcribe", "-export", "-output", output, "--", input],
  {
    env: { ...process.env, TESSDATA_PREFIX: tessdata },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
function finish(code) {
  if (finished) return;
  finished = true;
  clearTimeout(killTimer);
  process.exitCode = Number.isInteger(code) ? code : 1;
  if (process.connected) process.disconnect();
  // Let stdout/stderr drain so final recognition warnings reach the parent.
}
child.once("spawn", () => {
  if (process.connected)
    process.send({ type: "engine-started" }, (error) => {
      if (error) stop();
    });
});
child.on("error", (e) => {
  process.stderr.write("Recognition could not start: " + e.message + "\n");
  if (!child.pid) finish(1);
});
child.on("close", finish);
if (!process.connected) stop();
