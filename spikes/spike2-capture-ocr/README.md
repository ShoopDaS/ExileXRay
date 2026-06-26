# Spike 2 — Capture + de-gated OCR

Blocks **M3, M4, M6**. Proves BGRA capture colors are correct and EE2's
Windows-gated WASM OCR worker runs on Linux once de-gated.

## Setup

```bash
cd spikes/spike2-capture-ocr
./fetch-assets.sh          # downloads cv-ocr.zip (5.1 MB) -> ./cv-ocr  (verified reachable)
npm install                # just electron
```

## Mode A — iterate on a saved crop (no game needed)

Save a PNG of the open exchange-panel list (or screenshot one), then:

```bash
npm start -- --ocr-test /path/to/panel-crop.png
```

## Mode B — live capture of the PoE2 window (panel OPEN)

```bash
# First run with no RECT to list windows + dump capture-debug.png of the whole window:
npm start
# Then pick a rect over the currency list (x,y,width,height in the dumped image's px):
RECT="700,180,520,640" npm start
```

`capture-debug.png` is written each run — open it to eyeball colors.

## STOP — success criteria

- [ ] **(a) Colors** — `capture-debug.png` shows the panel with **correct colors,
      no red/blue swap**. (A swap also shows up as garbage OCR.)
- [ ] **(b) Latency** — the `[capture] crop ... Nms` line is **< 120 ms**.
- [ ] **(c) OCR** — recognized rows show **one readable line per visible currency
      row** (fuzzy/typo'd is fine — `viswn`, `uncot` etc. are recovered later).

## If colors are swapped

Add one line in `vision/ocr-pipeline.js` right after `cvMatFromImage`:

```js
cv.cvtColor(colorMat, colorMat, cv.COLOR_RGBA2BGRA);
```

and re-run. Note which path (`toBitmap` vs the source) needed it — that decision
carries into M3's `RegionCapture.ts`.

## Notes

- `vision/wasm-bindings.js` is EE2's `wasm-bindings.ts` ported to CJS with the
  **`process.platform !== "win32"` throw deleted** — that gate is the one line
  that kept OCR Windows-only. M3 adopts the real TS worker (+ Comlink) verbatim.
- The pipeline here (PSM 6 whole-block) is a spike stand-in for M3's
  `CurrencyPanelOcr.ts` (per-row PSM 7 + `MeanTextConf > 30`).
