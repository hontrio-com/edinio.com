import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { detectImageMime, isAllowedImage } from "@/lib/utils/file-signature";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
};

/**
 * Public endpoint for customer customization image uploads.
 * No auth required — customers are anonymous on the public store.
 * File content is validated by magic bytes (not the spoofable MIME header) and
 * the storage key is derived from a validated UUID to prevent path injection.
 */
export async function POST(request: NextRequest) {
  // Public, unauthenticated endpoint — throttle to curb storage-cost abuse.
  if (!rateLimit(`upload-customization:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Prea multe incarcari. Incearca din nou in scurt timp." }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const businessId = formData.get("business_id") as string | null;

  if (!file) {
    return NextResponse.json({ error: "Fisier obligatoriu." }, { status: 400 });
  }

  if (!businessId || !UUID_RE.test(businessId)) {
    return NextResponse.json({ error: "business_id invalid." }, { status: 400 });
  }

  /*
   * Magazinul trebuie sa EXISTE si sa fie publicat.
   *
   * Pana acum se verifica doar FORMA lui `business_id` (UUID valid), deci oricine
   * putea scrie in R2 sub `products/customizations/<uuid-inventat>/` la nesfarsit,
   * pe orice UUID. Fisierele acelea nu sunt legate de nicio comanda si nimic nu le
   * sterge vreodata (`deleteOrphanImages` e no-op explicit), deci era stocare
   * platita pe veci, fara proprietar.
   *
   * FAIL OPEN la eroare de baza, deliberat: daca Supabase clipeste, incarcarea
   * trece. Alternativa — sa raspundem 400 — ar face imaginea de personalizare sa
   * dispara in tacere din formularul de comanda (OrderModal nu arata eroarea), iar
   * la un camp obligatoriu clientul ar ramane blocat fara sa inteleaga de ce.
   * Comanda pierduta e mai scumpa decat cateva fisiere orfane.
   */
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: magazin, error } = await createAdminClient()
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("is_published", true)
      .maybeSingle();
    if (!error && !magazin) {
      return NextResponse.json({ error: "Magazin indisponibil." }, { status: 404 });
    }
  } catch {
    /* fail open — vezi comentariul de mai sus */
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fisierul depaseste limita de 10MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageMime(buffer);
  if (!detected || !isAllowedImage(buffer, ALLOWED_TYPES)) {
    return NextResponse.json({ error: "Fisierul nu este o imagine valida." }, { status: 400 });
  }

  const ext = EXT_BY_MIME[detected] ?? "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const key = `products/customizations/${businessId}/${filename}`;

  try {
    const url = await uploadToR2(buffer, key, detected);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[upload-customization] R2 upload failed:", err);
    return NextResponse.json({ error: "Incarcarea a esuat. Incearca din nou." }, { status: 500 });
  }
}
