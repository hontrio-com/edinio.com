/**
 * Client-side image compression using Canvas API.
 * Resizes to max dimensions and converts to WebP for minimal file size.
 */

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const QUALITY = 0.82;
const OUTPUT_TYPE = "image/webp";

export async function compressImage(
  file: File,
  opts?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<File> {
  const maxW = opts?.maxWidth ?? MAX_WIDTH;
  const maxH = opts?.maxHeight ?? MAX_HEIGHT;
  const quality = opts?.quality ?? QUALITY;

  // Skip SVGs — can't compress them with canvas
  if (file.type === "image/svg+xml") return file;

  // If already small enough and WebP, skip
  if (file.size < 50_000 && file.type === "image/webp") return file;

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  // Scale down if needed, keeping aspect ratio
  if (width > maxW || height > maxH) {
    const ratio = Math.min(maxW / width, maxH / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: OUTPUT_TYPE, quality });

  // Replace extension with .webp
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, { type: OUTPUT_TYPE });
}
