const { app, BrowserWindow, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
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
let win, server;
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
      const result = await startServer({ port: 0, dataDir, engine, tessdata });
      server = result.server;
      const origin = "http://127.0.0.1:" + result.port;
      session.defaultSession.setPermissionRequestHandler((wc, permission, cb) =>
        cb(wc.getURL().startsWith(origin + "/") && permission === "midi"),
      );
      session.defaultSession.setPermissionCheckHandler(
        (wc, p, requestOrigin) => requestOrigin === origin && p === "midi",
      );
      win = new BrowserWindow({
        width: 1480,
        height: 980,
        minWidth: 1050,
        minHeight: 720,
        title: "Luma Keys",
        backgroundColor: "#101316",
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
