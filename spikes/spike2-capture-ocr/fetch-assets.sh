#!/usr/bin/env bash
# Phase 0 / Spike 2 — fetch the cv-ocr WASM assets (verified reachable from Linux).
# Downloads Awakened-PoE-Trade's cv-ocr.zip (5.1 MB) and extracts the cv-ocr/
# folder next to this script. EE2's wasm-bindings loads these by file path.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="https://github.com/SnosMe/awakened-poe-trade/releases/download/v3.20.10007/cv-ocr.zip"
ZIP="$DIR/cv-ocr.zip"

echo "Downloading $URL"
curl -fSL -o "$ZIP" "$URL"
echo "Extracting into $DIR/cv-ocr"
unzip -o "$ZIP" -d "$DIR" >/dev/null
rm -f "$ZIP"

# Plan drops heist-lock.bmp (no template matching in the currency port).
rm -f "$DIR/cv-ocr/heist-lock.bmp"

echo "Done. Contents:"
ls -1 "$DIR/cv-ocr"
echo
echo "Expected: eng.traineddata, opencv.js, opencv_js.wasm,"
echo "          tesseract-core-simd.js, tesseract-core-simd.wasm"
