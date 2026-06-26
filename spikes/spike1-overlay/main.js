// Phase 0 / Spike 1 — overlay core on Fedora 44 / KDE Plasma / Wayland.
//
// Validates the project's riskiest platform assumptions BEFORE any feature work:
//   (a) overlay glues to the PoE2 window through move/resize/fullscreen
//   (b) the transparent div is genuinely see-through, not opaque black
//   (c) clicking the div passes the click through to the game when idle
//   (d) the overlay is a real X11 client (xlsclients lists it)
//   (e) F5 fires via uiohook while the game is focused
//
// Run with PoE2 open. See README.md in this folder for the exact checklist.

const { app, BrowserWindow } = require("electron");

// --- Global constraints (plan §"Global Constraints") -----------------------
// Force X11 BEFORE app.whenReady(). electron-overlay-window is X11-only; the
// game is an XWayland (X11) client under Proton, so the overlay must be X11 too.
// Do NOT use ELECTRON_OZONE_PLATFORM_HINT (removed in Electron 39).
app.commandLine.appendSwitch("ozone-platform", "x11");

// Without this the transparent window renders opaque black on Linux.
if (process.platform !== "darwin") app.disableHardwareAcceleration();

// electron-overlay-window + uiohook-napi are native CJS addons.
const {
  OverlayController,
  OVERLAY_WINDOW_OPTS,
} = require("electron-overlay-window");
const { uIOhook, UiohookKey } = require("uiohook-napi");

// The PoE2 window title to attach to. (xprop _NET_WM_NAME on the game to confirm.)
const GAME_TITLE = process.env.GAME_TITLE || "Path of Exile 2";

let overlay;

function createOverlay() {
  overlay = new BrowserWindow({
    ...OVERLAY_WINDOW_OPTS,
    width: 800,
    height: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  overlay.loadFile("index.html");

  // Attach to the game window; the library tracks move/resize/fullscreen.
  OverlayController.attachByTitle(overlay, GAME_TITLE);

  OverlayController.events.on("attach", (e) => {
    console.log("[overlay] attached:", JSON.stringify(e));
  });
  OverlayController.events.on("detach", () => console.log("[overlay] detached"));
  OverlayController.events.on("blur", () => console.log("[overlay] blur"));
  OverlayController.events.on("focus", () => console.log("[overlay] focus"));

  // --- Global input hook --------------------------------------------------
  // F5 should fire even while the game owns the foreground (X11/XRecord).
  uIOhook.on("keyup", (e) => {
    if (e.keycode === UiohookKey.F5) {
      console.log("[hook] F5 released — (in the real app: start/stop scan)");
    }
  });
  uIOhook.start();
  console.log("[hook] uIOhook started; press F5 with the game focused.");
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  try {
    uIOhook.stop();
  } catch {}
});

app.whenReady().then(() => {
  // The verbatim EE2 Linux quirk: delay overlay construction 1000ms on Linux,
  // else the transparent window can come up opaque black.
  setTimeout(createOverlay, process.platform === "linux" ? 1000 : 0);
});
