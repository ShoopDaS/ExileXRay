# Spike 3 — AppImage launches on a clean Fedora 44

Blocks **M9** and validates the **M1 deliverable**. Packages the Spike 1 overlay
app (the builder config lives in `../spike1-overlay/electron-builder.yml`).

## Build

```bash
cd spikes/spike1-overlay
npm install
npx @electron/rebuild -f -w electron-overlay-window,uiohook-napi
npm run dist            # -> spikes/spike1-overlay/dist/*.AppImage
```

## Install the .desktop (optional, for the X11 session env)

Copy `ExileXRaySpike.desktop` (in this folder) to `~/.local/share/applications/`
and point `Exec=` at the built AppImage path. It forces `XDG_SESSION_TYPE=x11`.

## STOP — success criteria (on a CLEAN Fedora 44, no extra packages)

- [ ] **(a) Launch** — double-clicking the `.AppImage` runs with **no libfuse2
      installed** and **no chrome-sandbox abort**.
- [ ] **(b) Native addons** — both load at runtime. Verify the prebuilt binaries
      are in the image:
      ```bash
      ./ExileXRaySpike-*.AppImage --appimage-extract >/dev/null
      find squashfs-root -path '*app.asar.unpacked*prebuilds*.node'
      # expect electron-overlay-window + uiohook-napi .node files
      ```
- [ ] **(c) Overlay** — with PoE2 open, the packaged app still attaches (re-run
      Spike 1 criteria a/b/c from the AppImage).

## If it fails

- **chrome-sandbox abort:** confirm unprivileged user namespaces are enabled —
  `sysctl kernel.unprivileged_userns_clone` (should be `1`). If not, either enable
  it or add `--no-sandbox` to the app launch / `main.js`. **Do NOT** add EE2's
  `--sandbox` flag (Flag F2 — it *causes* the abort on Fedora).
- **FUSE error (`dlopen libfuse.so.2`)**: the static toolset wasn't applied. As a
  fallback run with `APPIMAGE_EXTRACT_AND_RUN=1`, and check your electron-builder
  version honors `appImage.toolsets.appimage: "1.0.3"` (needs builder >= 25; older
  builders use a different key — upgrade builder).
- **`.node` missing from the image:** the `asarUnpack` globs didn't match — confirm
  the module paths under `node_modules/` and that `@electron/rebuild` ran against
  the same Electron version that gets packaged.
