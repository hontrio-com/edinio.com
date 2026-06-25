/**
 * Turn any uploaded image into a clean, square favicon.
 *
 * Browsers render the favicon in a tiny tab slot; a non-square or oversized
 * source gets squished and looks blurry. We fit the whole image (no crop) onto
 * a transparent square canvas and export PNG — universal support (incl. Safari)
 * and preserved transparency. 192px is a multiple of 48 (Google's recommended
 * favicon size for Search results) and stays crisp on high-DPI tabs.
 */
const FAVICON_SIZE = 192;

export async function processFavicon(file: File): Promise<File> {
  // Non-images (and undecodable types) are uploaded as-is by the caller.
  if (!file.type.startsWith("image/")) return file;

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
    // Can't decode (e.g. HEIC off-Safari, or a sizeless SVG) — upload original.
    return file;
  }
  URL.revokeObjectURL(imgUrl);

  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  if (!sw || !sh) return file;

  // "contain": scale the whole image to fit inside the square, then center it,
  // leaving transparent margins on the short axis (never crops the logo).
  const scale = Math.min(FAVICON_SIZE / sw, FAVICON_SIZE / sh);
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const dx = Math.round((FAVICON_SIZE - dw) / 2);
  const dy = Math.round((FAVICON_SIZE - dh) / 2);

  let blob: Blob | null = null;
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(FAVICON_SIZE, FAVICON_SIZE);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, dx, dy, dw, dh);
      blob = await canvas.convertToBlob({ type: "image/png" });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = FAVICON_SIZE;
      canvas.height = FAVICON_SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, dx, dy, dw, dh);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    }
  } catch {
    return file;
  }

  if (!blob || blob.size === 0) return file;
  const baseName = file.name.replace(/\.[^.]+$/, "") || "icon";
  return new File([blob], `${baseName}-favicon.png`, { type: "image/png" });
}
