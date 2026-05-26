"use server";

import { createClient } from "@/lib/supabase/server";

type UploadBucket = "logos" | "covers" | "gallery" | "products" | "avatars";

export async function uploadImage(
  file: File,
  bucket: UploadBucket,
  folder?: string
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const allowedTypes = ["jpg", "jpeg", "png", "webp"];
  if (!allowedTypes.includes(ext)) {
    return { error: "Tipul de fisier nu este acceptat. Foloseste JPG, PNG sau WebP." };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { error: "Fisierul este prea mare. Limita este 2MB." };
  }

  const path = folder
    ? `${user.id}/${folder}/${Date.now()}.${ext}`
    : `${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false });

  if (error) return { error: "Incarcarea a esuat. Incearca din nou." };

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return { url: publicUrl };
}

export async function deleteImage(bucket: UploadBucket, path: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) return { error: "Stergerea a esuat." };
  return { success: true };
}
