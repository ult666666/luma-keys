import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ENDPOINT = "/__luma_build.json";
const WIRING = [
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "scripts/dev-build-identity.mjs",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const portable = (value) => value.split(path.sep).join("/");

async function filesWithin(root, directory) {
  let entries;
  try {
    entries = await readdir(path.join(root, directory), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const name = portable(path.join(directory, entry.name));
    if (entry.isDirectory()) return filesWithin(root, name);
    // Do not follow links outside the checkout or inspect user libraries.
    return entry.isFile() ? [name] : [];
  }));
  return nested.flat();
}

/** Content identity uses source bytes, not Git HEAD or timestamps. */
export async function createBuildIdentity(directory = process.cwd()) {
  const root = await realpath(directory);
  const [sourcePaths, assetPaths] = await Promise.all([
    filesWithin(root, "src"),
    filesWithin(root, "public/models/hands"),
  ]);
  const paths = [...new Set([...sourcePaths, ...assetPaths, ...WIRING])].sort();
  const files = (await Promise.all(paths.map(async (name) => {
    let bytes;
    try {
      bytes = await readFile(path.join(root, name));
    } catch (error) {
      if (error.code === "ENOENT" && WIRING.includes(name)) return null;
      throw error;
    }
    return {
      path: name,
      kind: name.startsWith("public/models/hands/") ? "asset" : "source",
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  }))).filter(Boolean);
  const groupHash = (kind) => sha256(JSON.stringify(files.filter((file) => file.kind === kind)));
  const sourceSha256 = groupHash("source");
  const assetsSha256 = groupHash("asset");
  const id = sha256(JSON.stringify({ schemaVersion: 1, sourceSha256, assetsSha256 }));
  return {
    schemaVersion: 1,
    id,
    shortId: id.slice(0, 12),
    sourceSha256,
    assetsSha256,
    device: { id: sha256(hostname()) },
    checkout: { name: path.basename(root), id: sha256(root) },
    files,
  };
}

function identityScript(identity) {
  // Escape HTML delimiters even though the manifest normally contains only paths/hashes.
  const json = JSON.stringify(identity).replace(/</g, "\\u003c");
  return `(() => {
    const build = ${json};
    window.lumaBuild = Object.freeze(build);
    const badge = document.createElement("div");
    badge.id = "luma-dev-build";
    badge.dataset.buildId = build.id;
    badge.textContent = "DEV · d" + build.device.id.slice(0, 6) + " · c" + build.checkout.id.slice(0, 6) + " · " + build.shortId;
    badge.setAttribute("aria-label", "Development build " + build.shortId);
    badge.style.cssText = "position:fixed;right:6px;bottom:5px;z-index:2147483647;padding:3px 6px;border:1px solid #ffffff26;border-radius:4px;background:#121417e8;color:#e6e7e9;font:9px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;pointer-events:none;user-select:none;";
    document.body.appendChild(badge);
    document.title += " [dev " + build.shortId + "]";
  })();`;
}

/** Vite applies this plugin only to development; packaged builds have no badge/API. */
export function devBuildIdentity() {
  let root;
  let server;
  let reloadTimer;
  const tracked = (filename) => {
    const relative = portable(path.relative(root, filename));
    return relative.startsWith("src/") || relative.startsWith("public/models/hands/") || WIRING.includes(relative);
  };
  const reload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => server.ws.send({ type: "full-reload", path: "*" }), 100);
  };
  return {
    name: "luma-dev-build-identity",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    configureServer(viteServer) {
      server = viteServer;
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?")[0] !== ENDPOINT) return next();
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        try {
          response.end(JSON.stringify(await createBuildIdentity(root)));
        } catch (error) {
          response.statusCode = 500;
          response.end(JSON.stringify({ error: "Development build identity unavailable" }));
          server.config.logger.error(`[luma-dev-build] ${error.message}`);
        }
      });
      const onTreeChange = (filename) => { if (tracked(filename)) reload(); };
      server.watcher.on("add", onTreeChange).on("unlink", onTreeChange);
      server.httpServer?.once("close", () => {
        clearTimeout(reloadTimer);
        server.watcher.off("add", onTreeChange).off("unlink", onTreeChange);
      });
    },
    handleHotUpdate(context) {
      if (!tracked(context.file)) return;
      // A full reload replaces cached hand meshes as well as source/CSS; do not
      // relabel a live renderer whose old model/worker data is still in memory.
      reload();
      return [];
    },
    async transformIndexHtml() {
      return [{
        tag: "script",
        attrs: { "data-luma-dev-build": "true" },
        children: identityScript(await createBuildIdentity(root)),
        injectTo: "body",
      }];
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const identity = await createBuildIdentity();
  // Explicit local-only evidence can include routing details. They are never
  // included in the browser's badge, window object or development endpoint.
  if (process.argv.includes("--local")) identity.local = { hostname: hostname(), checkout: await realpath(process.cwd()) };
  process.stdout.write(`${JSON.stringify(identity, null, 2)}\n`);
}
