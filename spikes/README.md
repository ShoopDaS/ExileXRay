# Phase 0 — De-risking spikes

These are **throwaway experiments** that convert the project's project-killing
unknowns into knowns on the real target hardware (Fedora 44 / KDE Plasma /
Wayland, PoE2 under Proton). They are **not** the final app structure — that
gets built in M1+ from the plan. Each spike is a **HARD STOP gate**: do not start
the feature milestone it blocks until its success criteria pass.

| Spike | What it de-risks | Blocks | Can Claude run it? |
|-------|------------------|--------|--------------------|
| [1 — overlay core](spike1-overlay/) | X11 overlay attach, transparency, click-through, uiohook | M1, M5, M6, M7 | ❌ needs PoE2 + display |
| [2 — capture + OCR](spike2-capture-ocr/) | BGRA capture colors, de-gated WASM OCR on Linux | M3, M4, M6 | ❌ needs panel + display |
| [3 — AppImage](spike3-appimage/) | AppImage on Fedora (no FUSE/sandbox), native addons load | M9, M1 deliverable | ❌ needs clean Fedora box |
| [4 — poe.ninja](spike4-poeninja/) | poe.ninja reachable from Linux (Cloudflare/F4) | M2 PriceRepository | ✅ **DONE — PASS** |

## Status

### ✅ Spike 4 — PASS (run on this machine, 2026-06-26)

All 5 economy types returned non-empty JSON from Linux/Node with the spoofed
Chrome UA + Referer — no Cloudflare challenge:

```
[PASS] Currency    49 items, 222ms
[PASS] Runes       142 items, 38ms
[PASS] Expedition  24 items, 32ms
[PASS] Verisium    24 items, 35ms
[PASS] UncutGems   42 items, 36ms
5/5 types reachable with non-empty JSON.  => SPIKE 4 PASS
```

Flag **F4 (poe.ninja Cloudflare)** is cleared. The default league slug
`Runes of Aldur` still returns live data, so it is not stale right now —
re-run `node spike4-poeninja/check.mjs "<current league>"` each new season to
re-confirm.

### ⏳ Spikes 1–3 — awaiting hardware validation (yours to run)

The code and exact run steps are in each folder's README. They cannot be run
here (no display / no game / no clean Fedora box). Run them on the target box
and report each STOP criterion. **Prereq for all three:** Node 24 (you have it),
plus `npx @electron/rebuild` for the native addons (Spike 1/3).

## Prerequisites on the Fedora box

```bash
# Electron pulls a prebuilt binary; native addons need a toolchain to rebuild.
sudo dnf install -y gcc-c++ make python3 unzip
# (KDE/Wayland already present on the target.)
```
