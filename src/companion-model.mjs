import { spawn } from "node:child_process";
import { TextDecoder } from "node:util";
import express from "express";
import { isConversationLanguage } from "./companion-language.mjs";

export const MAX_COMPANION_CHAT_BYTES = 100 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_LENGTH = 4000;
const REASONS = new Set([
  "available",
  "macOS26Required",
  "deviceNotEligible",
  "appleIntelligenceNotEnabled",
  "modelNotReady",
  "helperMissing",
  "unavailable",
]);
const ERRORS = {
  invalidRequest:
    "The conversation request is invalid. Please try a shorter message.",
  tooLarge:
    "The conversation request is too large. Please ask a shorter question.",
  modelBusy:
    "A reply is already being generated. Stop it or wait for it to finish.",
  macOS26Required: "On-device conversation requires macOS 26 or later.",
  deviceNotEligible: "This Mac does not support the on-device model.",
  appleIntelligenceNotEnabled:
    "Turn on Apple Intelligence in System Settings to use on-device conversation.",
  modelNotReady:
    "The on-device model is not ready. Check Apple Intelligence in System Settings.",
  helperMissing:
    "The on-device conversation helper is missing. Reinstall or rebuild the app.",
  unavailable: "The on-device model is unavailable. Please try again later.",
  contextTooLong:
    "This request is too long for the on-device model. Please ask a shorter question.",
  responseTooLong: "The reply ran too long and was stopped. Please try again.",
  repetitiveResponse: "The reply started repeating itself and was stopped. Please try again.",
  refused:
    "The on-device model could not answer that request. Try rephrasing it.",
  unsupportedLanguage:
    "The on-device model does not support that language yet.",
  emptyResponse: "No reply came through. Please try again.",
  generationFailed: "The reply was interrupted. Please try again.",
  timeout: "The on-device model took too long. Please try again.",
  cancelled: "Reply stopped.",
  shutdown: "The app is closing. Please try again after reopening it.",
};
// Repeated complete sentences/lines are an observable generation failure,
// not a successful reply. Preserve the first occurrence and stop the child;
// never replace model prose with a fabricated answer or executable action.
export function repeatedReplyPrefix(value) {
  if (typeof value !== "string" || value.length < 80) return null;
  const seen = new Map();
  for (const match of value.matchAll(/[^\n.!?。！？]+[\n.!?。！？]+/gu)) {
    const key = match[0].replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/[\s\p{P}]+/gu, "").toLowerCase();
    if (key.length < 12) continue;
    const found = seen.get(key);
    if (found) {
      found.count++;
      if (found.count === 2) found.repeatStart = match.index;
      // Keep the first occurrence; drop a list number left dangling after it.
      if (found.count >= 3)
        return value
          .slice(0, found.repeatStart)
          .replace(/(?:^|\n)[ \t]*(?:[-*•]|\d{1,2}[.)])[ \t]*$/u, "")
          .trim();
    } else seen.set(key, { count: 1, repeatStart: null });
  }
  return null;
}

const errorEvent = (value) => {
  const code =
    typeof value === "string" && Object.hasOwn(ERRORS, value)
      ? value
      : "generationFailed";
  return { type: "error", code, message: ERRORS[code] };
};
const plainObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);
const errorResponse = (res, status, code) => {
  const event = errorEvent(code);
  if (!res.destroyed && !res.writableEnded)
    res.status(status).json({ error: event.message, code: event.code });
};

/** Register after the server's origin guard and BEFORE any larger JSON parser.
 * All messages stay in this process and the local, tool-free native helper.
 * Timing options and spawnProcess are dependency injection for lifecycle tests.
 */
export function registerCompanionModelRoutes(
  app,
  {
    helperPath,
    helperArgs = [],
    helperEnv,
    ownedProcessGroup = false,
    modelName = "Apple on-device model",
    buildPrompt,
    spawnProcess = spawn,
    timeoutMs = 90_000,
    availabilityTimeoutMs = 8_000,
    availabilityTtlMs = 5_000,
    killGraceMs = 500,
    session,
  } = {},
) {
  if (
    typeof helperPath !== "string" ||
    !helperPath ||
    typeof buildPrompt !== "function"
  )
    throw Error("The companion helper path and prompt builder are required.");
  let active = null,
    closing = false,
    statusCache = null,
    statusPromise = null;
  const children = new Set();

  function launch(args) {
    const child = spawnProcess(helperPath, [...helperArgs, ...args], {
      stdio: ownedProcessGroup ? ["pipe", "pipe", "pipe", "ipc"] : ["pipe", "pipe", "pipe"],
      windowsHide: true,
      ...(helperEnv ? { env: helperEnv } : {}),
      ...(ownedProcessGroup ? { detached: true } : {}),
    });
    let exited = false,
      killTimer = null;
    let exitResult = null;
    let resolveClosed;
    const closed = new Promise((resolve) => {
      resolveClosed = resolve;
    });
    const processState = {
      child,
      closed,
      stop() {
        if (exited) return;
        child.kill("SIGTERM");
        if (!killTimer)
          killTimer = setTimeout(() => {
            if (!exited) {
              if (ownedProcessGroup && child.pid) {
                try { process.kill(-child.pid, "SIGKILL"); } catch {}
              } else child.kill("SIGKILL");
            }
          }, killGraceMs);
      },
    };
    children.add(processState);
    // stderr may include platform diagnostics. Never log, expose, or retain it.
    child.stderr?.on("data", () => {});
    child.stdin?.on("error", () => {});
    const killDescendants = () => {
      if (ownedProcessGroup && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
    };
    const settle = (result) => {
      if (exited) return;
      exited = true;
      clearTimeout(killTimer);
      children.delete(processState);
      resolveClosed(result);
    };
    const drained = (stream) => !stream || stream.readableEnded || stream.destroyed;
    const settleDrainedExit = () => {
      if (exitResult && drained(child.stdout) && drained(child.stderr)) settle(exitResult);
    };
    // Node's IPC disconnect can leave its `close` counter pending after process
    // exit. Use exit plus both drained output pipes, so final UTF-8/NDJSON is
    // still consumed before releasing the request slot.
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on("end", settleDrainedExit);
      stream?.on("close", settleDrainedExit);
    }
    child.on("exit", (code, signal) => {
      exitResult = { code, signal };
      killDescendants();
      settleDrainedExit();
    });
    child.on("close", (code, signal) => {
      killDescendants();
      settle({ code, signal });
    });
    return processState;
  }

  async function probe() {
    if (closing) return { available: false, reason: "shutdown" };
    if (statusCache && Date.now() - statusCache.at < availabilityTtlMs)
      return statusCache.value;
    if (statusPromise) return statusPromise;
    statusPromise = (async () => {
      let task,
        output = "",
        failure = null;
      try {
        task = launch(["--availability"]);
      } catch {
        return { available: false, reason: "helperMissing" };
      }
      const timer = setTimeout(() => {
        failure = "timeout";
        task.stop();
      }, availabilityTimeoutMs);
      task.child.stdout.setEncoding("utf8");
      task.child.stdout.on("data", (chunk) => {
        if (failure) return;
        output += chunk;
        if (output.length > 4096) {
          failure = "unavailable";
          task.stop();
        }
      });
      task.child.on("error", (error) => {
        failure =
          error.code === "ENOENT" || error.code === "EACCES"
            ? "helperMissing"
            : "unavailable";
      });
      task.child.stdin.end();
      const exit = await task.closed;
      clearTimeout(timer);
      if (closing) return { available: false, reason: "shutdown" };
      if (failure || exit.code !== 0)
        return { available: false, reason: failure || "unavailable" };
      try {
        const value = JSON.parse(output);
        if (
          !plainObject(value) ||
          typeof value.available !== "boolean" ||
          !REASONS.has(value.reason) ||
          value.available !== (value.reason === "available")
        )
          throw Error();
        return { available: value.available, reason: value.reason, ...(value.available ? { model: modelName } : {}) };
      } catch {
        return { available: false, reason: "unavailable" };
      }
    })()
      .then((value) => {
        statusCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        statusPromise = null;
      });
    return statusPromise;
  }
  app.get("/api/companion/model", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await probe());
  });
  app.post("/api/companion/warm", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (closing) return res.status(503).end();
    session?.warm();
    res.status(202).json({ ok: true });
  });

  const parser = express.json({
    limit: MAX_COMPANION_CHAT_BYTES,
    strict: true,
    inflate: false,
  });
  app.post(
    "/api/companion/chat",
    (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      if (!req.is("application/json"))
        return errorResponse(res, 415, "invalidRequest");
      parser(req, res, (error) => {
        if (error)
          return errorResponse(
            res,
            error.type === "entity.too.large" ? 413 : 400,
            error.type === "entity.too.large" ? "tooLarge" : "invalidRequest",
          );
        next();
      });
    },
    async (req, res) => {
      if (req.aborted || res.destroyed) return;
      if (closing) return errorResponse(res, 503, "shutdown");
      if (active) return errorResponse(res, 409, "modelBusy");
      const body = req.body;
      if (
        !plainObject(body) ||
        Object.keys(body).some(
          (key) =>
            !["message", "context", "history", "companionId", "languagePreference"].includes(key),
        ) ||
        (body.languagePreference !== undefined && !isConversationLanguage(body.languagePreference)) ||
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 2000
      )
        return errorResponse(res, 400, "invalidRequest");
      if (Buffer.byteLength(JSON.stringify(body)) > MAX_COMPANION_CHAT_BYTES)
        return errorResponse(res, 413, "tooLarge");
      let resolveFinished;
      const request = {
        task: null,
        disconnected: false,
        finished: new Promise((resolve) => {
          resolveFinished = resolve;
        }),
      };
      active = request; // Reserve before a possibly async builder to prevent races.
      let terminal = null,
        buffer = "",
        bytes = 0,
        latest = "",
        finished = false,
        terminalTimer;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const canWrite = () =>
        !request.disconnected && !res.destroyed && !res.writableEnded;
      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearTimeout(terminalTimer);
        req.off("aborted", disconnected);
        res.off("close", responseClosed);
        if (active === request) active = null;
        if (canWrite()) {
          if (res.headersSent)
            res.end(
              `${JSON.stringify(terminal || errorEvent("generationFailed"))}\n`,
            );
          else
            errorResponse(
              res,
              terminal?.code === "invalidRequest" ? 400 : 503,
              terminal?.code || "generationFailed",
            );
        }
        resolveFinished();
      }
      function abort(code) {
        if (finished) return;
        terminal = errorEvent(code);
        if (request.task) request.task.stop();
        else finish();
      }
      function disconnected() {
        request.disconnected = true;
        abort("cancelled");
      }
      function responseClosed() {
        if (!res.writableEnded) disconnected();
      }
      req.on("aborted", disconnected);
      res.on("close", responseClosed);
      const timer = setTimeout(() => abort("timeout"), timeoutMs);
      request.abort = abort;
      function parseLine(line) {
        if (!line.trim()) return;
        if (terminal) {
          if (terminal.type !== "error") abort("generationFailed");
          return;
        }
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          abort("generationFailed");
          return;
        }
        if (!plainObject(event)) {
          abort("generationFailed");
          return;
        }
        if (
          event.type === "text" &&
          typeof event.text === "string" &&
          event.text.length <= MAX_TEXT_LENGTH &&
          Object.keys(event).every((key) => key === "type" || key === "text")
        ) {
          const repeated = repeatedReplyPrefix(event.text);
          if (repeated !== null) {
            latest = repeated;
            if (canWrite() && latest) res.write(`${JSON.stringify({ type: "text", text: latest })}\n`);
            abort("repetitiveResponse");
            return;
          }
          latest = event.text;
          if (canWrite())
            res.write(`${JSON.stringify({ type: "text", text: latest })}\n`);
        } else if (event.type === "done" && Object.keys(event).length === 1) {
          terminal = latest.trim()
            ? { type: "done" }
            : errorEvent("emptyResponse");
        } else if (event.type === "error") {
          terminal = errorEvent(event.code);
        } else {
          abort(event.type === "text" ? "responseTooLong" : "generationFailed");
        }
        // Publish completion only after this turn releases its inference slot.
        // Native one-shot helpers also finish their OS process at this point.
        if (terminal && !terminalTimer)
          terminalTimer = setTimeout(() => request.task?.stop(), killGraceMs);
      }
      try {
        let prompt;
        try {
          prompt = await buildPrompt(body);
        } catch {
          abort("invalidRequest");
          return;
        }
        if (finished || request.disconnected) return;
        const history = prompt?.history;
        // Optional reply limits for the local runtime (language, length,
        // no-code). Only known keys pass; the runtime validates each value.
        const reply = prompt?.reply;
        const validReply =
          reply === undefined ||
          (plainObject(reply) &&
            Object.keys(reply).every((key) =>
              ["language", "maxTokens", "softChars", "hardChars", "noCode", "names", "first", "brief", "tuplets", "works"].includes(key),
            ) &&
            Buffer.byteLength(JSON.stringify(reply)) <= 8192);
        const validHistory =
          history === undefined ||
          (Array.isArray(history) &&
            history.length <= 12 &&
            history.every(
              (entry) =>
                plainObject(entry) &&
                Object.keys(entry).length === 2 &&
                ["user", "assistant"].includes(entry.role) &&
                typeof entry.text === "string" &&
                entry.text.trim() &&
                entry.text.length <= 1000 &&
                !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(
                  entry.text,
                ),
            ));
        const historyLength =
          validHistory && history
            ? history.reduce((sum, entry) => sum + entry.text.length, 0)
            : 0;
        if (
          !validHistory ||
          !validReply ||
          !plainObject(prompt) ||
          typeof prompt.instructions !== "string" ||
          !prompt.instructions.trim() ||
          typeof prompt.prompt !== "string" ||
          !prompt.prompt.trim() ||
          prompt.instructions.length + prompt.prompt.length + historyLength >
            10_000
        ) {
          abort("invalidRequest");
          return;
        }
        const input = JSON.stringify({
          instructions: prompt.instructions,
          prompt: prompt.prompt,
          ...(history === undefined ? {} : { history }),
          ...(reply === undefined ? {} : { reply }),
        });
        if (Buffer.byteLength(input) > MAX_COMPANION_CHAT_BYTES) {
          abort("invalidRequest");
          return;
        }
        try {
        request.task = session ? session.launch() : launch([]);
        } catch {
          abort("helperMissing");
          return;
        }
        const { child, closed } = request.task;
        child.on("error", (error) => {
          terminal = errorEvent(
            error.code === "ENOENT" || error.code === "EACCES"
              ? "helperMissing"
              : "generationFailed",
          );
        });
        res.status(200).set({
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "X-Accel-Buffering": "no",
        });
        res.flushHeaders();
        child.stdout.on("data", (chunk) => {
          if (finished) return;
          bytes += chunk.length;
          if (bytes > MAX_OUTPUT_BYTES) {
            abort("responseTooLong");
            return;
          }
          try {
            buffer += decoder.decode(chunk, { stream: true });
          } catch {
            abort("generationFailed");
            return;
          }
          if (buffer.length > 65_536) {
            abort("responseTooLong");
            return;
          }
          let index;
          while ((index = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            parseLine(line);
          }
        });
        child.stdin.end(input);
        const exit = await closed;
        try {
          buffer += decoder.decode();
          if (buffer.trim()) parseLine(buffer);
        } catch {
          terminal = errorEvent("generationFailed");
        }
        if (
          !terminal ||
          (terminal.type === "done" && exit.code !== 0 && !exit.signal)
        )
          terminal = errorEvent("generationFailed");
        finish();
      } catch {
        abort("generationFailed");
        if (request.task) {
          await request.task.closed;
          finish();
        }
      }
    },
  );

  return {
    async shutdown() {
      closing = true;
      statusCache = null;
      const pending = active;
      pending?.abort("shutdown");
      for (const task of children) task.stop();
      await Promise.allSettled([...children].map((task) => task.closed));
      if (pending) await pending.finished;
      if (statusPromise) await statusPromise;
      await session?.shutdown();
    },
  };
}
