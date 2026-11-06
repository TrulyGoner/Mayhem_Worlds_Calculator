interface OcrWorker extends Worker {
  onmessage: (event: MessageEvent<OcrWorkerMessage>) => void;
}

interface OcrWorkerMessage {
  id: string;
  result?: { text: string; [key: string]: unknown };
  error?: string;
  type?: string;
  data?: unknown;
}

interface OcrOptions {
  timeout?: number;
  [key: string]: unknown;
}

let worker: OcrWorker | null = null;

export function getOcrWorker(): OcrWorker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  worker = new Worker(new URL("./ocr.worker.ts", import.meta.url), { type: "module" }) as OcrWorker;
  return worker;
}

export function terminateOcrWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

export function recognizeImage(imageData: ArrayBuffer, options: OcrOptions = {}): Promise<{ text: string }> {
  const worker = getOcrWorker();
  if (!worker) return Promise.reject(new Error("Web Workers not supported"));

  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const timeout = options.timeout || 30000;
    const timer = setTimeout(() => {
      worker.removeEventListener("message", handler);
      reject(new Error("OCR timeout"));
    }, timeout);

    const handler = (event: MessageEvent<OcrWorkerMessage>) => {
      if (event.data.id !== id) return;
      clearTimeout(timer);
      worker.removeEventListener("message", handler);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result as { text: string });
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ id, imageData, options });
  });
}