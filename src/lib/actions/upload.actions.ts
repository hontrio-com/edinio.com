"use server";

import { createClient } from "@/lib/supabase/server";
import { uploadToR2, deleteFromR2, r2KeyFromUrl, createPresignedPutUrl } from "@/lib/r2";
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES, MAX_VIDEO_MB, VIDEO_EXT_BY_TYPE } from "@/lib/pages/video-config";

type UploadBucket = "logos" | "covers" | "gallery" | "products" | "avatars";

export async function uploadImage(
  file: File,
  bucket: UploadBucket,
  folder?: string
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "webp";
  const allowedTypes = ["jpg", "jpeg", "png", "webp"];
  if (!allowedTypes.includes(ext)) {
    return { error: "Tipul de fisier nu este acceptat. Foloseste JPG, PNG sau WebP." };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { error: "Fisierul este prea mare. Limita este 5MB." };
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const key = folder
    ? `${bucket}/${user.id}/${folder}/${filename}`
    : `${bucket}/${user.id}/${filename}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToR2(buffer, key, file.type);
    // Register in the Media Library (best-effort).
    const { registerMedia } = await import("@/lib/actions/media.actions");
    await registerMedia({
      url, type: "image", mimeType: file.type, fileName: file.name || null,
      sizeBytes: buffer.length, folder: bucket,
    }).catch(() => {});
    return { url };
  } catch {
    return { error: "Incarcarea a esuat. Incearca din nou." };
  }
}

/**
 * Issue a presigned URL for a direct-to-R2 video upload (custom-page video block).
 * The bytes never pass through this function, so it sidesteps the serverless
 * request-body limit. Type and size are validated here before any URL is minted,
 * and the key is namespaced under the caller's user id.
 */
export async function createVideoUpload(input: { contentType: string; size: number }):
  Promise<{ uploadUrl: string; publicUrl: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  if (!(ALLOWED_VIDEO_TYPES as readonly string[]).includes(input.contentType)) {
    return { error: "Format video neacceptat. Foloseste MP4, WebM sau MOV." };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { error: "Fisier invalid." };
  }
  if (input.size > MAX_VIDEO_BYTES) {
    return { error: `Videoclipul este prea mare. Limita este ${MAX_VIDEO_MB}MB.` };
  }

  const ext = VIDEO_EXT_BY_TYPE[input.contentType] ?? "mp4";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const key = `gallery/${user.id}/pages/videos/${filename}`;

  try {
    return await createPresignedPutUrl(key, input.contentType);
  } catch {
    return { error: "Nu am putut pregati incarcarea. Incearca din nou." };
  }
}

export async function deleteImage(url: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  const key = r2KeyFromUrl(url);
  if (!key) return { error: "URL invalid." };

  try {
    await deleteFromR2(key);
    return { success: true };
  } catch {
    return { error: "Stergerea a esuat." };
  }
}
