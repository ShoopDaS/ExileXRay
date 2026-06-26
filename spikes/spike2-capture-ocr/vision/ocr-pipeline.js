// Phase 0 / Spike 2 — minimal currency-panel OCR pipeline.
//
// This is a SPIKE-grade stand-in for the real CurrencyPanelOcr.ts (built in M3).
// Goal: prove the de-gated WASM worker produces one readable line per currency
// row from a BGRA image on Linux. The preprocessing follows the plan's recipe:
//   CV_8UC4 BGRA -> COLOR_BGR2GRAY -> upscale x3 (INTER_CUBIC)
//   -> THRESH_OTSU -> bitwise_not -> Tesseract PSM 6 -> split on newlines.

const Bindings = require("./wasm-bindings");

function preprocessToText(image) {
  const { cv, tessApi, cvMatFromImage, ocrSetImage } = Bindings;

  const colorMat = cvMatFromImage(image); // CV_8UC4, BGRA
  const work = new cv.Mat();
  try {
    // BGRA -> grayscale (uses the B/G/R channel order; if colors are swapped at
    // capture, that bug shows here as garbage OCR — see Spike 2 criterion (a)).
    cv.cvtColor(colorMat, work, cv.COLOR_BGR2GRAY);

    // Upscale x3 for small overlay text.
    cv.resize(
      work,
      work,
      new cv.Size(work.cols * 3, work.rows * 3),
      0,
      0,
      cv.INTER_CUBIC,
    );

    // Otsu binarize, then invert so it's dark-text-on-light for Tesseract.
    cv.threshold(work, work, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    cv.bitwise_not(work, work);

    ocrSetImage(work.data, work.cols, work.rows, work.channels());
    tessApi.SetVariable("tessedit_pageseg_mode", "6"); // assume a uniform block
    tessApi.Recognize();
    const text = tessApi.GetUTF8Text();
    const confidence = tessApi.MeanTextConf();
    return { text, confidence };
  } finally {
    colorMat.delete();
    work.delete();
  }
}

// Returns rows: one entry per non-empty recognized line.
function scan(image) {
  const { text, confidence } = preprocessToText(image);
  const rows = text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length >= 4); // C# MinName/MinWord length = 4
  return { rows, confidence, raw: text };
}

module.exports = { scan, preprocessToText };
