# Spike 1 — Overlay core on Fedora/KDE

Blocks **M1, M5, M6, M7**. Run with **PoE2 open**.

## Run

```bash
cd spikes/spike1-overlay
npm install
npx @electron/rebuild -f -w electron-overlay-window,uiohook-napi   # match installed electron
npm start
```

If your game window title differs, override it:

```bash
GAME_TITLE="Path of Exile 2" npm start
# confirm the real title first:  xprop _NET_WM_NAME   (then click the game)
```

## STOP — success criteria (all must pass)

Run while PoE2 is open and report each:

- [ ] **(a) Attach & track** — the slate plate glues to the game through
      move / resize / fullscreen / alt-tab.
- [ ] **(b) Transparency** — you can see the game *through* the slate plate; it is
      **not opaque black**. (If black: confirm `disableHardwareAcceleration()` and
      the 1000 ms Linux delay are in effect — both are in `main.js`.)
- [ ] **(c) Click-through** — clicking the plate while idle passes the click to the
      game (you don't interact with the overlay).
- [ ] **(d) X11 client** — `xlsclients | grep -i electron` (or the app name) lists
      the overlay → it really is an X11 client.
- [ ] **(e) Hotkey** — pressing **F5** with the game focused logs
      `[hook] F5 released` in the terminal.

## If it fails

- **Focus sticks under KWin (#1383):** launch both the game and this app with
  `GDK_BACKEND=x11` and re-test (c)/(e). Note the workaround for M1.
- **Window never attaches:** verify the game is XWayland — `xprop _NET_WM_NAME`
  on it should succeed (X11), and `GAME_TITLE` must match exactly.
- **Opaque black plate:** this is the transparency-delay bug — keep the
  `setTimeout(..., 1000)` wrapper; do not remove `disableHardwareAcceleration()`.

## Packaging this app → see [Spike 3](../spike3-appimage/) (`npm run dist`).
