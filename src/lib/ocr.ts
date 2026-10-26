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

function loadTesseractBundle(src: string): Promise<void> {
  if (typeof (globalThis as unknown as { Tesseract?: unknown }).Tesseract !== "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export function recognizeCard(image: HTMLCanvasElement): Promise<string> {
  return getWorker()
    .then((worker) => worker.recognize(image))
    .then(({ data }) => data.text);
}

function getWorker(): Promise<WorkerLike> {
  if (!workerPromise) {
    const base = import.meta.env.BASE_URL;
    workerPromise = (async () => {
      await loadTesseractBundle(`${base}tesseract/tesseract.min.js`);
      return Tesseract.createWorker("eng", OEM_LSTM_ONLY, {
        workerPath: `${base}tesseract/worker.min.js`,
        corePath: `${base}tesseract/`,
        langPath: `${base}tessdata/`,
        gzip: true,
      });
    })();
  }
  return workerPromise;
}