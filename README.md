# ExileXRay

A click-through price overlay for **Path of Exile 2** on Linux.

When you open the in-game currency-exchange panel, ExileXRay reads the list
off the screen with OCR, looks up live prices from [poe.ninja](https://poe.ninja),
and draws a price tag next to each row — stack totals, divine/exalted value, gem
level — without ever leaving the game.

It is a Linux port of the Windows-only C# app
[PoeAncientsPriceHelper](https://github.com/pedro-quiterio/PoeAncientsPriceHelper),
rebuilt as an Electron app and shipped as a single AppImage. The original repo is
the behavioral spec for *what* the overlay does; the runtime and distribution are
new, built on the proven [Exiled-Exchange-2](https://github.com/Kvan7/Exiled-Exchange-2)
Electron platform layer.

> **Status:** pre-implementation. The full design lives in
> [`docs/plans/2026-06-26-poe2-overlay-linux-port.md`](docs/plans/2026-06-26-poe2-overlay-linux-port.md).

## Target platform

- **Fedora 44 / KDE Plasma / Wayland session**, with PoE2 running via Steam Proton.
- The game runs as an X11 (XWayland) client, so ExileXRay forces itself to run
  under X11 too — that is what lets the transparent overlay attach to the game window.
- Shipped as a single double-clickable `.AppImage` (no libfuse2 required).

## How it works

- **Main process (Electron/Node):** overlay windowing, global hotkeys, screen
  capture, the Tesseract + OpenCV WASM OCR worker, and the pricing/detection logic
  transcribed from the original C#.
- **Renderer (Vue 3 + Vite):** draws the price plates and the calibration UI,
  talking to the main process over a localhost WebSocket.

## Hotkeys

| Key | Action |
|-----|--------|
| **F5** | Start / stop scanning |
| **F4** | Calibrate the capture region |
| **F3** | Toggle debug overlay |
| **Esc** / **Left-Ctrl + Left-Click** | Dismiss the overlay instantly |

## Development

The repository is being scaffolded per the implementation plan above. Build and
run instructions will land in `DEVELOPING.md` as the project structure comes
together.

## Acknowledgements

- [PoeAncientsPriceHelper](https://github.com/pedro-quiterio/PoeAncientsPriceHelper) — the original concept and pricing logic.
- [Exiled-Exchange-2](https://github.com/Kvan7/Exiled-Exchange-2) — the Electron overlay platform this port builds on.

## License

GPL-3.0 — see [LICENSE](LICENSE).
