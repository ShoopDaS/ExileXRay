// Phase 0 / Spike 2 — de-gated port of EE2 main/src/vision/wasm-bindings.ts.
//
// THE ONLY BEHAVIORAL CHANGE vs EE2: the `process.platform !== "win32"` throw
// in init() is DELETED (EE2 gated OCR to Windows; we enable it on Linux).
// Everything else mirrors EE2 so M3 can adopt the real worker verbatim.
//
// CommonJS so the spike runs without a build step. binDir holds the cv-ocr
// assets (tesseract-core-simd.js/.wasm, opencv.js + opencv_js.wasm, eng.traineddata).

const fs = require("fs/promises");

let tessModule;
let tessApi;
let cv;

const langMap = new Map([
  ["en", "eng"],
  ["ru", "rus"],
]);

async function init(binDir) {
  // <-- EE2's win32 gate removed here. (Spike 2's whole point: prove it works on Linux.)
  const tessInstantiate = (
    await import("file://" + binDir + "/tesseract-core-simd.js")
  ).default;
  tessModule = await tessInstantiate();
  tessApi = new tessModule.TessBaseAPI();

  const cvPromise = (await import("file://" + binDir + "/opencv.js")).default;
  cv = await cvPromise;

  module.exports.tessApi = tessApi;
  module.exports.cv = cv;
}

async function changeLanguage(lang, binDir) {
  if (!langMap.has(lang)) throw new Error("Unsupported language");
  lang = langMap.get(lang);
  const langData = await fs.readFile(binDir + `/${lang}.traineddata`);
  tessModule.FS.writeFile(`${lang}.traineddata`, langData);
  if (tessApi.Init(null, lang, tessModule.OEM_DEFAULT)) {
    throw new Error("Could not initialize tesseract.");
  }
  tessModule.FS.unlink(`${lang}.traineddata`);
}

function ocrSetImage(data, width, height, bpp) {
  const imgPtr = tessModule._malloc(data.byteLength);
  tessModule.HEAPU8.set(data, imgPtr);
  if (bpp === 0) {
    tessApi.SetImage(imgPtr, width, height, 0, Math.ceil(width / 8));
  } else {
    tessApi.SetImage(imgPtr, width, height, bpp, width * bpp);
  }
  tessModule._free(imgPtr);
}

function cvMatFromImage(img) {
  const mat = new cv.Mat(img.height, img.width, cv.CV_8UC4);
  mat.data.set(img.data);
  return mat;
}

module.exports = {
  init,
  changeLanguage,
  ocrSetImage,
  cvMatFromImage,
  get tessApi() {
    return tessApi;
  },
  get cv() {
    return cv;
  },
};
