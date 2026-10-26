export type CardRegion = { x: number; y: number; w: number; h: number };

export const CARD_ROIS: readonly CardRegion[] = [
  { x: 0.02, y: 0.14, w: 0.41, h: 0.22 },
  { x: 0.02, y: 0.38, w: 0.41, h: 0.22 },
  { x: 0.02, y: 0.62, w: 0.41, h: 0.23 },
];
export const COLUMN_CROP: CardRegion = { x: 0.01, y: 0.10, w: 0.5, h: 0.80 };

const UPSCALE = 3;

export function cropCard(
  source: HTMLCanvasElement | HTMLImageElement,
  region: CardRegion,
): HTMLCanvasElement {
  const image = source instanceof HTMLImageElement;
  const width = image ? source.naturalWidth : source.width;
  const height = image ? source.naturalHeight : source.height;
  const x = Math.round(region.x * width);
  const y = Math.round(region.y * height);
  const cropWidth = Math.max(1, Math.round(region.w * width));
  const cropHeight = Math.max(1, Math.round(region.h * height));

  const output = document.createElement("canvas");
  output.width = cropWidth * UPSCALE;
  output.height = cropHeight * UPSCALE;
  const context = output.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, x, y, cropWidth, cropHeight, 0, 0, output.width, output.height);

  const frame = context.getImageData(0, 0, output.width, output.height);
  const pixels = frame.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const level = Math.max(0, Math.min(255, Math.round((gray - 60) * (255 / 140))));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = level;
  }
  context.putImageData(frame, 0, 0);
  return output;
}
export function drawRegions(
  canvas: HTMLCanvasElement,
  source: HTMLCanvasElement | HTMLImageElement,
  width: number,
  regions: readonly CardRegion[],
): void {
  const naturalWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const naturalHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const ratio = width / naturalWidth;
  canvas.width = width;
  canvas.height = Math.round(naturalHeight * ratio);
  const context = canvas.getContext("2d")!;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#ff4d4f";
  context.lineWidth = 2;
  for (const region of regions) {
    context.strokeRect(
      region.x * canvas.width,
      region.y * canvas.height,
      region.w * canvas.width,
      region.h * canvas.height,
    );
  }
}
