"use server";

import { createClient } from "@/lib/supabase/server";
import { uploadToR2, deleteFromR2, r2KeyFromUrl } from "@/lib/r2";

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
    return { url };
  } catch {
    return { error: "Incarcarea a esuat. Incearca din nou." };
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
