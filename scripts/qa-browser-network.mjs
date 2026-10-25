// QA accepts only direct owned-origin HTTP responses. Redirects are deliberately
// rejected: Playwright's ordinary route handler does not gate follow-up URLs.
export async function installLocalOnlyRoutes(
  context,
  origin,
  onViolation = () => {},
) {
  const state = {
    externalRequests: 0,
    blockedRedirects: 0,
    blockedWebSockets: 0,
  };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    if (url.origin !== origin) {
      state.externalRequests++;
      onViolation(state);
      return route.abort("blockedbyclient");
    }
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      if (
        response.status() >= 300 &&
        response.status() < 400 &&
        response.headers().location
      ) {
        state.blockedRedirects++;
        onViolation(state);
        return await route.abort("blockedbyclient");
      }
      await route.fulfill({ response });
    } catch {
      // Normal teardown/deadline can close a route while its request is pending.
      await route.abort("failed").catch(() => {});
    }
  });
  await context.routeWebSocket("**/*", (socket) => {
    state.blockedWebSockets++;
    const url = new URL(socket.url());
    const httpOrigin = url.origin
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");
    if (httpOrigin !== origin) state.externalRequests++;
    onViolation(state);
    socket.close({ code: 1008, reason: "WebSockets disabled in isolated QA" });
  });
  return state;
}
