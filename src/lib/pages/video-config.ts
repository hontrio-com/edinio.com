/**
 * Shared limits + validation for direct (self-hosted) video uploads used by the
 * custom-page "video" block. Intentionally free of server-only and browser-only
 * imports so it can be consumed by BOTH the server action (presign) and the
 * client uploader without leaking either runtime into the other.
 */

export const MAX_VIDEO_MB = 50;
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

/** Accepted upload formats. MOV is included because phone recordings are common. */
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export type AllowedVideoType = (typeof ALLOWED_VIDEO_TYPES)[number];

export const VIDEO_EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function isAllowedType(type: string): type is AllowedVideoType {
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(type);
}

/**
 * Resolve a usable content type for a file. Some browsers report an empty
 * `file.type` for `.mov` (and occasionally `.mp4`), so we fall back to the
 * extension. Returns "" when the file is clearly not a supported video.
 */
export function inferVideoType(fileName: string, reportedType?: string): string {
  if (reportedType && isAllowedType(reportedType)) return reportedType;
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mov" || ext === "qt") return "video/quicktime";
  return "";
}

/** Returns a Romanian error message if the file is not an acceptable video, else null. */
export function validateVideoFile(file: { type: string; size: number }): string | null {
  if (!isAllowedType(file.type)) {
    return "Format video neacceptat. Foloseste MP4, WebM sau MOV.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Fisierul pare gol. Alege alt videoclip.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return `Videoclipul este prea mare. Limita este ${MAX_VIDEO_MB}MB.`;
  }
  return null;
}
