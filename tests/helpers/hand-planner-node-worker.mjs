import { parentPort } from "node:worker_threads";
globalThis.self = { postMessage: (packet) => parentPort.postMessage(packet) };
await import("../../src/hand-planner.worker.mjs");
parentPort.on("message", (data) => self.onmessage({ data }));
