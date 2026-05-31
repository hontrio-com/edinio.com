/**
 * Client-side image compression using Canvas API.
 * Resizes to max dimensions and converts to WebP for minimal file size.
 * Falls back to regular canvas for browsers without OffscreenCanvas (Safari <16.4).
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

  // Skip non-image files (PDFs, docs, etc.)
  if (!file.type.startsWith("image/")) return file;

  // If already small enough and WebP, skip
  if (file.size < 50_000 && file.type === "image/webp") return file;

  // Load image
  const imgUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = imgUrl;
  });
  URL.revokeObjectURL(imgUrl);

  let { naturalWidth: width, naturalHeight: height } = img;

  // Scale down if needed, keeping aspect ratio
  if (width > maxW || height > maxH) {
    const ratio = Math.min(maxW / width, maxH / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  // Use OffscreenCanvas if available, fallback to regular canvas
  let blob: Blob;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);
    blob = await canvas.convertToBlob({ type: OUTPUT_TYPE, quality });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
        OUTPUT_TYPE,
        quality
      );
    });
  }

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, { type: OUTPUT_TYPE });
}
