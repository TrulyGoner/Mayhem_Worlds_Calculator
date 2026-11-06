import { createWorker, type Worker as TesseractWorker } from "tesseract.js";

let tesseractWorker: TesseractWorker | null = null;

async function getTesseractWorker(): Promise<TesseractWorker> {
  if (tesseractWorker) return tesseractWorker;
  tesseractWorker = await createWorker("eng", 1, {
    logger: (m) => self.postMessage({ type: "progress", data: m }),
  });
  return tesseractWorker;
}

interface WorkerMessage {
  id: string;
  imageData: ArrayBuffer;
  options?: Record<string, unknown>;
}

self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const { id, imageData, options } = event.data;
  try {
    const worker = await getTesseractWorker();
    const { data } = await worker.recognize(imageData, options);
    self.postMessage({ id, result: data });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});