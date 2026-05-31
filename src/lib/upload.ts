import { compressImage } from "@/lib/utils/compress-image";

/**
 * Client-side: compress image + upload to R2 via /api/upload.
 */
export async function uploadImage(
  file: File,
  bucket: string,
  folder?: string
): Promise<{ url: string } | { error: string }> {
  try {
    const compressed = await compressImage(file);

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
