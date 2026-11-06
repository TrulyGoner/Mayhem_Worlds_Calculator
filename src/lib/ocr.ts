import { recognizeImage, terminateOcrWorker } from "./ocr-worker-client";

export async function recognizeCard(image: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve) => image.toBlob((b) => resolve(b!), "image/png"));
  const arrayBuffer = await blob.arrayBuffer();
  const { text } = await recognizeImage(arrayBuffer, { timeout: 30000 });
  return text;
}

export { terminateOcrWorker };