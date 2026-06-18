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
