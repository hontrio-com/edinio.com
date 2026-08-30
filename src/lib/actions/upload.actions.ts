"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { uploadToR2, createPresignedPutUrl } from "@/lib/r2";
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES, MAX_VIDEO_MB, VIDEO_EXT_BY_TYPE } from "@/lib/pages/video-config";
import { detectImageMime } from "@/lib/utils/file-signature";

type UploadBucket = "logos" | "covers" | "gallery" | "products" | "avatars";

export async function uploadImage(
  file: File,
  bucket: UploadBucket,
  folder?: string
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  if (file.size > 5 * 1024 * 1024) {
    return { error: "Fisierul este prea mare. Limita este 5MB." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) return { error: "Fisierul pare gol." };

    /*
     * Verificarea era pe EXTENSIA din numele fisierului, iar `file.type` — ales
     * tot de client — ajungea ca `Content-Type` la R2. Adica: un fisier numit
     * "poza.png" cu `type: "text/html"` era acceptat si apoi SERVIT ca HTML de pe
     * domeniul CDN al platformei. XSS stocat pe origine proprie.
     *
     * Acum decide serverul, din octeti: si ce se accepta, si ce antet se pune.
     */
    const PERMISE = ["image/jpeg", "image/png", "image/webp"];
    const tipReal = detectImageMime(buffer);
    if (!tipReal || !PERMISE.includes(tipReal)) {
      return { error: "Tipul de fisier nu este acceptat. Foloseste JPG, PNG sau WebP." };
    }
    const ext = tipReal === "image/jpeg" ? "jpg" : tipReal === "image/png" ? "png" : "webp";

    // Nume imprevizibil: obiectul e servit public din R2, deci numele lui e
    // singurul lucru care il tine nelistabil. `Math.random()` in V8 nu e
    // criptografic si isi tradeaza starea prin valorile deja returnate.
    const filename = `${randomUUID()}.${ext}`;
    const key = folder
      ? `${bucket}/${user.id}/${folder}/${filename}`
      : `${bucket}/${user.id}/${filename}`;

    const url = await uploadToR2(buffer, key, tipReal);
    // Register in the Media Library (best-effort).
    const { registerMedia } = await import("@/lib/actions/media.actions");
    await registerMedia({
      url, type: "image", mimeType: tipReal, fileName: file.name || null,
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
  // Vezi `uploadImage`: numele e singura piedica in calea ghicirii unui obiect
  // public, iar `Math.random()` nu e imprevizibil.
  const filename = `${randomUUID()}.${ext}`;
  const key = `gallery/${user.id}/pages/videos/${filename}`;

  try {
    // Dimensiunea intra in SEMNATURA. Fara ea, `input.size` era doar un numar
    // trimis de client: se cerea URL pentru 1MB si se incarca apoi orice, direct
    // in R2, ocolind complet limita de 50MB.
    return await createPresignedPutUrl(key, input.contentType, 600, input.size);
  } catch {
    return { error: "Nu am putut pregati incarcarea. Incearca din nou." };
  }
}

/*
 * `deleteImage(url)` a fost stearsa pe 05.08.2026. Nu o readuce asa cum era.
 *
 * Cerea doar o sesiune, dupa care deriva cheia R2 din URL-ul primit de la
 * apelant si o stergea — fara sa verifice al cui e obiectul. Adica orice
 * comerciant autentificat putea sterge logo-ul, coperta sau pozele de produs
 * ale oricui, daca stia URL-ul lor (si URL-urile alea sunt publice, stau in
 * HTML-ul vitrinelor). Nu era exploatabila doar fiindca nu avea niciun apelant
 * in tot src-ul, deci Turbopack n-o punea in server-reference-manifest.json si
 * Next respingea apelul inainte de codul aplicatiei; prima componenta care ar fi
 * chemat-o o transforma in stergere intre chiriasi, fara nicio urma.
 *
 * Calea corecta exista deja si e singura autoritate de stergere: `deleteMedia`
 * din src/lib/actions/media.actions.ts, care trece prin `keyOwnedBy` inainte de
 * `deleteFromR2`.
 */
