import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { chromium } from "@playwright/test";
import { installLocalOnlyRoutes } from "../scripts/qa-browser-network.mjs";

test(
  "browser policy blocks external HTTP, redirects and WebSockets before transmission",
  { timeout: 30000 },
  async (t) => {
    let externalHits = 0;
    const external = http.createServer((_, res) => {
      externalHits++;
      res.end("external");
    });
    external.on("upgrade", (_, socket) => {
      externalHits++;
      socket.destroy();
    });
    external.listen(0, "127.0.0.1");
    await once(external, "listening");
    const outside = `http://127.0.0.1:${external.address().port}`;
    const local = http.createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: outside });
        res.end();
      } else if (req.url === "/local-redirect") {
        res.writeHead(302, { Location: "/" });
        res.end();
      } else res.end("<html><body>owned</body></html>");
    });
    local.listen(0, "127.0.0.1");
    await once(local, "listening");
    t.after(async () => {
      for (const server of [local, external]) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    });
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const context = await browser.newContext();
    const origin = `http://127.0.0.1:${local.address().port}`;
    const policy = await installLocalOnlyRoutes(context, origin);
    const page = await context.newPage();
    await page.goto(origin);
    assert.match(await page.textContent("body"), /owned/);
    for (const url of [
      outside,
      origin + "/redirect",
      origin + "/local-redirect",
    ]) {
      const blocked = await context.newPage();
      await assert.rejects(blocked.goto(url));
      await blocked.close();
    }
    await page.evaluate(
      (url) =>
        new Promise((resolve) => {
          const socket = new WebSocket(url);
          socket.onclose = socket.onerror = () => resolve();
        }),
      outside.replace("http:", "ws:"),
    );
    assert.equal(externalHits, 0);
    assert.deepEqual(policy, {
      externalRequests: 2,
      blockedRedirects: 2,
      blockedWebSockets: 1,
    });
  },
);
