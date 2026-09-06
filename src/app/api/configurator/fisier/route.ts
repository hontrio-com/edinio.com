import { type NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToR2 } from "@/lib/r2";
import { detectImageMime } from "@/lib/utils/file-signature";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { configuratorulProdusului } from "@/lib/configurators/vitrina";
import {
  catePotOcupa, cheiaFisierului, motivulRefuzului, nodurileDeFisiere, tipurilePermise,
  MAX_OCTETI,
} from "@/lib/configurators/fisiere";
import { logError } from "@/lib/error-logger";

/**
 * Fisierul pe care il incarca un CUMPARATOR intr-un configurator.
 *
 * ═══ ⚠ SINGURA INCARCARE DIN PLATFORMA CARE NU CERE CONT ═══
 *
 * Tot ce urca azi vine de la un comerciant autentificat: poza de produs, eticheta AWB, factura.
 * `user.id` intra in cheie, si cine a urcat raspunde de ce a urcat. Aici urca vizitatorul unui
 * magazin, care n-are cont si pe care nu-l cunoaste nimeni.
 *
 * De aceea locul ala gol din lant se umple cu patru lucruri, si fiecare inchide altceva:
 *
 *   1. **Se cere un produs ADEVARAT, cu configurator ADEVARAT, cu nodul ALA de fisiere.** Fara
 *      asta, ruta ar fi fost un depozit gratuit deschis oricui: `POST` cu orice octeti si gata.
 *      Asa, cine urca trebuie sa numeasca un magazin, un produs al lui, si un camp de incarcare
 *      publicat pe el — iar limitele care se aplica sunt ale CAMPULUI aceluia.
 *   2. **Tipul se hotaraste din OCTETI**, nu din `Content-Type`, care e ales de client. Un fisier
 *      numit „poza.png" cu tip `text/html` a fost deja o data servit ca HTML de pe domeniul CDN
 *      al platformei — XSS stocat pe origine proprie (vezi `uploadImage`).
 *   3. **Doua straturi de prag**, ca la pretuirea din cos: unul in memoria instantei, care taie
 *      rafalele, si unul durabil in Postgres, fiindca instantele sunt multe si cel din memorie nu
 *      limiteaza cu adevarat nimic.
 *   4. **Randul se naste ORFAN.** `comanda_id` ramane `null` pana la plasare, iar ce nu ajunge pe
 *      o comanda se matura. Altfel oricine umple depozitul incarcand si inchizand fila.
 *
 * ⚠ CHEIA DIN R2 NU E ID-UL. R2 se serveste public prin CDN, deci o cheie ghicibila ar fi
 * insemnat ca poza incarcata de un cumparator — o dedicatie, un act, chipul cuiva — se poate cere
 * de oricine afla id-ul. Cheia poarta o semnatura HMAC din secretul serverului, si obiectul se
 * serveste doar prin ruta pereche, cu `private, no-store`.
 */

/** Cat citim din cerere inainte sa ne oprim. Peste plafon nu mai are rost sa se descarce. */
const MAX_CORP = MAX_OCTETI + 4096;

export async function POST(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);

  /*
   * ⚠ Pragurile se consuma INAINTE de a citi octetii, nu dupa.
   *
   * Verificate dupa, o rafala de cereri de 25 MB ar fi fost intai descarcata intreaga si abia
   * apoi refuzata — adica pragul ar fi aparat depozitul si deloc latimea de banda si memoria.
   */
  if (!rateLimit(`cfgFisier:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Prea multe incarcari. Asteapta un minut." }, { status: 429 });
  }
  if (!(await consumaLimita(`cfgFisier:${ip}`, 60, 3600)).permis) {
    return NextResponse.json({ error: "Prea multe incarcari. Incearca mai tarziu." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Cerere nevalida." }, { status: 400 });
  }

  const businessId = String(form.get("businessId") ?? "");
  const productId = String(form.get("productId") ?? "");
  const nodId = String(form.get("nodId") ?? "");
  const fisier = form.get("fisier");

  if (!businessId || !productId || !nodId || !(fisier instanceof File)) {
    return NextResponse.json({ error: "Cerere incompleta." }, { status: 400 });
  }
  if (fisier.size <= 0 || fisier.size > MAX_CORP) {
    return NextResponse.json({ error: "Fisierul e prea mare." }, { status: 413 });
  }

  /*
   * ⚠ CAMPUL TREBUIE SA EXISTE IN VERSIUNEA PUBLICATA, si limitele lui sunt cele care se aplica.
   *
   * `configuratorulProdusului` citeste doar versiunea ACTIVA a unui configurator ACTIV, legat de
   * produsul asta — deci nici o ciorna, nici un configurator oprit, nici unul al altui magazin.
   * Ea nu arunca niciodata: la orice necaz da `null`, iar aici asta inseamna refuz.
   */
  const cfg = await configuratorulProdusului(businessId, { id: productId, category: null });
  const nod = cfg ? nodurileDeFisiere(cfg.compilat.definitie).get(nodId) : undefined;
  if (!nod) {
    return NextResponse.json({ error: "Campul nu mai exista." }, { status: 404 });
  }

  const octeti = Buffer.from(await fisier.arrayBuffer());
  if (octeti.length === 0) {
    return NextResponse.json({ error: "Fisierul pare gol." }, { status: 400 });
  }

  /*
   * ⚠ TIPUL SE HOTARASTE DIN OCTETI. `detectImageMime` stie doar imagini; PDF-ul se recunoaste
   * aici, dupa aceeasi regula — primii octeti, nu antetul trimis de client.
   */
  const tipReal = detectImageMime(octeti)
    ?? (octeti.subarray(0, 5).toString("ascii") === "%PDF-" ? "application/pdf" : null);
  if (!tipReal || !tipurilePermise(nod).includes(tipReal)) {
    const permise = tipurilePermise(nod).join(", ");
    return NextResponse.json({ error: `Tip de fisier neacceptat. Se primesc: ${permise}.` }, { status: 415 });
  }

  /*
   * ⚠ Dimensiunile se masoara AICI, si se si pastreaza. Verificarea de la incarcare singura n-ar
   * fi ajuns: cine cheama ruta poate sari peste ea si trimite la plasarea comenzii un id vechi,
   * al altui camp, cu alta marime. La plasare se compara cu numerele pastrate, fara sa se mai
   * descarce nimic.
   *
   * ⚠ `sharp` poate arunca pe un fisier stricat care totusi are semnatura buna. Atunci ramanem
   * fara dimensiuni, si `motivulRefuzului` nu le cere — vezi nota lui.
   */
  let latime: number | null = null;
  let inaltime: number | null = null;
  if (tipReal !== "application/pdf") {
    try {
      const meta = await sharp(octeti, { limitInputPixels: 268_402_689 }).metadata();
      latime = Number.isFinite(meta.width) ? Number(meta.width) : null;
      inaltime = Number.isFinite(meta.height) ? Number(meta.height) : null;
    } catch {
      return NextResponse.json({ error: "Imaginea nu se poate citi. Incearca alt fisier." }, { status: 400 });
    }
  }

  const rau = motivulRefuzului(nod, { mime: tipReal, octeti: octeti.length, latime, inaltime });
  if (rau) return NextResponse.json({ error: rau }, { status: 400 });
  /* Perechea de siguranta a lui `motivulRefuzului`: plafonul platformei, nu al comerciantului. */
  if (octeti.length > catePotOcupa(nod)) {
    return NextResponse.json({ error: "Fisierul e prea mare." }, { status: 413 });
  }

  const id = randomUUID();
  const cheie = cheiaFisierului(businessId, id, tipReal);
  if (!cheie) return NextResponse.json({ error: "Tip de fisier neacceptat." }, { status: 415 });

  try {
    /*
     * ⚠ `private, no-store`, nu implicitul. Implicitul e `public, max-age=31536000, immutable`, si
     * e bun pentru o poza de produs. Aici obiectul e al unui strain si nu se serveste niciodata de
     * pe CDN — antetul e a doua incuietoare, pentru cazul in care cheia ar scapa vreodata.
     */
    await uploadToR2(octeti, cheie, tipReal, "private, no-store");
  } catch (e) {
    await logError({
      action: "configuratorFisier.r2", message: e instanceof Error ? e.message : "necunoscut",
      details: { businessId, productId, nodId }, severity: "error",
    });
    return NextResponse.json({ error: "Incarcarea a esuat. Incearca din nou." }, { status: 502 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("configurator_fisiere").insert({
    id,
    business_id: businessId,
    cheie,
    mime: tipReal,
    octeti: octeti.length,
    latime,
    inaltime,
    /*
     * ⚠ Numele dat de om se TAIE si nu intra in nicio cale. E doar ca sa stie atelierul ce a
     * primit („logo-final-v3.png" spune mai mult decat un uuid). Cheia din R2 nu-l foloseste.
     */
    nume: typeof fisier.name === "string" ? fisier.name.slice(0, 120) : null,
  });

  if (error) {
    await logError({
      action: "configuratorFisier.insert", message: error.message,
      details: { businessId, productId, nodId, code: error.code }, severity: "error",
    });
    return NextResponse.json({ error: "Incarcarea a esuat. Incearca din nou." }, { status: 500 });
  }

  /*
   * ⚠ Se intoarce ID-UL, niciodata cheia si niciodata o adresa de CDN. Id-ul e ce intra in
   * configuratie; din el nu se poate compune cheia.
   */
  return NextResponse.json({
    id, mime: tipReal, octeti: octeti.length, latime, inaltime,
    url: `/api/configurator/fisier/${id}`,
  });
}
