/**
 * Client-side image compression using Canvas API.
 * Resizes to max dimensions and converts to WebP (with JPEG fallback).
 * High quality settings optimized for ecommerce product images.
 * Supports all mobile formats: HEIC, HEIF, JPEG, PNG, WebP.
 */

const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1600;
const QUALITY = 0.92;

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
  if (file.size < 80_000 && file.type === "image/webp") return file;

  // Load image — works with HEIC/HEIF on Safari, JPEG/PNG/WebP everywhere
  const imgUrl = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Image load failed"));
      i.src = imgUrl;
    });
  } catch {
    URL.revokeObjectURL(imgUrl);
    // Can't decode (e.g. HEIC on non-Safari) — return original, server will accept it
    return file;
  }
  URL.revokeObjectURL(imgUrl);

  let { naturalWidth: width, naturalHeight: height } = img;

  // Guard against broken image dimensions
  if (!width || !height) return file;

  // Scale down if needed, keeping aspect ratio
  if (width > maxW || height > maxH) {
    const ratio = Math.min(maxW / width, maxH / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  // Try WebP first (best quality/size ratio), fall back to JPEG
  const formats: { type: string; ext: string }[] = [
    { type: "image/webp", ext: "webp" },
    { type: "image/jpeg", ext: "jpg" },
  ];

  for (const fmt of formats) {
    try {
      let blob: Blob | null = null;
      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        blob = await canvas.convertToBlob({ type: fmt.type, quality });
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), fmt.type, quality);
        });
      }
      if (blob && blob.size > 0) {
        const baseName = file.name.replace(/\.[^.]+$/, "");
        return new File([blob], `${baseName}.${fmt.ext}`, { type: fmt.type });
      }
    } catch {
      // Try next format
    }
  }

  // If all compression failed, return original file
  return file;
}
