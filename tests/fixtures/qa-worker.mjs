import { parentPort, workerData } from "node:worker_threads";
import http from "node:http";

if (workerData.mode === "error") throw new Error("worker fixture failure");
if (workerData.mode === "empty") process.exit(0);
const server = http.createServer((_, res) => res.end("owned"));
server.listen(0, "127.0.0.1", () => {
  parentPort.postMessage({ type: "port", port: server.address().port });
  if (workerData.mode === "done") {
    server.close(() => {
      parentPort.postMessage({ type: "result", value: { checks: ["done"] } });
      parentPort.close();
    });
  } else if (workerData.mode === "result-hang") {
    parentPort.postMessage({
      type: "result",
      value: { checks: ["premature"] },
    });
  } else if (workerData.mode === "cpu-hang") {
    while (true) {
      // The controller must terminate the thread, not rely on its event loop.
    }
  }
});
