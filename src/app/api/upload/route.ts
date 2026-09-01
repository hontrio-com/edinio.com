import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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

export const runtime = "nodejs";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ALL_ALLOWED_TYPES = [...IMAGE_TYPES, "application/pdf", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_BUCKETS = ["logos", "covers", "gallery", "products", "avatars"];

/*
  Extensia cheii din R2, hotarata de tipul DETECTAT pe octeti. Aceeasi purtare ca
  in `upload-customization/route.ts`, care o facea deja corect.

  ⚠ `heic` DINADINS, nu `avif`: octetii HEIF nu au voie sa capete o extensie pe
  care `/api/img` o accepta. Vezi nota din corpul functiei.
*/
const EXT_DUPA_TIP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heic",
  "application/pdf": "pdf",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nu esti autentificat." }, { status: 401 });
  }

  // Fara plafon, un singur cont putea incarca 10MB la nesfarsit in R2-ul
  // platformei — cost care creste la nesfarsit si nu se recupereaza de nicaieri.
  //
  // Cheia principala e UTILIZATORUL: cheiat doar pe IP (cum era), un comerciant
  // care isi incarca galeria de produse golea cosul si pentru colegul de la
  // biroul de alaturi, pe aceeasi iesire NAT. Cheia pe IP ramane, cu buget mai
  // larg, fiindca doar ea mai conteaza cand cineva isi face conturi noi ca sa
  // obtina bugete noi.
  if (!rateLimit(`upload:${user.id}`, 30, 60_000) || !rateLimit(`upload-ip:${clientIp(request)}`, 100, 60_000)) {
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

    /*
      ═══ ⚠ EXTENSIA VINE DIN OCTETI, NU DIN NUMELE DAT DE CLIENT ═══

      Randul de dinainte era `file.name.split(".").pop()`, iar cheia se construia
      INAINTE de verificarea pe octeti. Asta lasa deschisa o usa care n-avea nimic
      de-a face cu ce scrie in `file.type`:

        - `detectImageMime` accepta marcile ISO-BMFF `heic|heix|heif|mif1|hevc|msf1`
          si le eticheteaza `image/heic`, care e in lista permisa
        - dar cheia primea extensia din NUME, deci aceiasi octeti HEIF puteau
          ateriza ca `products/<uid>/<uuid>.avif`
        - iar `/api/img` accepta `.avif` in KEY_RE si il da lui `sharp`, adica
          lui libheif, pe calea de DECODARE

      Deci un cont oarecare putea alege ce decodor al nostru atinge, doar
      redenumind fisierul. Acum nu mai poate: extensia o hotaraste tipul detectat.

      ⚠ ASTA TINE SI DUPA CE SE URCA `sharp`. Reparatia de versiune inchide
      defectele de azi din libheif; asta inchide DRUMUL catre el. Urmatorul CVE
      nu mai redeschide aceeasi usa.

      ⚠ SI NU SE BIZUIE PE KEY_RE. Chiar daca `.avif` ar fi scos de acolo maine,
      `sharp` adulmeca oricum octetii, nu extensia — inclusiv la `metadata()` de
      mai jos. Locul potrivit pentru paza e aici, la intrare.
    */
    const ext = EXT_DUPA_TIP[tipReal] ?? "bin";
    // Nume imprevizibil, nu `Date.now()`-`Math.random()`: depozitul e public si
    // numele tine loc de control de acces. `Math.random()` in V8 nu e criptografic,
    // iar cine isi vede propriile sufixe poate deduce starea generatorului si numele
    // incarcarilor facute in paralel de pe aceeasi instanta.
    const filename = `${randomUUID()}.${ext}`;
    const key = folder
      ? `${bucket}/${user.id}/${folder}/${filename}`
      : `${bucket}/${user.id}/${filename}`;

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
