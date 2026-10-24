// Each model event contains the whole response so Unicode and revised tokens
// survive arbitrary network chunk boundaries.
export async function requestCompanionReply(body, { signal, fetchImpl = fetch } = {}) {
  // Stop closes the HTTP stream immediately, while the owned model process may
  // still be releasing its memory. Only retry a rejected, not-yet-started reply.
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const response = await fetchImpl("/api/companion/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (response.status !== 409 || attempt >= 8) return response;
    const error = await response.clone().json().catch(() => null);
    if (error?.code !== "modelBusy") return response;
    await response.body?.cancel().catch(() => {});
    await new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, 250);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
}

export async function readCompanionStream(response, onText) {
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {}
    throw Error(data?.error || "The conversation could not start. Try again.");
  }
  if (!response.body) throw Error("The conversation stream is unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "",
    done = false,
    latest = "";
  function line(value) {
    if (!value.trim()) return;
    if (done) throw Error("The conversation ended unexpectedly. Try again.");
    let event;
    try {
      event = JSON.parse(value);
    } catch {
      throw Error("The conversation was interrupted. Try again.");
    }
    if (event.type === "error")
      throw Error(
        event.message || "The conversation was interrupted. Try again.",
      );
    if (event.type === "done") {
      done = true;
      return;
    }
    if (
      event.type !== "text" ||
      typeof event.text !== "string" ||
      event.text.length > 4000
    )
      throw Error("The response could not be displayed. Try again.");
    latest = event.text;
    onText(latest);
  }
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length > 65536)
        throw Error("The response could not be displayed. Try again.");
      let index;
      while ((index = buffer.indexOf("\n")) !== -1) {
        line(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) line(buffer);
    if (!done)
      throw Error("The connection ended before the reply finished. Try again.");
    if (!latest.trim()) throw Error("No reply came through. Try again.");
    return latest;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
