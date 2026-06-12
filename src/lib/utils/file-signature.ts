/**
 * Validates real file content by inspecting magic bytes, instead of trusting the
 * client-supplied MIME type (which is trivially spoofable). Returns the detected
 * image MIME type, or null if the bytes do not match a supported image format.
 */
export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return "image/png";

  // GIF: "GIF87a" / "GIF89a"
  if (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a") {
    return "image/gif";
  }

  // WEBP: "RIFF"...."WEBP"
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }

  // HEIC/HEIF: ISO-BMFF box "ftyp" at offset 4 with a heic/heif/mif1 brand
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    if (["heic", "heix", "heif", "mif1", "hevc", "msf1"].includes(brand)) return "image/heic";
  }

  return null;
}

export function isAllowedImage(buffer: Buffer, allowed: readonly string[]): boolean {
  const detected = detectImageMime(buffer);
  if (!detected) return false;
  // HEIC and HEIF share a signature; accept either label if either is allowed.
  if (detected === "image/heic") return allowed.includes("image/heic") || allowed.includes("image/heif");
  return allowed.includes(detected);
}
