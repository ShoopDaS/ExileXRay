// Phase 0 / Spike 2 — capture + de-gated OCR on a real panel.
//
// STOP-gate criteria (run with PoE2's exchange panel OPEN):
//   (a) the cropped PNG shows the panel with CORRECT colors (no R/B swap)
//   (b) capture+crop latency < 120 ms on the box
//   (c) GetUTF8Text() returns one readable line per visible currency row
// If colors are swapped, add cv.cvtColor(mat,mat,COLOR_RGBA2BGRA) in the
// pipeline and re-confirm.
//
// Two modes:
//   npm start -- --ocr-test path/to/crop.png     # no game; iterate on a saved crop
//   RECT="x,y,w,h" npm start                      # live capture of the PoE2 window
//
// Assets: run ./fetch-assets.sh first (downloads cv-ocr into ./cv-ocr).

const path = require("path");
const fs = require("fs");
const { app, desktopCapturer, nativeImage, screen } = require("electron");

app.commandLine.appendSwitch("ozone-platform", "x11");
if (process.platform !== "darwin") app.disableHardwareAcceleration();

const Bindings = require("./vision/wasm-bindings");
const { scan } = require("./vision/ocr-pipeline");

const BIN_DIR = process.env.APT_DATA || path.join(__dirname, "cv-ocr");
const GAME_TITLE = process.env.GAME_TITLE || "Path of Exile 2";

function parseRect() {
  if (!process.env.RECT) return null;
  const [x, y, width, height] = process.env.RECT.split(",").map(Number);
  return { x, y, width, height };
}

async function initOcr() {
  if (!fs.existsSync(path.join(BIN_DIR, "tesseract-core-simd.js"))) {
    throw new Error(
      `cv-ocr assets not found in ${BIN_DIR}. Run ./fetch-assets.sh first.`,
    );
  }
  await Bindings.init(BIN_DIR);
  await Bindings.changeLanguage("en", BIN_DIR);
  console.log("[ocr] WASM bindings initialised (Linux, de-gated).");
}

// BGRA buffer from a nativeImage (toBitmap is BGRA on all platforms — plan §capture).
function toBgra(img) {
  const size = img.getSize();
  return { width: size.width, height: size.height, data: img.toBitmap() };
}

function runOcrAndReport(image, label) {
  const t0 = performance.now();
  const { rows, confidence, raw } = scan(image);
  const ms = Math.round(performance.now() - t0);
  console.log(`\n[ocr] ${label} — ${rows.length} rows, conf ${confidence}, ${ms}ms`);
  console.log("----- recognized rows -----");
  rows.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}: ${r}`));
  console.log("----- raw -----\n" + raw);
}

async function ocrTestMode(pngPath) {
  await initOcr();
  const img = nativeImage.createFromPath(pngPath);
  if (img.isEmpty()) throw new Error(`could not load ${pngPath}`);
  runOcrAndReport(toBgra(img), `--ocr-test ${path.basename(pngPath)}`);
}

async function captureMode() {
  await initOcr();
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const sf = display.scaleFactor;
  // Ask for full-resolution thumbnails so crop coords map to physical-ish px.
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) },
  });
  console.log("[capture] windows seen:");
  sources.forEach((s) => console.log(`   - "${s.name}"`));

  const src = sources.find((s) => s.name.includes(GAME_TITLE));
  if (!src) throw new Error(`window "${GAME_TITLE}" not found (is PoE2 running?)`);

  const t0 = performance.now();
  const rect = parseRect();
  let img = src.thumbnail;
  if (rect) img = img.crop(rect);
  const captureMs = Math.round(performance.now() - t0);

  // Dump the crop so you can eyeball colors (criterion a).
  const outPng = path.join(__dirname, "capture-debug.png");
  fs.writeFileSync(outPng, img.toPNG());
  console.log(
    `[capture] crop ${img.getSize().width}x${img.getSize().height} in ${captureMs}ms` +
      (captureMs < 120 ? " (< 120ms OK)" : " (>= 120ms - check)") +
      ` -> ${outPng}`,
  );
  if (!rect) {
    console.log(
      "[capture] no RECT set — OCR'ing the whole window. Set RECT=x,y,w,h over the list for a clean read.",
    );
  }
  runOcrAndReport(toBgra(img), "live capture");
}

app.whenReady().then(async () => {
  try {
    const testIdx = process.argv.indexOf("--ocr-test");
    if (testIdx !== -1) {
      await ocrTestMode(process.argv[testIdx + 1]);
    } else {
      await captureMode();
    }
  } catch (e) {
    console.error("[spike2] FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
