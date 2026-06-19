import { compressImage } from "@/lib/utils/compress-image";
import { createVideoUpload } from "@/lib/actions/upload.actions";
import { inferVideoType, validateVideoFile } from "@/lib/pages/video-config";

/**
 * Client-side: compress image + upload to R2 via /api/upload.
 */
export async function uploadImage(
  file: File,
  bucket: string,
  folder?: string
): Promise<{ url: string } | { error: string }> {
  try {
    // Guard against empty source files (e.g. a 0-byte stub from a cloud picker):
    // uploading these silently produces broken product images.
    if (file.size === 0) {
      return { error: "Fisierul pare gol. Alege poza din galeria dispozitivului (nu dintr-un link/cloud)." };
    }

    const compressed = await compressImage(file);
    if (compressed.size === 0) {
      return { error: "Imaginea nu a putut fi citita. Incearca alta poza sau alt dispozitiv." };
    }

    const formData = new FormData();
    formData.append("file", compressed);
    formData.append("bucket", bucket);
    if (folder) formData.append("folder", folder);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json() as { url?: string; error?: string };

    if (!res.ok || data.error) {
      return { error: data.error ?? "Incarcarea a esuat." };
    }

    return { url: data.url! };
  } catch {
    return { error: "Incarcarea a esuat. Incearca din nou." };
  }
}

/**
 * Client-side: upload a video straight to R2 via a short-lived presigned PUT URL.
 * Direct-to-storage avoids the serverless request-body limit (so larger files
 * work) and gives real upload progress. No compression — the video is stored
 * as-is; size/type are capped in validateVideoFile and re-checked server-side.
 */
export async function uploadVideo(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string } | { error: string }> {
  const contentType = inferVideoType(file.name, file.type);
  const invalid = validateVideoFile({ type: contentType, size: file.size });
  if (invalid) return { error: invalid };

  const presign = await createVideoUpload({ contentType, size: file.size });
  if ("error" in presign) return { error: presign.error };

  try {
    await putWithProgress(presign.uploadUrl, file, contentType, onProgress);
    return { url: presign.publicUrl };
  } catch {
    return { error: "Incarcarea a esuat. Verifica conexiunea si incearca din nou." };
  }
}

function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    // Must match the Content-Type signed into the presigned URL, or R2 rejects it.
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(file);
  });
}
