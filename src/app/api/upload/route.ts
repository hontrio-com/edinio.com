import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2";
import { registerMedia } from "@/lib/actions/media.actions";
import { detectImageMime } from "@/lib/utils/file-signature";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";

/**
 * `folder` vine de la client si intra in cheia obiectului R2. Nefiltrat, un
 * `folder` de forma "../../products/<alt-user>" scria in prefixul ALTUI
 * comerciant. Pastram doar un segment simplu.
 */
function curataFolder(brut: string | null): string | null {
  if (!brut) return null;
  const curat = brut.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return curat.length > 0 && curat.length <= 40 ? curat : null;
}


const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ALL_ALLOWED_TYPES = [...IMAGE_TYPES, "application/pdf", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_BUCKETS = ["logos", "covers", "gallery", "products", "avatars"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nu esti autentificat." }, { status: 401 });
  }

  // Fara plafon, un singur cont putea incarca 10MB la nesfarsit in R2-ul
  // platformei — cost care creste la nesfarsit si nu se recupereaza de nicaieri.
  if (!rateLimit(`upload:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Prea multe incarcari. Asteapta un minut." }, { status: 429 });
  }
  const lim = await consumaLimita(`upload:${user.id}`, 300, 3600);
  if (!lim.permis) {
    return NextResponse.json({ error: "Ai atins limita de incarcari pe ora." }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const bucket = formData.get("bucket") as string | null;
  const folder = curataFolder(formData.get("folder") as string | null);

  if (!file || !bucket) {
    return NextResponse.json({ error: "Fisier si bucket obligatorii." }, { status: 400 });
  }

  if (!VALID_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: "Bucket invalid." }, { status: 400 });
  }

  if (!ALL_ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Tipul de fisier nu este acceptat." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fisierul este prea mare. Limita este 10MB." }, { status: 400 });
  }

  // Reject empty files: some mobile/cloud pickers hand back a 0-byte stub, which
  // would otherwise be stored as an empty object and render as a broken image.
  if (file.size === 0) {
    return NextResponse.json({ error: "Fisierul pare gol (0 octeti). Reincarca imaginea." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "webp";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const key = folder
    ? `${bucket}/${user.id}/${folder}/${filename}`
    : `${bucket}/${user.id}/${filename}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Fisierul pare gol (0 octeti). Reincarca imaginea." }, { status: 400 });
    }

    // Tipul REAL, din octeti, nu `file.type` (pe care il alege clientul). Tipul
    // declarat era si validat, si trimis mai departe ca `Content-Type` la R2 —
    // deci se putea gazdui continut arbitrar pe domeniul CDN al platformei, cu
    // un antet ales de incarcator. PDF-ul e singura exceptie non-imagine
    // acceptata si il verificam separat, tot pe octeti.
    const estePdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    const tipReal = detectImageMime(buffer) ?? (estePdf ? "application/pdf" : null);
    if (!tipReal || !ALL_ALLOWED_TYPES.includes(tipReal)) {
      return NextResponse.json(
        { error: "Continutul fisierului nu corespunde unui tip acceptat." },
        { status: 400 },
      );
    }

    const url = await uploadToR2(buffer, key, tipReal);

    // Register in the Media Library (best-effort; never blocks the upload).
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch { /* non-image (e.g. pdf) or unreadable — leave dims null */ }
    await registerMedia({
      url,
      type: "image",
      mimeType: tipReal,
      fileName: file.name || null,
      sizeBytes: buffer.length,
      width,
      height,
      folder: bucket,
    }).catch(() => {});

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[upload] R2 upload failed:", err);
    return NextResponse.json({ error: "Incarcarea a esuat. Incearca din nou." }, { status: 500 });
  }
}
