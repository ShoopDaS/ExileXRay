# PoE2 Currency Overlay — Linux / AppImage Port (Electron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do Phase 0 (spikes) first — each is a hard STOP gate.** Do not start a feature milestone until its blocking spike has passed on the real target hardware.

**Goal:** Port the Windows-only C# `PoeAncientsPriceHelper` ([pedro-quiterio/PoeAncientsPriceHelper](https://github.com/pedro-quiterio/PoeAncientsPriceHelper) — a click-through overlay that OCRs the PoE2 currency-exchange panel and shows live poe.ninja prices) to Linux as an Electron app shipped as a single AppImage, validated on Fedora 44 / KDE Plasma / Wayland session (X11/XWayland forced). The ported application is named **ExileXRay**.

> **Naming:** the app/product name is **ExileXRay**. The source C# repo is the **behavioral spec** for *what* the app does; the EE2 directory shape below is an inherited template for *how* the Electron app is structured — directory/package names in the layout are illustrative, not required to match the repo name.

**Architecture:** Adopt Exiled-Exchange-2's (EE2) Electron platform layer wholesale — a Node **main** process (overlay windowing via `electron-overlay-window`, global input via `uiohook-napi`, a localhost WebSocket server) and a **renderer** web app (Vue 3 + Vite) that draws the overlay, talking to main over `ws://`, with shared **ipc/** types. Reuse EE2's Tesseract+OpenCV **WASM OCR worker** (currently Windows-gated) and enable it on Linux. **Transcribe** the C# pricing/detection logic to TypeScript verbatim against the original's test cases. Capture is **build-new** (Electron `desktopCapturer` + crop, BGRA). The original C# repo is a **behavioral spec, not code to run.**

**Tech Stack:** Electron ^40 (Chromium 144 / Node 24 / V8 14.4) · TypeScript · Vue 3 + Vite (renderer) · esbuild (main + OCR worker) · `electron-overlay-window`@4.1.0 · `uiohook-napi`@1.5.5 · `ws` · Comlink (worker bridge) · Tesseract WASM (`tesseract-core-simd`) + OpenCV WASM (`opencv.js`) from APT's `cv-ocr.zip` · `decimal.js` (banker's rounding) · `electron-builder` (AppImage, static toolset 1.0.3) · `electron-updater` (optional) · vitest (unit tests).

---

## Global Constraints

Every task implicitly inherits these. Values are copied verbatim from the analysis dossiers.

- **Target box:** Fedora 44, KDE Plasma, **Wayland session**. The game (PoE2) runs via Steam Proton → it is an **XWayland (X11) client**. App ID `2694490`.
- **Force X11 from inside the app:** `app.commandLine.appendSwitch('ozone-platform', 'x11')` **before** `app.whenReady()`, **and** ship `XDG_SESSION_TYPE=x11` in the `.desktop` `Exec=` line. **Do NOT** rely on `ELECTRON_OZONE_PLATFORM_HINT` — deprecated in Electron 38, **removed in Electron 39**, dead on ^40.
- **`electron-overlay-window` is X11-only** (README backends: Windows, Linux X11). No Wayland backend (upstream issue #427 = wontfix). It works in a Wayland session only because both game and overlay are X11 clients via XWayland.
- **Keep EE2's Linux quirks verbatim:** the **1000 ms transparency delay** wrapping overlay construction in `main.ts` (`process.platform === 'linux' ? 1000 : 0`) and `app.disableHardwareAcceleration()` on non-mac. Without them the transparent window renders opaque black.
- **AppImage on Fedora 44:** Fedora has **no libfuse2**. Use electron-builder **static runtime** `toolsets: { appimage: "1.0.3" }` (no FUSE2 dependency). For `chrome-sandbox` SUID: rely on Fedora's unprivileged user namespaces (usually enabled) or pass `--no-sandbox`. **Do NOT copy EE2's `--sandbox` flag** (re-introduces the Fedora abort) — see Flag F2.
- **Capture format must be BGRA.** Use `desktopCapturer` → `nativeImage.crop(rect).toBitmap()` (BGRA on all platforms) so the reused OpenCV `CV_8UC4` + `COLOR_BGR2*` math is unchanged. If a different source returns RGBA, add exactly one `cv.cvtColor(mat, mat, cv.COLOR_RGBA2BGRA)`. Delete the two win32 gates: `vision/wasm-bindings.ts:15` and `shortcuts/Shortcuts.ts:249`.
- **Decimal rounding:** C# `Math.Round(x, 1)` is `MidpointRounding.ToEven` (banker's). JS `Math.round` is half-up on binary floats. Use `decimal.js` with `ROUND_HALF_EVEN` for `exaltedValue`. `divineValue` is **unrounded**.
- **All brightness/sampling math is integer (truncating) division; comparisons are strict** (`> 100`, `< 80`). Fuzzy score uses strict `>` vs `0.84` and `>=` vs `0.92`.
- **Native-addon ABI:** run `@electron/rebuild -v <electron 40.x>` after install with a current `node-abi`; verify `app.asar.unpacked/**/prebuilds/*.node` exists in the **packaged** AppImage, not just `npm start`. Pin `electron-overlay-window@4.1.0` (fresher prebuilds than 4.0.2).
- **Config path:** map `%LocalAppData%\PoeAncientsPriceHelper\` → `app.getPath('userData')` (≈ `~/.config/ExileXRay`). Region geometry is **machine-specific — never sync/roam it.** Writes are atomic (temp file + rename).
- **When C# comments contradict constants, follow the constant** (Flag F6: stale comments on `StaleLimit`, heartbeat, `OpenBrightness`).
- **Commits:** never add a `Co-Authored-By` line; keep messages short and single-line.

---

## End Goal — definition of done

A single `.AppImage` that, double-clicked on a clean Fedora 44 / KDE Wayland box with PoE2 running under Proton:

1. Launches as an X11 client (verifiable via `xlsclients`), no FUSE/sandbox error.
2. Draws a transparent, click-through, always-on-top overlay glued to the PoE2 window (tracks move/resize/fullscreen).
3. On a one-time calibration, the user drags a box over the currency-exchange list; the region persists (physical px, multi-monitor/DPI-correct).
4. When the panel opens, a brightness gate fires, the calibrated region is captured and OCR'd, names are normalized + fuzzy-matched, prices come from poe.ninja, and a price plate is drawn to the right of each row (stack totals, gem level, divine/exalted icon, top-row highlight, "no info", easter eggs).
5. Global hotkeys work while the game is focused: **F5** start/stop, **F4** calibrate, **F3** debug overlay; **Esc** and **Left-Ctrl+Left-Click** dismiss instantly.
6. Tray (minimize-to-tray, scanning continues), single-instance, theme + league selectors, icon cache, crash log, `--ocr-test` headless mode.
7. Every row in the **Functionality Map** passes its verification check on hardware.

---

## Repository layout / file structure

Mirror EE2's three-package shape (no root `package.json`; `main/` and `renderer/` are separate npm packages glued by relative imports + `ipc/`).

```
ExileXRay/                            # (layout shape inherited from EE2; names illustrative)
├── ipc/                                  # shared TS, compiled into both halves
│   ├── types.ts                          # Event<Name,Payload> union — OUR currency events
│   └── KeyToCode.ts                      # reuse-verbatim from EE2 (keycode maps)
├── main/                                 # Electron main process (esbuild → dist/main.js + vision.js)
│   ├── package.json
│   ├── electron-builder.yml
│   ├── build/script.mjs                  # adapt EE2: esbuild config + dev watch/relaunch
│   ├── tsconfig.json  vitest.config.ts
│   └── src/
│       ├── main.ts                       # composition root (X11 switch, 1000ms linux delay, single-instance)
│       ├── server.ts                     # reuse-verbatim EE2 (trim): http + ws /events + static serve
│       ├── RemoteLogger.ts               # reuse-verbatim EE2
│       ├── AppTray.ts                     # adapt EE2
│       ├── AppUpdater.ts                  # reuse-verbatim EE2 (optional)
│       ├── windowing/
│       │   ├── OverlayWindow.ts           # adapt EE2 (OVERLAY_WINDOW_OPTS, attach, click-through toggle)
│       │   └── GameWindow.ts              # reuse-verbatim EE2 (trim uiSidebarWidth)
│       ├── capture/
│       │   └── RegionCapture.ts           # BUILD-NEW: desktopCapturer crop → BGRA {width,height,data}
│       ├── vision/                        # reuse EE2 worker, de-gate + rebuild recognizer
│       │   ├── wasm-bindings.ts           # reuse, DELETE win32 gate (line 15)
│       │   ├── link-main.ts  link-worker.ts  utils.ts   # reuse-verbatim
│       │   └── CurrencyPanelOcr.ts        # BUILD-NEW (replaces HeistGemFinder.ts)
│       ├── core/                          # TRANSCRIBE-FROM-C# (pure, no Electron deps, unit-tested)
│       │   ├── NameNormalizer.ts
│       │   ├── fuzzy.ts                    # Levenshtein + BestFuzzy
│       │   ├── quantity.ts                 # multiplier/strip/memory/ResolveMultiplierForDisplay
│       │   ├── gems.ts                     # TryResolveGemKey
│       │   ├── PriceRepository.ts          # poe.ninja fetch + parse + snapshot + override
│       │   ├── ListDetector.ts             # 60-point brightness sampler
│       │   ├── ScanEngine.ts               # brightness gate, cadence, MergeReads, resolution cache
│       │   └── types.ts                    # PriceEntry, PriceRow, RowSlot, PriceSnapshot
│       ├── scan/
│       │   └── ScanLoop.ts                # wires capture → ListDetector → OCR → ScanEngine → IPC
│       ├── config/
│       │   ├── AppConfig.ts  ConfigStore.ts  AppPaths.ts
│       └── assets/
│           └── IconCache.ts               # poecdn PNG download-once in main process
├── renderer/                             # Vue 3 + Vite (→ renderer/dist static SPA)
│   ├── package.json  vite.config.mts  tsconfig.json
│   ├── public/                            # bundled icons
│   └── src/
│       ├── main.ts                        # Vue bootstrap; await Host.init()
│       ├── transport/IPC.ts               # reuse-verbatim EE2 renderer IPC (Sockette ws bridge)
│       ├── overlay/OverlayRoot.vue        # price-plate renderer (absolute-positioned rows)
│       ├── overlay/PriceRow.vue
│       ├── calibrate/Calibrator.vue       # BUILD-NEW drag-select calibration
│       └── settings/Settings.vue          # league/theme/hotkey rebind/offset
├── resources/
│   └── cv-ocr/                            # VENDORED OCR assets (extraResources)
│       ├── tesseract-core-simd.js  tesseract-core-simd.wasm
│       ├── opencv.js
│       └── eng.traineddata                # (heist-lock.bmp dropped)
├── docs/plans/2026-06-26-poe2-overlay-linux-port.md   # this file
└── DEVELOPING.md
```

---

## Source map — where every piece comes from

| Concern | Source | Notes |
|---|---|---|
| Overlay window, attach/track, click-through toggle | **reuse EE2** `OverlayWindow.ts`+`GameWindow.ts` | drop webview, PoE strings, `uiSidebarWidth` |
| ws server + IPC bus | **reuse EE2** `server.ts`, renderer `IPC.ts`, `ipc/KeyToCode.ts` | trim file-upload/proxy/host-config |
| Tray, logger, updater | **reuse EE2** `AppTray.ts`, `RemoteLogger.ts`, `AppUpdater.ts` | relabel; updater optional |
| esbuild build + dev relaunch | **reuse EE2** `build/script.mjs` | keep `external:[electron,uiohook-napi,electron-overlay-window]`; keep vision worker build |
| OCR plumbing (Tesseract/OpenCV WASM worker, Comlink) | **reuse EE2** `vision/wasm-bindings.ts`, `link-main.ts`, `link-worker.ts`, `utils.ts` | delete win32 gate |
| Region capture | **build-new** `capture/RegionCapture.ts` | `desktopCapturer`+crop, BGRA — NOT `OverlayController.screenshot()` (Flag F1) |
| Currency recognizer (preprocess + PSM + row split) | **build-new** `vision/CurrencyPanelOcr.ts` | replaces `HeistGemFinder.ts`; keep C# post-OCR filters |
| Brightness gate, cadence, merge/lock, resolution | **transcribe C#** `ScanEngine.cs` → `core/ScanEngine.ts` | verbatim constants |
| Detector, normalize, fuzzy, quantity, gems, prices | **transcribe C#** `ListDetector/NameNormalizer/.../PriceRepository` | port test cases verbatim |
| Calibration UI | **build-new** `renderer/src/calibrate/Calibrator.vue` | C# WinForms calibrator does not port (Flag F5) |
| Overlay rendering | **build-new** `renderer/src/overlay/*` | DOM/CSS re-expression of `PriceOverlay.cs` |
| Hotkeys + dismiss gestures | **mixed** `globalShortcut` (F5/F4/F3) + `uiohook-napi` (Esc-down, Ctrl+Click) | |
| Config / icon cache | **transcribe C#** schema + behavior | paths → userData |
| Packaging | **build-new** `electron-builder.yml` | AppImage static toolset, asarUnpack, extraResources |
| Dropped entirely | Velopack, WGC/GDI, `Windows.Media.Ocr`, SharpHook, `UpdateLayeredWindow`, app.manifest PMv2, `OverlayController.screenshot()`, `heist-lock.bmp`, EE2 host-files/proxy/dataParser | |

---

## Functionality map (28 features → source → on-hardware verification)

Run every check on the actual Fedora 44 / KDE / Wayland box with PoE2 under Proton.

| # | Feature | Required behavior (from C#) | Source | Verification on Fedora 44 |
|---|---|---|---|---|
| 1 | Overlay attach & track | Frameless, topmost, no-taskbar window pinned to game; follows move/resize/fullscreen | reuse | Launch with `--ozone-platform=x11`; `attachByTitle` to PoE2; move/alt-tab/fullscreen → overlay stays glued; `xprop _NET_WM_NAME` confirms game is X11 |
| 2 | Click-through toggle | Never interactable/never steals focus by default; interactive only over content | reuse | Idle: click a plate → game gets the click; hover/hotkey → overlay takes it. Watch KWin focus-stick (#1383): try `GDK_BACKEND=x11` on both |
| 3 | Region calibration | Drag a box over the list across virtual desktop; store absolute physical px (origin may be negative); `IsCalibrated = W>0 && H>0` | build | Drag rect, confirm Enter; reopen → column lands at `regionRight + xOffset`. Test 150% display + monitor left-of-primary (negative X) round-trips via scaleFactor |
| 4 | Brightness gate | 60 pts, per-channel avg, `(R+G+B)/3` int-div. Open: 2 frames `>100`; close: 3 frames `<80`; `[80,100]` resets both streaks (hold) | transcribe | Unit: `(116,103,84)→101→OPEN`, `(6,6,6)→closed` per `ListDetectorTests`. Live: open panel → "reading" within ~2 open cycles; close → clears after 3 dark frames |
| 5 | Region capture | Grab calibrated rect each cycle; 120 ms open / 300 ms closed; OCR floor 150 ms | mixed | `desktopCapturer`+`crop().toBitmap()` (BGRA). Dump a crop to PNG, eyeball colors (no R/B swap). Latency < 120 ms |
| 6 | OCR of list | Crop icon col (0.30 L / 0.02 R), invert dark-on-light, upscale ×3; rows by CenterY; MinName/Word len 4 | mixed | Reuse WASM worker, delete win32 gate + heist code; assert one sane line per row at PSM 6/7 |
| 7 | Name normalize | `toLowerCase` → `/[^\w\s]/→" "` → `/\s+/→" "` → trim (exact order) | transcribe | Port 9 `NameNormalizer` cases (`Grip's Edge→grip s edge`, `:::---→""`); Unicode-aware `\w` |
| 8 | Fuzzy match | Levenshtein 2-row DP; `score=1−dist/max(len)`; match `>0.84`, exact `>=0.92`; bucket ±3; fuzzy if len≥6, prefix if len≥10 | transcribe | Port `FuzzyMatchTests` incl. strict-`>` tie-break + first-key-wins; `viswn→vision` matches; `vision rune↔rebirth rune` does not |
| 9 | poe.ninja fetch+cache | 5 types (Currency/Runes/Expedition/Verisium/UncutGems); exact URL+UA+Referer; 30-min refresh; atomic snapshot + length index | transcribe | Hit live endpoint w/ exact UA/Referer for `Runes of Aldur`; URL has `league=Runes%20of%20Aldur`, Referer `/economy/runesofaldur/`; not Cloudflare-blocked (F4) |
| 10 | Price math | `divineValue` unrounded; `exaltedValue=Round(x,1,ToEven)`; missing divine→0, missing exalted→1 (asymmetric); icon by `DivineValue≥1` | transcribe | Port `PriceRepositoryTests`: softcore `0.5→ex 40.0`; hardcore `1.13→ex 1.1`; banker's rounding on a `.x5` case (use decimal.js, not `Math.round`) |
| 11 | Stack/quantity | `Nx` multiplier (cap 999); strip leading noise; quantity memory 1500 ms; `ResolveMultiplierForDisplay` precedence (explicit>locked>remembered>1) | transcribe | Port `OcrScanner`+`ScanEngineQuantity` tables (`14x adaptive alloy→14`, roman `i→1`, 5-row matrix). Live: 14× stack shows `total (unit each)` |
| 12 | Gem pricing | Must contain `gem`+`skill|spirit|support`; key`uncut {type} gem level {N}`; no level→`?`; never fuzzy/cached | transcribe | Port `TryResolveGemKey` incl. `uncot…→uncut…`, `uncut spirit gem`(no level)→null. Live: real gem shows exact-level price |
| 13 | Per-row render | Rounded slate plate `rgba(64,55,55,.59)`; divine/exalted icon; top-row bright-green when >1 priced; "no info"; Consolas 20 bold | mixed | Absolutely-positioned DOM at `top: regionTop+centerY`; confirm plates genuinely semi-transparent (not black) and aligned to rows |
| 14 | Easter eggs | `random+currency→Mirror` (ranks top); `unique+belt→Headhunter`; skip `runeshape` rows | transcribe | Inject OCR text → Mirror sorts above all; runeshape row dropped |
| 15 | Panel-switch/stale | ≥2 changed locked slots within ±20px → remove only those; `staleCount≥2` hides, `≥10` clears+unconfirms; lock 1 read (exact)/2 (fuzzy) | transcribe | Port `MergeReads`. Live: switch panel → prices follow; single-row jitter does NOT full-clear |
| 16 | F5 start/stop | Global, fires on key **release**, rebindable; toggles scan engine | mixed | Game focused (XWayland), tap F5 → scanning toggles; uiohook sees key via X11/XRecord; no KWin collision |
| 17 | F4 calibrate | Global, on release, rebindable; opens calibrator even when game owns foreground | mixed | Game fullscreen+focused, tap F4 → calibrator on top (not behind); focus-grab works under KWin |
| 18 | F3 debug | Global, on release, rebindable; region outline + per-row boxes + `? OcrText` | mixed | Tap F3 → region box (orange→lime when detected) + `?` text; prices unaffected |
| 19 | Esc / Ctrl+Click dismiss | Reserved (non-rebindable). Esc on key **press**; Left-Ctrl+Left-Click mirrors buy; hides instantly + latches until 3 dark frames | build | Esc over shown overlay → instant hide, stays hidden until panel closes; Ctrl+Click row → same. Needs native hook (uiohook), not `globalShortcut` |
| 20 | Config persistence | JSON, atomic temp+replace; userData; defaults below; region machine-specific | mixed | Map to `userData`; `kill -9` mid-write → no corruption; region not roamed |
| 21 | Icon cache | 4 PNGs from poecdn.com, download-once, text fallback `d`/`ex` | transcribe | First run → 4 fetches; second → 0; block net → `d`/`ex` glyphs; fetch in main (CSP), serve `file://`/`data:` |
| 22 | System tray | Minimize-to-tray (scanning continues); restore; Show/Exit; Open-in-browser | reuse | Adapt EE2 `AppTray`; KDE StatusNotifierItem icon appears; restore+quit work; scan continues hidden |
| 23 | Single-instance | Second launch focuses existing, exits | reuse | `app.requestSingleInstanceLock()`; launch twice → second exits |
| 24 | Theme + league | 5 dark themes (Toxic default, invalid→Toxic); softcore/hardcore league list (code-only) | transcribe | Switch theme → bg only, persists; switch league → next refresh hits correct slug |
| 25 | DPI/scaleFactor | Physical px on Windows via PMv2; Linux: convert physical↔DIP per display via scaleFactor + nativeOrigin | build | Reuse `WidgetAreaTracker` Linux scaling; test 100/125/150% + negative-origin monitor; rows don't drift (#21 bug) |
| 26 | AppImage packaging | Single-file; native addons + WASM + traineddata bundled | build | `toolsets:{appimage:"1.0.3"}`; clean Fedora 44 double-click runs (no FUSE), chrome-sandbox OK; `app.asar.unpacked/**/prebuilds/*.node` present |
| 27 | X11 forcing | App must be X11 client for overlay+hooks in Wayland session | build | `appendSwitch('ozone-platform','x11')` + `XDG_SESSION_TYPE=x11` in `.desktop`; `xlsclients` shows overlay; ELECTRON_OZONE_PLATFORM_HINT NOT used |
| 28 | Auto-update + crash log | 30-min check + apply-on-exit; crash.log; `--ocr-test` | reuse/build | `electron-updater`+`latest-linux.yml` (write access to `$APPIMAGE`); force startup throw → log+dialog; `--ocr-test img.png` writes text |

---

## Phase 0 — De-risking spikes (HARD STOP gates)

Do these **before any feature milestone**. Each converts a project-killing unknown into a known on the real hardware. If a spike fails, escalate before proceeding — the whole approach may need rethinking.

### Spike 1 — Overlay core on Fedora/KDE (blocks M1, M5, M6, M7)

- [ ] Scaffold a bare Electron ^40 app. In `main.ts`: `app.commandLine.appendSwitch('ozone-platform','x11')` before ready; `app.disableHardwareAcceleration()`; wrap overlay creation in `setTimeout(fn, process.platform==='linux'?1000:0)`.
- [ ] `npm i electron-overlay-window@4.1.0 uiohook-napi@1.5.5`; run `npx @electron/rebuild -v <electron 40.x>`.
- [ ] Create a transparent click-through `BrowserWindow` with `{...OVERLAY_WINDOW_OPTS}`; `OverlayController.attachByTitle(win, 'Path of Exile 2')`; render a single semi-transparent colored `<div>`.
- [ ] `uIOhook.start()`; register an F5 listener that logs.
- **STOP — success criteria (run with PoE2 open):** (a) overlay glues to the game through move/resize/fullscreen; (b) the div is genuinely **see-through, not opaque black**; (c) clicking the div passes the click to the game when idle; (d) `xlsclients` lists the overlay as an X11 client; (e) F5 fires while the game is focused. If focus sticks, test `GDK_BACKEND=x11` on both processes (#1383) and note the workaround.

### Spike 2 — Capture + de-gated OCR on a real panel (blocks M3, M4, M6)

- [ ] In a renderer/main context, `desktopCapturer.getSources({types:['window']})`, match the PoE2 source, `nativeImage.crop(rect).toBitmap()` for a hand-picked rect over the open exchange panel.
- [ ] Vendor `cv-ocr` assets (tesseract-core-simd.{js,wasm}, opencv.js, eng.traineddata) into `resources/cv-ocr/`. Copy EE2's `vision/wasm-bindings.ts` + `link-*.ts`; **delete the `process.platform!=='win32'` gate**.
- [ ] Build a minimal `CV_8UC4` mat from the BGRA buffer → grayscale → upscale ×3 → Otsu threshold → `bitwise_not` → `Recognize()` at PSM 6.
- **STOP — success criteria:** (a) the cropped PNG shows the panel with **correct colors (no R/B swap)**; (b) capture+crop latency `< 120 ms` on the box; (c) `GetUTF8Text()` returns one readable line per visible currency row. If colors are swapped, add `cv.cvtColor(mat,mat,cv.COLOR_RGBA2BGRA)` and re-confirm.

### Spike 3 — AppImage launches on clean Fedora 44 (blocks M9, and validates M1 deliverable)

- [ ] Build the Spike-1 app as an AppImage with `electron-builder`, `linux.target:["AppImage"]`, `toolsets:{appimage:"1.0.3"}`, `asarUnpack:["**/node_modules/electron-overlay-window/**","**/node_modules/uiohook-napi/**"]`.
- [ ] Add a `.desktop` `Exec=env XDG_SESSION_TYPE=x11 <AppImage> %U`.
- **STOP — success criteria (on a clean Fedora 44 with no extra packages):** (a) double-click runs with **no libfuse2** install and **no chrome-sandbox abort**; (b) at runtime `require('electron-overlay-window')` and `require('uiohook-napi')` both load (check `app.asar.unpacked/**/prebuilds/*.node` exists); (c) overlay still attaches (combines Spike 1). If sandbox aborts, confirm userns (`sysctl kernel.unprivileged_userns_clone`) or add `--no-sandbox`.

### Spike 4 — poe.ninja reachable from Linux (blocks M2's PriceRepository task; cheap, no game needed)

- [ ] A ~20-line Node script: for each of the 5 types, GET `https://poe.ninja/poe2/api/economy/exchange/current/overview?league=Runes%20of%20Aldur&type=<T>` with the **exact** Chrome UA + Referer `https://poe.ninja/poe2/economy/runesofaldur/<t>`.
- **STOP — success criteria:** all 5 return non-empty JSON with `items[]`/`lines[]` (not a Cloudflare challenge). If blocked, route via Electron `net`/a renderer session, or EE2's `/proxy` pattern (Flag F4). Also confirm the **current** league name (the default "Runes of Aldur" goes stale between seasons).

---

## Milestone M1 — Project scaffold + platform core

**Outcome:** the EE2 platform shell, currency-renamed, attaching to PoE2, with a placeholder renderer — i.e. Spike 1 productized into the real repo.

**Files:** Create `ipc/types.ts`, `ipc/KeyToCode.ts` (reuse), `main/src/{main.ts,server.ts,RemoteLogger.ts,AppTray.ts}`, `main/src/windowing/{OverlayWindow.ts,GameWindow.ts}`, `main/build/script.mjs`, `main/package.json`, `renderer/{package.json,vite.config.mts}`, `renderer/src/{main.ts,transport/IPC.ts,overlay/OverlayRoot.vue}`.

**Interfaces produced:**

- `eventPipe = { onEventAnyClient(name, cb), sendEventTo(target, event) }` (from `server.ts`).
- `ipc/types.ts` events: `MAIN->OVERLAY::overlay-attached`, `MAIN->OVERLAY::focus-change`, `OVERLAY->MAIN::focus-game`, `CLIENT->MAIN::update-config`, `MAIN->CLIENT::log-entry`, plus (added later) `MAIN->OVERLAY::scan-state`, `OVERLAY->MAIN::track-area`, `CLIENT->MAIN::calibrate-result`.
- `OverlayWindow` with `loadAppPage(port)`, `toggleActiveState()`, `assertGameActive()`, `assertOverlayActive()`.
- `GameWindow` with `attach(win, title)`, `bounds` (= `OverlayController.targetBounds`), focus/blur → `active-change`.

**Tasks:**

- [ ] Copy EE2 `server.ts`; trim file-upload/proxy/host-config; keep http+ws `/events`+static serve+OS-assigned port (prod) / 8584 (dev). Keep `lastActiveClient`.
- [ ] Copy EE2 `RemoteLogger.ts` verbatim.
- [ ] Copy EE2 `windowing/GameWindow.ts`; delete `uiSidebarWidth`.
- [ ] Copy EE2 `windowing/OverlayWindow.ts`; drop webviewTag/`did-attach-webview`; rename PoE strings; simplify `handleExtraCommands` to our keys; keep `OVERLAY_WINDOW_OPTS` spread-then-override, click-through toggle, `focus-change` broadcast.
- [ ] Write `main.ts` composition root: X11 switch + `disableHardwareAcceleration` (non-mac) + single-instance lock + the **1000 ms Linux delay** wrapping `OverlayWindow`/`uIOhook.start()`/server/`loadAppPage`.
- [ ] Copy EE2 `build/script.mjs`; keep `external:[electron,uiohook-napi,electron-overlay-window]`, the two `define`s, dev watch→relaunch, **and** the `vision.js` worker build.
- [ ] Renderer: Vite + Vue 3; copy EE2 renderer `IPC.ts` (Sockette ws bridge) → `transport/IPC.ts`; `OverlayRoot.vue` renders a placeholder div; vite proxy `/events`→8584 in dev.
- [ ] `ipc/types.ts`: define the `Event<Name,Payload>` union with OUR events only (delete all PoE item/OCR/log events).
- **CHECKPOINT (`npm run dev`, game open):** overlay attaches and tracks; renderer connects over ws (log line in both); `focus-change` toggles on Shift+Space. Re-run Spike-1 criteria a/b/c in-repo.

---

## Milestone M2 — Pure logic core (TDD, headless)

**Outcome:** a fully unit-tested `core/` library with **zero Electron dependencies**, runnable under vitest, reproducing the C# behavior exactly. This is the highest-value, lowest-risk milestone — do it in parallel with M1. Every task is strict TDD using the **verbatim** test tables from the spec.

**Files:** Create `main/src/core/{types.ts,NameNormalizer.ts,fuzzy.ts,quantity.ts,gems.ts,PriceRepository.ts,ListDetector.ts,ScanEngine.ts}` + a `*.test.ts` beside each. `main/vitest.config.ts`.

**Interfaces produced (consumed by M3/M4):**

- `normalize(text: string): string`
- `levenshtein(a: string, b: string): number`; `bestFuzzy(name: string, keysByLength: Map<number,string[]>): {key:string,score:number}|null`; `FUZZY_THRESHOLD=0.84`, `HIGH_CONFIDENCE=0.92`
- `extractMultiplierWithConfidence(s: string): {multiplier:number, explicit:boolean}`; `stripLeadingNoise(s: string): string`; `resolveMultiplierForDisplay(read, explicit, priorLocked, remembered): number`
- `tryResolveGemKey(normalized: string): {isGem:boolean, key:string|null}`
- `PriceEntry = {divineValue:number, exaltedValue:number, hasMarketData:boolean}` (use `decimal.js` internally; expose numbers)
- `parseNinjaOverview(json, type): Map<normalizedKey, PriceEntry>`; `buildUrl(league,type)`, `buildReferer(league,type)`
- `sampleAverage(rgbaBytes, width, height, bpp): {r:number,g:number,b:number}`
- `ScanEngine` state machine: `feedBrightness(brightness)`, `mergeReads(reads)`, `resolve(normalizedName)` — exposing `isOpen`, `confirmedOpen`.

### Task M2.1 — NameNormalizer (TDD)

- [ ] **Step 1 — failing test** (`NameNormalizer.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { normalize } from './NameNormalizer'
const cases: [string,string][] = [
  ['Support: Scattering Flame','support scattering flame'],
  ['CHILLING FLUX','chilling flux'],
  ["  Grip's Edge  ",'grip s edge'],
  ['Rune-of-Aldur','rune of aldur'],
  ['Skill: Grip Filters','skill grip filters'],
  ['  VERISIUM FLUX  ','verisium flux'],
  [':::---',''],
  ['a   b   c','a b c'],
]
describe('normalize', () => { for (const [i,o] of cases) it(JSON.stringify(i), () => expect(normalize(i)).toBe(o)) })
```

- [ ] **Step 2 — run, expect FAIL** `npx vitest run src/core/NameNormalizer.test.ts` → "normalize is not a function".
- [ ] **Step 3 — implement** (`NameNormalizer.ts`): exact order — lowercase → `replace(/[^\w\s]/gu,' ')` → `replace(/\s+/gu,' ')` → `trim()`. Use the `u` flag for Unicode-aware `\w` to match .NET.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit** `feat: name normalizer`.

### Task M2.2 — Levenshtein + BestFuzzy (TDD)

- [ ] **Failing test** with the verbatim tables:

```ts
import { levenshtein, bestFuzzy } from './fuzzy'
// distances
;[['','',0],['abc','abc',0],['abc','abd',1],['kitten','sitting',3],['vision','viswn',2]]
  .forEach(([a,b,d]) => it(`lev ${a}|${b}`, () => expect(levenshtein(a as string,b as string)).toBe(d)))
// score>0.84 matches
const score = (a:string,b:string)=>1-levenshtein(a,b)/Math.max(a.length,b.length)
it('viswn matches vision', () => expect(score('greater viswn rune','greater vision rune')).toBeGreaterThan(0.84))
it('vision != rebirth', () => expect(score('greater vision rune','greater rebirth rune')).toBeLessThanOrEqual(0.84))
```

- [ ] **Run → FAIL.**
- [ ] **Implement** `levenshtein` as the 2-row rolling DP (cost 1 for sub/ins/del). `bestFuzzy(name, keysByLength)`: init `bestScore=0.84`, iterate buckets `len ∈ [max(0,name.length-3), name.length+3]`, strict `>` replaces best (first-key-wins on ties). Caller gates: fuzzy only if `name.length>=6`. Export `HIGH_CONFIDENCE=0.92` (used by ScanEngine to mark "exact").
- [ ] **Run → PASS.** Commit `feat: fuzzy matching`.

### Task M2.3 — Quantity parsing + multiplier resolution (TDD)

- [ ] **Failing tests** from the OcrScanner/ScanEngineQuantity tables:

```ts
import { stripLeadingNoise, extractMultiplierWithConfidence, resolveMultiplierForDisplay } from './quantity'
;[['14x adaptive alloy','adaptive alloy'],['1 mystic alloy','mystic alloy'],['3x rune of aldur','rune of aldur'],
  ['adaptive alloy','adaptive alloy'],['1 1 adaptive alloy','adaptive alloy'],
  ['e l8 n 1x the greatwolf s rune of willpower','the greatwolf s rune of willpower'],
  ['oa a 1x greater orb of transmutation','greater orb of transmutation'],
  ['krogin 1x ancient rune of decay','ancient rune of decay'],
  ['nerog 11x ancient rune of discovery','ancient rune of discovery']]
  .forEach(([i,o]) => it(`strip ${i}`, () => expect(stripLeadingNoise(i)).toBe(o)))
;[['3x orb of alchemy',3,true],['1x orb of alchemy',1,true],['orb of alchemy',1,false],
  ['warding rune of protection i',1,false]]
  .forEach(([i,m,e]) => it(`mult ${i}`, () => expect(extractMultiplierWithConfidence(i as string)).toEqual({multiplier:m,explicit:e})))
;[[3,true,1,1,3],[1,false,3,1,3],[1,false,1,3,3],[1,true,1,3,1],[1,false,1,1,1]]
  .forEach(([rm,re,pl,rem,exp]) => it(`resolve ${rm}/${re}/${pl}/${rem}`,
    () => expect(resolveMultiplierForDisplay(rm as number,re as boolean,pl as number,rem as number)).toBe(exp)))
```

- [ ] **Run → FAIL.**
- [ ] **Implement** the four regexes verbatim (`MultiplierPattern`, `LeadingNoise`, `QuantityMarker`, `LeadingNonAlpha`); `extractMultiplierWithConfidence` (cap `Math.min(n,999)`, n≥1, else `{1,false}`); `stripLeadingNoise` (LeadingNoise → QuantityMarker substring → LeadingNonAlpha → trim); `resolveMultiplierForDisplay` precedence (explicit-this-pass > priorLocked > remembered-when-not-explicit > 1).
- [ ] **Run → PASS.** Commit `feat: quantity parsing`.

### Task M2.4 — Gem detection (TDD)

- [ ] **Failing tests:**

```ts
import { tryResolveGemKey } from './gems'
;[['uncut spirit gem level 19','uncut spirit gem level 19'],['uncut skill gem level 7','uncut skill gem level 7'],
  ['uncut support gem level 3','uncut support gem level 3'],['uncot spirit gem level 19','uncut spirit gem level 19'],
  ['uncut spirit gem',null],['greater vision rune',null],['exalted orb',null]]
  .forEach(([i,k]) => it(`gem ${i}`, () => expect(tryResolveGemKey(i as string).key).toBe(k)))
it('recognized w/o level', () => expect(tryResolveGemKey('uncut spirit gem').isGem).toBe(true))
```

- [ ] **Run → FAIL.**
- [ ] **Implement** `tryResolveGemKey`: require substring `gem` AND `\b(skill|spirit|support)\b`; if `\blevel\s+(\d+)\b` → key `uncut {type} gem level {N}` (canonical `uncut` regardless of input), else key `null` but `isGem=true`. Caller will treat gems as never-fuzzy, never-cached.
- [ ] **Run → PASS.** Commit `feat: gem detection`.

### Task M2.5 — PriceRepository parse + URL/headers + price math (TDD)

*(Depends on Spike 4 confirming live reachability; the parse/math tests are offline.)*

- [ ] **Failing tests** (URL/Referer + the softcore/hardcore math + asymmetric rate fallback + null primaryValue):

```ts
import { buildUrl, buildReferer, parseNinjaOverview } from './PriceRepository'
it('url', () => expect(buildUrl('Runes of Aldur','Currency')).toContain('league=Runes%20of%20Aldur&'))
it('referer', () => expect(buildReferer('HC Runes of Aldur','Currency')).toContain('/economy/hcrunesofaldur/'))
// softcore: primary divine, rates.exalted 80, chilling flux primaryValue 0.5 → divine 0.5, exalted 40.0
// hardcore: primary exalted, rates.divine 0.01481, orb of alchemy 1.13 → exalted 1.1 (Round ToEven)
// null primaryValue → hasMarketData false, 0/0
```

- [ ] **Run → FAIL.**
- [ ] **Implement** `buildUrl` (`Uri.EscapeDataString` ≈ `encodeURIComponent` with spaces `%20`; raw cased `type`), `buildReferer` (slug = spaces removed + lowercase). `parseNinjaOverview`: build `nameMap[id]=name`; `core.primary ?? 'divine'`; `divinePerPrimary = primary==='divine'?1:(rates.divine ?? 0)`; `exaltedPerPrimary = primary==='exalted'?1:(rates.exalted ?? 1)`; per line skip if id∉nameMap, `key=normalize(name)`, null primaryValue → `{0,0,false}`, else `divineValue=primaryValue*divinePerPrimary` (unrounded), `exaltedValue=decimal(primaryValue*exaltedPerPrimary).toDP(1, ROUND_HALF_EVEN)`.
- [ ] Add the live `fetch` (5 types, exact UA+Referer, 30-min timer, atomic `volatile` snapshot + `keysByLength` length-bucket index + `priceGeneration` counter) and `applyCustomOverride` (keys normalized, replaces/inserts, missing file ignored).
- [ ] **Run → PASS.** Commit `feat: price repository`.

### Task M2.6 — ListDetector brightness sampler (TDD)

- [ ] **Failing tests** from `ListDetectorTests` (solid bitmaps): `(187,179,162)→(187,179,162)`, `(116,103,84)→(116,103,84)` (brightness 101), `(6,6,6)→(6,6,6)`.
- [ ] **Run → FAIL.**
- [ ] **Implement** `sampleAverage(bytes,width,height,bpp)`: 12 cols × `[0.20,0.35,0.50,0.65,0.80]` rows, x∈`[0.40,0.98]` with half-step centering, read B/G/R at offsets 0/1/2 (BGRA, ignore alpha), per-channel integer average over 60 points.
- [ ] **Run → PASS.** Commit `feat: list detector`.

### Task M2.7 — ScanEngine state machine (TDD)

- [ ] **Failing tests:** brightness gate (2× `>100` opens, 3× `<80` closes, `[80,100]` holds + resets streaks), dismiss latch release after 3 dark frames + hint-suppression, `mergeReads` panel-switch (≥2 changed locked slots within ±20px removes only those; single-row jitter does not), stale clearing (`staleCount≥2` hides, `≥10` clears+unconfirms), lock speed (`exact→1 read`, `fuzzy→2`), resolution chain (exact→prefix len≥10→fuzzy len≥6 with `exact = score>=0.92`) + resolution cache invalidated on `priceGeneration` change + `Exact` flag preserved on cache hit.
- [ ] **Run → FAIL.**
- [ ] **Implement** `ScanEngine` with verbatim constants: `OpenBrightness=100, CloseBrightness=80, DarkToRelease=3, MinOcrIntervalMs=150, OpenCycleMs=120, ClosedCycleMs=300, TopmostEveryN=10, StaleLimit=10, QuantityMemoryMs=1500, Tolerance=20, Confirm=2, EvictAfter=3`, stableY `<5px` reuse, runeshape skip, easter-egg detection.
- [ ] **Run → PASS.** Commit `feat: scan engine core`.

- **CHECKPOINT M2:** `npx vitest run src/core` → all green. Every ported test table reproduces C# behavior. No Electron import anywhere in `core/`.

---

## Milestone M3 — Capture + OCR pipeline

**Outcome:** given a calibrated rect + the game window, produce OCR'd, position-tagged rows on Linux. Productizes Spike 2.

**Files:** Create `main/src/capture/RegionCapture.ts`, `main/src/vision/CurrencyPanelOcr.ts`; reuse (de-gated) `main/src/vision/{wasm-bindings.ts,link-main.ts,link-worker.ts,utils.ts}`; `resources/cv-ocr/*`.

**Interfaces produced:**

- `RegionCapture.captureRegion(rect): Promise<{width:number,height:number,data:Uint8Array}>` (BGRA).
- `CurrencyPanelOcr.scan(image): Promise<Array<{ocrText:string, centerY:number}>>` — rows sorted by centerY, post-filtered (MinNameLength/MinWordLength=4).

**Tasks:**

- [ ] Vendor `cv-ocr` assets into `resources/cv-ocr/` (from APT `cv-ocr.zip`; drop `heist-lock.bmp`). Add `extraResources:[{from:'resources/cv-ocr',to:'cv-ocr'}]`. First-run copy `resourcesPath/cv-ocr` → `userData/apt-data/cv-ocr` if absent (resourcesPath is read-only; Emscripten needs `.wasm` beside `.js`).
- [ ] Copy EE2 `vision/wasm-bindings.ts`, `link-main.ts`, `link-worker.ts`, `utils.ts`; **delete the win32 gate** (`wasm-bindings.ts:15`); point `binDir` at `userData/apt-data/cv-ocr`.
- [ ] `RegionCapture.ts`: `desktopCapturer.getSources({types:['window'],thumbnailSize})` → match PoE2 → `nativeImage.crop(rect).toBitmap()` → `{width,height,data}`. Honor the C# **icon-column crop** (left 0.30, right 0.02) on the rect before/after capture.
- [ ] `CurrencyPanelOcr.ts` (replaces `HeistGemFinder`): build `CV_8UC4` BGRA mat → `COLOR_BGR2GRAY` → upscale ×3 (`INTER_CUBIC`) → `THRESH_OTSU` → `bitwise_not` → either PSM 6 whole-block split on `\n`, or per-row slice + PSM 7 + `MeanTextConf()>30` (recommended). Keep C# post-filters: rows sorted by centerY, drop letter-runs `<4`. Optionally a digit-whitelist PSM-7 pass on a count-column sub-ROI.
- [ ] Add a headless harness: `--ocr-test <png>` runs `CurrencyPanelOcr.scan` and writes recognized rows.
- **CHECKPOINT M3:** on a saved real-panel PNG, `--ocr-test` yields one sane row per currency line; colors confirmed BGRA (Spike 2). Capture latency `<120 ms` on hardware.

---

## Milestone M4 — Scan loop wiring

**Outcome:** the full detect→capture→OCR→resolve→rows pipeline running on the real cadence, emitting `scan-state` to the renderer.

**Files:** Create `main/src/scan/ScanLoop.ts`. Modify `ipc/types.ts` (add `MAIN->OVERLAY::scan-state` with rows + flags), `main.ts` (start/stop loop).

**Interfaces consumed:** `RegionCapture`, `CurrencyPanelOcr`, `core/ListDetector`, `core/ScanEngine`, `core/PriceRepository`.

**Tasks:**

- [ ] `ScanLoop`: the `RunLoopAsync` translation — every cycle: capture region → `sampleAverage`→brightness → `ScanEngine.feedBrightness`; while open + `≥150ms` since last OCR → `CurrencyPanelOcr.scan` → normalize/quantity/gem/resolve → `mergeReads` → build `PriceRow[]`; `await delay(isOpen?120:300 − work)`. Dismiss latch + dark-frame release + stale clearing + topmost-every-10.
- [ ] Emit `scan-state` (rows, `confirmedOpen`, `reading`) to overlay; emit cleared state on dismiss.
- [ ] Wire poe.ninja `PricesUpdated` → resolution-cache invalidation via `priceGeneration`.
- **CHECKPOINT M4:** with game open, opening the exchange panel produces `scan-state` events with priced rows in the main log within ~2 cycles; closing clears after 3 dark frames. (Renderer still placeholder — verify via logs.)

---

## Milestone M5 — Calibration UI (build-new)

**Outcome:** a web-based drag-select calibrator that stores a DPI-correct physical-px region, replacing the C# WinForms calibrator (which does not port — Flag F5).

**Files:** Create `renderer/src/calibrate/Calibrator.vue`; main-side `windowing/CalibrationWindow.ts`; events `OVERLAY->MAIN::calibrate-result`, `MAIN->...::open-calibrator`.

**Tasks:**

- [ ] `CalibrationWindow.ts`: a full-screen (per active display) transparent, always-on-top `BrowserWindow`; grab focus over the fullscreen XWayland game (the WinForms `AttachThreadInput` trick has no direct equivalent — use `alwaysOnTop:'screen-saver'` + `show()`+`focus()`; **verify on hardware**, Flag F5).
- [ ] `Calibrator.vue`: 40%-black backdrop, crosshair, drag a rect (discard `<3×3px`), Enter/Space confirm, Esc cancel; live rect readout.
- [ ] Convert CSS px → **physical px** = DIP × `display.scaleFactor` using `screen.getDisplayNearestPoint` + `nativeOrigin` (reuse `WidgetAreaTracker`'s Linux scaling math); preserve negative origins. Persist `RegionX/Y/Width/Height`.
- **CHECKPOINT M5:** calibrate on 100% display → overlay column lands at `regionRight + xOffset` exactly; repeat on a 150% display and a monitor left-of-primary (negative X). Rows must not drift (#21-class bug).

---

## Milestone M6 — Overlay rendering (build-new)

**Outcome:** the renderer draws price plates matching the C# `PriceOverlay` visuals.

**Files:** Create `renderer/src/overlay/{OverlayRoot.vue,PriceRow.vue}`, a theme stylesheet, settings hookup for `OverlayXOffset`.

**Tasks:**

- [ ] Subscribe to `scan-state`; absolutely-position each row at `top: regionTop + centerY`, price column `left: regionRight + xOffset` (in window-local coords; map region physical px → DIP for the overlay window's display).
- [ ] `PriceRow.vue`: rounded slate plate `background: rgba(64,55,55,0.59); border-radius:6px`; divine icon if `divineValue>=1` else exalted (text `d`/`ex` fallback); price `"0.00"` (divine) / `"0.#"` (exalted) with `.` decimal always; `Multiplier>1` → `"{total} ({unit} each)"`; top row bright-green `rgb(80,255,120)` when `pricedCount>1`; "no info" dim gray; Mirror/Headhunter rows; Consolas-equivalent monospace 20 bold. (Browser compositing handles alpha — no premultiply.)
- [ ] "reading…" hint: window visible on `panelOpen||reading||debug`; decide whether to show a spinner (original drew nothing).
- [ ] Debug layer (F3): region outline orange→lime, per-row boxes (solid lime priced / dashed yellow unpriced), HUD line, `? {ocrText}` gray.
- [ ] 5 themes (Toxic default; invalid→Toxic) — only window background changes.
- **CHECKPOINT M6 (game open, panel up):** plates are genuinely semi-transparent over the game (not black), aligned to rows; totals/icons/colors correct; F3 toggles debug; theme switch persists.

---

## Milestone M7 — Hotkeys + dismiss gestures (mixed)

**Files:** Create `main/src/shortcuts/Shortcuts.ts` (adapt EE2 register/unregister-on-focus pattern + `shortcutToElectron`), `main/src/shortcuts/DismissHook.ts` (build-new uiohook chord).

**Tasks:**

- [ ] F5/F4/F3 via `globalShortcut` (registered on game `active-change(true)`, `unregisterAll` on blur); fire actions on **release** semantics where the C# does (toggle scan / open calibrator / toggle debug). Rebindable; store SharpHook-style `Vc*` names mapped through `ipc/KeyToCode.ts`; reserved keys `Escape/LeftControl/RightControl` non-bindable; collision check vs the other two actions.
- [ ] `DismissHook.ts`: `uiohook-napi` raw listeners — **Esc keydown** while overlay shown → dismiss; **Left-Ctrl held + left mouse down** → dismiss (mirror buy gesture, must not collide with the buy itself). `globalShortcut` cannot express either (Flag: needs native hook).
- [ ] Dismiss → `HideNow` (instant, off the scan loop) + `ScanEngine.requestDismiss()` latch.
- **CHECKPOINT M7 (game focused):** F5/F4/F3 fire via X11/XRecord with no KWin collision; Esc over a shown overlay hides instantly and stays hidden until panel closes; Ctrl+Click a row dismisses.

---

## Milestone M8 — Config, icon cache, tray, single-instance, diagnostics

**Files:** Create `main/src/config/{AppConfig.ts,ConfigStore.ts,AppPaths.ts}`, `main/src/assets/IconCache.ts`; adapt `AppTray.ts`; `renderer/src/settings/Settings.vue`.

**Tasks:**

- [ ] `AppConfig`/`ConfigStore`/`AppPaths`: the full schema (LeagueName default `Runes of Aldur`, RegionX/Y/W/H, OverlayXOffset 8, hotkeys `VcF5/VcF3/VcF4`, CustomPricesPath `custom_prices.json`, CaptureBackend `Auto`, Theme `Toxic`); JSON atomic temp+rename to `userData`; `AvailableLeagues` code-only (not persisted); `IsCalibrated = W>0 && H>0`.
- [ ] `IconCache`: download 4 PNGs from poecdn.com once into `userData`, fetch **in main process** (renderer CSP blocks external hosts), serve as `file://`/`data:`; failure → `d`/`ex` fallback.
- [ ] `AppTray`: adapt EE2 — minimize-to-tray (scanning continues), restore, Show/Exit, Open-in-browser; relabel; KDE StatusNotifierItem.
- [ ] `app.requestSingleInstanceLock()` + `second-instance` → focus existing.
- [ ] Crash log to `userData` + dialog on startup throw; `--ocr-test` already in M3.
- [ ] `Settings.vue`: league/theme/offset/hotkey-rebind UI pushing `update-config`.
- **CHECKPOINT M8:** config round-trips + survives `kill -9` mid-write; icons cache once; tray works in Plasma; second launch exits.

---

## Milestone M9 — Packaging (AppImage)

**Files:** `main/electron-builder.yml`, `.desktop` template, CI workflow.

**Tasks:**

- [ ] `electron-builder.yml`: `appId` (e.g. `com.exilexray.app`), `productName: ExileXRay`, `linux.target:["AppImage"]`, `linux.category:"Game"`, **`toolsets:{appimage:"1.0.3"}`**, `files` (main.js, vision.js, renderer/dist, package.json), `extraResources:[{from:'resources/cv-ocr',to:'cv-ocr'}]`, `asarUnpack:["**/node_modules/electron-overlay-window/**","**/node_modules/uiohook-napi/**"]`.
- [ ] `.desktop` `Exec=env XDG_SESSION_TYPE=x11 <AppImage> %U`; verify `app.commandLine.appendSwitch('ozone-platform','x11')` in main.
- [ ] Sandbox: rely on Fedora userns; add `--no-sandbox` fallback only if abort. **Do not** copy EE2's `--sandbox` (Flag F2).
- [ ] `@electron/rebuild -v <40.x>` in build; verify unpacked `prebuilds/*.node` in the artifact.
- [ ] (Optional) `electron-updater` + `latest-linux.yml` to GitHub Releases; requires write access to `$APPIMAGE`.
- [ ] CI: build renderer → build main → `electron-builder` for linux on tag/draft.
- **CHECKPOINT M9 (clean Fedora 44):** double-click runs (no FUSE/sandbox error); both native modules load; full app attaches + OCRs + prices live. Re-run Spike-3 criteria on the real artifact.

---

## Milestone M10 — Hardware integration pass

- [ ] Walk the **entire Functionality Map** on the target box; check off each row's verification. File any miss as a bug; fix; re-verify.
- [ ] Multi-monitor + DPI matrix (100/125/150% + negative-origin).
- [ ] Confirm current league slug for the active season (default goes stale).
- **DONE** when all 28 rows pass.

---

## Testing strategy

1. **Unit (vitest, headless, CI):** all of `core/` (M2) — the C# test tables are the oracle. No Electron import in `core/`; runs on any OS, gating every commit.
2. **OCR fixture tests:** check a few captured real-panel PNGs into the repo; `CurrencyPanelOcr.scan` asserts expected row text (allowing fuzzy recovery). Guards recognizer regressions without the game.
3. **poe.ninja contract test (Spike 4, periodic):** the 5-type header/URL/non-empty-JSON check; also catches league-name staleness.
4. **Browser-mode renderer testing:** because the renderer is a plain web app over ws, run it in a normal browser (EE2's design) to iterate on overlay/calibration UI without the game.
5. **Hardware integration (M10):** the Functionality Map checklist on Fedora/KDE/Wayland with PoE2 under Proton — the only place overlay/click-through/hotkeys/AppImage/DPI can truly be validated.

---

## Known traps (contradiction flags + top risks)

- **F1 — capture is build-new, NOT `OverlayController.screenshot()`.** EE2's copy-map calls it reuse-verbatim; the OCR dossier flags it Windows-only/untested on Linux. Use `desktopCapturer`+crop.
- **F2 — do not copy EE2's `--sandbox`.** It re-introduces the Fedora chrome-sandbox abort. Use userns or `--no-sandbox`.
- **F3 — version drift.** Pin `electron-overlay-window@4.1.0` / `uiohook-napi@1.5.5` (dossiers said 4.0.2/1.5.x).
- **F4 — poe.ninja Cloudflare.** UA/Referer spoof never proven from Linux/Electron; silent failure = empty prices = everything `?`. Verify in Spike 4; route via `net`/proxy if blocked.
- **F5 — calibrator focus-steal.** The WinForms `AttachThreadInput` grab over a fullscreen game has no proven Electron/XWayland equivalent; verify the calibration window can come to front over fullscreen PoE2.
- **F6 — follow constants, not C# comments** (StaleLimit, heartbeat, OpenBrightness comments are stale).
- **F8 — "hotkeys low-risk" is contingent** on X11 forcing holding for both processes; if Electron runs native Wayland, hooks AND overlay fail together.
- **Top risks (do the spikes):** KWin/XWayland click-through+focus (#1383) · opaque-black transparency (keep the 1000 ms delay) · BGRA/OCR accuracy · sub-region capture viability · AppImage FUSE/sandbox on Fedora 44 · native-addon ABI vs Electron 40 · DPI/scaleFactor drift.

---

## Self-review notes

- **Spec coverage:** all 28 functionality-map rows map to a milestone (M1 overlay; M2 logic; M3 capture/OCR; M4 loop; M5 calibration; M6 render; M7 hotkeys; M8 config/tray/icons/diag; M9 packaging/X11/update; M10 verify). Dropped Windows plumbing is enumerated, not silently omitted.
- **Type consistency:** `PriceEntry{divineValue,exaltedValue,hasMarketData}`, `PriceRow`, `bestFuzzy`, `tryResolveGemKey{isGem,key}`, `resolveMultiplierForDisplay`, `sampleAverage` names are used identically across M2→M4.
- **Open items the executor must confirm on hardware (not placeholders — genuine unknowns):** calibrator focus-grab over fullscreen (F5); poe.ninja reachability (F4); exact capture format if a non-`desktopCapturer` source is substituted.
