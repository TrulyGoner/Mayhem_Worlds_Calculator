// Thin wrapper around the globally-loaded Tesseract UMD bundle
// (public/tesseract/tesseract.min.js, loaded from index.html). The worker and
// the 4 MB core are fetched lazily on first recognition; the inputs are the
// pre-cropped card canvases from screenshot.ts.
//
// A "standalone" package import under Vite would drag regenerator-runtime and
// node-fetch through the pipeline, so the runtime is deliberately not bundled.

// Tesseract.js v7 OEM.LSTM_ONLY.
const OEM_LSTM_ONLY = 1;

type WorkerLike = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
};

declare const Tesseract: {
  createWorker: (
    language: string,
    oem: number,
    options: {
      workerPath: string;
      corePath: string;
      langPath: string;
      gzip: boolean;
    },
  ) => Promise<WorkerLike>;
};

let workerPromise: Promise<WorkerLike> | null = null;

export function recognizeCard(image: HTMLCanvasElement): Promise<string> {
  return getWorker()
    .then((worker) => worker.recognize(image))
    .then(({ data }) => data.text);
}

function getWorker(): Promise<WorkerLike> {
  if (!workerPromise) {
    const base = import.meta.env.BASE_URL;
    workerPromise = Tesseract.createWorker("eng", OEM_LSTM_ONLY, {
      workerPath: `${base}tesseract/worker.min.js`,
      corePath: `${base}tesseract/`,
      langPath: `${base}tessdata/`,
      gzip: true,
    });
  }
  return workerPromise;
}