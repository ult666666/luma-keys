const { app, BrowserWindow, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { libraryProblem } = require("./library-access.cjs");
// When this process started, for the startup timings in /api/health.
const launchedAt = Date.now() - Math.round(process.uptime() * 1000);
// Tests get their own library, exports, preferences and Electron instance lock.
// Normal desktop launches keep using the user's Desktop library.
const qaRoot = process.env.LUMA_QA_ROOT;
if (qaRoot) {
  if (!path.isAbsolute(qaRoot))
    throw Error("LUMA_QA_ROOT must be an absolute path.");
  const userData = path.join(qaRoot, "Electron");
  fs.mkdirSync(userData, { recursive: true });
  app.setPath("userData", userData);
}
let win, server, shutdownRecognition;
let permitQuit = false;
let pendingQuit;
function quitAfterSaving() {
  if (pendingQuit) return;
  pendingQuit = (async () => {
    let timer;
    try {
      if (win && !win.isDestroyed()) {
        await Promise.race([
          win.webContents.executeJavaScript("window.lumaFlushPreferences?.()"),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("Saving took too long.")),
              5000,
            );
          }),
        ]);
      }
    } catch {
      const { response } = await dialog.showMessageBox(win, {
        type: "warning",
        message:
          "Your latest settings or practice progress could not be saved.",
        detail:
          "Keep Luma Keys open to try again, or close without these changes.",
        buttons: ["Keep open", "Close without saving"],
        defaultId: 0,
        cancelId: 0,
      });
      if (response !== 1) return;
    } finally {
      clearTimeout(timer);
    }
    let shutdownTimer;
    try {
      await Promise.race([
        shutdownRecognition?.(),
        new Promise((resolve) => {
          shutdownTimer = setTimeout(resolve, 10000);
        }),
      ]);
    } finally {
      clearTimeout(shutdownTimer);
    }
    // If shutdown was stalled, closing the IPC channel also stops its runner.

    permitQuit = true;
    app.quit();
  })().finally(() => {
    pendingQuit = null;
  });
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(async () => {
    try {
      // Old history GET responses may be in this app's HTTP cache. Purge it
      // once when moving to temporary chat, preserving browser preferences.
      // The marker contains only a migration version, never conversation text.
      const chatMigration = path.join(
        app.getPath("userData"),
        "temporary-chat-v1.json",
      );
      if (!fs.existsSync(chatMigration)) {
        await session.defaultSession.clearCache();
        await fs.promises.writeFile(chatMigration, '{"version":1}\n', {
          mode: 0o600,
        });
      }
      const { startServer } = await import("./server.mjs");
      const dataDir = qaRoot
        ? path.join(qaRoot, "Library")
        : path.join(app.getPath("desktop"), "Luma Keys", "Library");
      const engine = app.isPackaged
        ? path.join(
            process.resourcesPath,
            "Audiveris.app/Contents/MacOS/Audiveris",
          )
        : path.join(
            __dirname,
            "engines/Audiveris.app/Contents/MacOS/Audiveris",
          );
      const tessdata = app.isPackaged
        ? path.join(process.resourcesPath, "tessdata")
        : path.join(__dirname, "engines/tessdata");
      const companionHelper = app.isPackaged
        ? path.join(process.resourcesPath, "companion-model")
        : path.join(__dirname, "engines/companion-model");
      const serverOptions = {
        port: 0,
        dataDir,
        engine,
        tessdata,
        launchedAt,
        companionHelper,
        companionEngineDir: app.isPackaged
          ? path.join(process.resourcesPath, "companion-llm")
          : path.join(__dirname, "engines/companion-llm"),
        companionRuntime: app.isPackaged
          ? path.join(process.resourcesPath, "companion-local-runtime.mjs")
          : path.join(__dirname, "src/companion-local-runtime.mjs"),
      };
      // A Library folder that cannot be opened (macOS privacy, a file in
      // its place, a read-only disk) gets a plain explanation and Try Again.
      let result;
      for (;;) {
        try {
          result = await startServer(serverOptions);
          break;
        } catch (e) {
          if (e?.name !== "LibraryUnavailableError") throw e;
          const choice = dialog.showMessageBoxSync({
            type: "warning",
            buttons: ["Try Again", "Quit"],
            defaultId: 0,
            cancelId: 1,
            message: "Luma Keys can’t open its Library folder",
            detail: libraryProblem(e),
          });
          if (choice !== 0) {
            permitQuit = true;
            app.quit();
            return;
          }
        }
      }
      server = result.server;
      shutdownRecognition = result.shutdown;
      const origin = "http://127.0.0.1:" + result.port;
      const microphonePermissions = require("./microphone-permission.cjs");
      session.defaultSession.setPermissionRequestHandler(
        (wc, permission, cb, details) =>
          cb(
            microphonePermissions.allowRequest(wc, permission, origin, details),
          ),
      );
      session.defaultSession.setPermissionCheckHandler(
        (wc, p, requestOrigin, details) =>
          microphonePermissions.allowCheck(
            wc,
            p,
            requestOrigin,
            origin,
            details,
          ),
      );
      win = new BrowserWindow({
        width: 1480,
        height: 980,
        minWidth: 1050,
        minHeight: 720,
        title: "Luma Keys",
        backgroundColor: "#17191c",
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 18, y: 16 },
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e, url) => {
        if (!url.startsWith(origin + "/")) e.preventDefault();
      });
      await win.loadURL(origin);
      result.markStartup("windowLoaded");
      // A crashed or hung page is logged and brought back (a few times, so
      // a crash loop cannot spin); the music files are untouched either way.
      let pageReloads = 0;
      win.webContents.on("render-process-gone", (_event, details) => {
        result.log.record("renderer-gone", {
          reason: details.reason,
          exitCode: details.exitCode,
          reloads: pageReloads,
        });
        if (
          details.reason !== "clean-exit" &&
          pageReloads++ < 3 &&
          win &&
          !win.isDestroyed()
        )
          win.webContents.reload();
      });
      win.webContents.on("unresponsive", () =>
        result.log.record("renderer-unresponsive"),
      );
      win.webContents.on("responsive", () =>
        result.log.record("renderer-responsive"),
      );
      process.on("uncaughtException", (error) => {
        result.log.record("main-uncaught", {
          message: String(error?.message || error).slice(0, 300),
        });
        dialog.showErrorBox(
          "Luma Keys hit a problem",
          error?.stack || String(error),
        );
      });
      process.on("unhandledRejection", (reason) =>
        result.log.record("main-rejection", {
          message: String(reason?.message || reason).slice(0, 300),
        }),
      );
      win.on("close", (event) => {
        if (!permitQuit) {
          event.preventDefault();
          quitAfterSaving();
        }
      });
      win.on("closed", () => {
        win = null;
      });
    } catch (e) {
      dialog.showErrorBox("Luma Keys could not open", e.stack || e.message);
      app.quit();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (!permitQuit && win && !win.isDestroyed()) {
      event.preventDefault();
      quitAfterSaving();
    }
  });
  app.on("will-quit", () => server?.close());
}
