import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { uploadToR2 } from "@/lib/r2";
import { detectDocMime, detectImageMime, isAllowedImage, MAX_PIXELI } from "@/lib/utils/file-signature";
import sharp from "sharp";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
/*
 * ⚠ DOCUMENTELE AU PLAFONUL LOR, si nu din generozitate: un PDF de tipar la un metru patrat, cu
 * imagini incorporate, trece lejer de 10 MB. Cu plafonul imaginilor, campul de fisier ar fi fost o
 * capabilitate care se vede in meniu si refuza chiar fisierele pentru care exista.
 *
 * ⚠ Si ramane un plafon: capatul e PUBLIC si neautentificat, iar depozitul se plateste. 40 MB e
 * cat un PDF de tipar cinstit, si nu cat o arhiva.
 */
const MAX_SIZE_DOC = 40 * 1024 * 1024; // 40MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "application/pdf": "pdf",
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
  /*
   * ⚠ CE FEL DE CONTINUT SE ASTEAPTA, spus de campul care cere incarcarea.
   *
   * `documente` inseamna „campul e de tip `fisier`, deci accepta si PDF". Lipsa inseamna
   * IMAGINE, exact ca pana acum — deci paginile ramase deschise in browserele oamenilor si orice
   * alt apelant se poarta identic.
   *
   * ⚠ NU E O POARTA DE AUTORIZARE, si nu se preface ca ar fi: vine de la client, deci oricine
   * poate cere „documente" si urca un PDF si dintr-un camp de imagine. Ce apara asta e MARIMEA si
   * mesajul de eroare. Adevarata potrivire intre TIPUL campului si CE s-a incarcat se face la
   * COMANDA, in `verificaPersonalizarea`, unde se stie si definitia produsului — acolo un PDF
   * pus intr-un camp de imagine se refuza.
   */
  const cereDocumente = formData.get("documente") === "1";

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

  const plafon = cereDocumente ? MAX_SIZE_DOC : MAX_SIZE;
  if (file.size > plafon) {
    return NextResponse.json(
      { error: `Fisierul depaseste limita de ${Math.round(plafon / 1024 / 1024)}MB.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  /*
   * ⚠ OCTETII HOTARASC, nu antetul trimis de browser — la fel ca pana acum. Documentele se
   * recunosc printr-un ajutor SEPARAT (`detectDocMime`): `isAllowedImage` e chemat din alte
   * sase locuri care inteleg toate prin „da" ca fisierul se poate randa ca imagine.
   */
  const imagine = detectImageMime(buffer);
  const document = cereDocumente ? detectDocMime(buffer) : null;
  const detected = imagine && isAllowedImage(buffer, ALLOWED_TYPES) ? imagine : document;
  if (!detected) {
    return NextResponse.json(
      {
        error: cereDocumente
          ? "Fisierul nu e nici imagine, nici PDF."
          : "Fisierul nu este o imagine valida.",
      },
      { status: 400 },
    );
  }

  /*
   * ⚠ SI CATI PIXELI SE DESFAC DIN EI, nu doar ce fel de octeti sunt.
   *
   * Semnatura spune „e un PNG", plafonul de marime spune „are sub 10 MB" — si amandoua sunt
   * adevarate despre un PNG interlazat de 16000x16000 care se desface in peste un gigaoctet.
   * Vezi `MAX_PIXELI` pentru cifrele masurate.
   *
   * ⚠ Se opreste AICI, la intrare, nu doar la `/api/img`. Altfel bomba se scrie in depozit, si
   * de acolo o poate declansa oricine ii cere miniatura — inclusiv comerciantul care deschide
   * comanda, fara sa stie ce apasa.
   *
   * ⚠ `metadata()` citeste doar ANTETUL, nu decodeaza; iar un PDF nu are antet de imagine, deci
   * la documente se sare (verificarea lor s-a facut deja, pe octeti).
   */
  if (detected !== "application/pdf") {
    try {
      const m = await sharp(buffer).metadata();
      const pixeli = (m.width ?? 0) * (m.height ?? 0);
      if (pixeli > MAX_PIXELI) {
        return NextResponse.json(
          { error: "Imaginea are prea multi pixeli. Micsoreaz-o si incearca din nou." },
          { status: 400 },
        );
      }
    } catch {
      /*
       * ⚠ Antetul necitit inseamna REFUZ, nu „probabil e bine": pana aici s-a stabilit deja ca
       * octetii sunt ai unei imagini cunoscute, deci daca `sharp` nu-i poate citi antetul,
       * fisierul e stricat sau anume compus. Nu se pune in depozit ce nu se poate masura.
       */
      return NextResponse.json(
        { error: "Imaginea nu a putut fi citita. Incearca alt fisier." },
        { status: 400 },
      );
    }
  }

  const ext = EXT_BY_MIME[detected] ?? "jpg";
  /*
   * Numele e SINGURUL control de acces al fisierului: depozitul e public, iar
   * `/api/img` accepta si el prefixul `products`. Continutul e tocmai poza
   * personala a unui cumparator — pentru o cana, o gravura, un cadou.
   *
   * Era `Date.now()`-`Math.random()`: `Math.random()` in V8 e xorshift128+, nu
   * criptografic, deci cine incarca el insusi cateva fisiere isi vede sufixele in
   * raspuns si poate deduce starea generatorului, adica numele urmatoarelor
   * incarcari facute de pe ACEEASI instanta. `randomUUID` scoate cu totul
   * problema si e oricum conventia proiectului.
   */
  const filename = `${randomUUID()}.${ext}`;
  const key = `products/customizations/${businessId}/${filename}`;

  try {
    const url = await uploadToR2(buffer, key, detected);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[upload-customization] R2 upload failed:", err);
    return NextResponse.json({ error: "Incarcarea a esuat. Incearca din nou." }, { status: 500 });
  }
}
