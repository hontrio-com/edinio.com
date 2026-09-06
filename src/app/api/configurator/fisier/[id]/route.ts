import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFromR2 } from "@/lib/r2";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { TIPURI_IMAGINE } from "@/lib/configurators/fisiere";

/**
 * Fisierul incarcat de un cumparator, servit inapoi.
 *
 * ═══ ⚠ CINE ARE VOIE SA-L VADA: CINE STIE ID-UL ═══
 *
 * Ruta NU cere sesiune, si asta e o hotarare, nu o scapare. Cine a incarcat fisierul e un
 * vizitator fara cont: n-are de ce sa fie legat dreptul de a-si vedea inapoi propria poza. Iar el
 * TREBUIE s-o vada — ca sa stie ca a mers, ca s-o decupeze, si ca s-o recunoasca in cos.
 *
 * Deci capacitatea e ID-UL, iar el e un `uuid` emis de server: 122 de biti imprevizibili, care nu
 * se pot enumera. Acelasi model ca la orice link „oricine are adresa poate vedea".
 *
 * ⚠ SI DE CE ASTA NU E MAI SLAB DECAT O SESIUNE. Alternativa — sa se ceara autentificare — n-ar
 * fi aparat pe nimeni: cumparatorul n-are cont, deci ar fi ramas fara poza lui. Iar comerciantul,
 * care ARE cont, isi vede fisierele prin aceeasi ruta, cu acelasi id, luat de pe comanda.
 *
 * ⚠ CELE DOUA PAZE ADEVARATE, si sunt independente:
 *
 *   1. **Cheia din R2 nu se poate compune din id** (semnatura HMAC din secretul serverului). Deci
 *      chiar daca un id scapa, obiectul nu se poate cere DIRECT de pe CDN, ocolind ruta asta.
 *   2. **Randul se poate sterge.** Un fisier care n-a ajuns pe nicio comanda pleaca la maturare,
 *      si atunci ruta da 404 chiar daca cineva mai are id-ul.
 *
 * ⚠ `private, no-store`: obiectul e al unui strain, si n-are voie sa fie tinut de niciun
 * intermediar si de niciun CDN. Aceeasi regula ca la avizele de transport, si din acelasi motiv.
 */

/** Cate cereri pe minut de la un IP. Generos: o pagina cu trei poze face trei cereri. */
const PE_MINUT = 120;

/**
 * Latimile la care se poate cere o imagine micsorata, prin `?lat=`.
 *
 * ═══ ⚠ CE REPARA ═══
 *
 * Fisierul se poate incarca pana la 25 MB, iar el se ARATA in trei locuri, toate mici: chipul de
 * 80×80 de sub campul cumparatorului, patratul de 56×56 din comanda comerciantului, si desenul din
 * previzualizare. Toate trei cereau ORIGINALUL. O comanda cu zece gravuri insemna, pe ecranul
 * comerciantului, pana la 250 MB descarcati ca sa se deseneze zece patrate de-o unghie — pe o
 * conexiune de telefon, o pagina care nu se mai incarca niciodata.
 *
 * ═══ ⚠ DE CE O LISTA INCHISA, SI NU ORICE NUMAR ═══
 *
 * Fiindca fiecare latime noua e o rulare de `sharp` pe o imagine de pana la 25 MB. Cu `?lat=` liber,
 * o mie de latimi cerute pe acelasi id ar fi o mie de rulari — pragul de mai sus numara cererile,
 * nu munca lor. Patru valori acopera cele trei locuri la ecrane de pana la 4x, si nimic mai mult.
 *
 * ⚠ SI NU SE SCRIE NIMIC IN R2. `/api/img` isi tine miniaturile acolo, dar galeata e cu citire
 * PUBLICA: originalul de aici e aparat tocmai fiindca cheia lui nu se poate compune, iar o
 * miniatura scrisa langa el ar fi trebuit aparata la fel. Poza unui strain nu merita a doua usa.
 */
const LATIMI = new Set([160, 320, 640, 1280]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const ip = clientIpFromHeaders(req.headers);
  /*
   * ⚠ Pragul nu apara secretul — un uuid nu se ghiceste prin incercari, nici cu milioane pe
   * secunda. Apara latimea de banda: fara el, un singur id stiut se poate cere la nesfarsit, si
   * fiecare cerere inseamna o descarcare intreaga din R2, pe socoteala noastra.
   */
  if (!rateLimit(`cfgFisierGet:${ip}`, PE_MINUT, 60_000)) {
    return NextResponse.json({ error: "Prea multe cereri." }, { status: 429 });
  }

  const { id } = await ctx.params;
  /*
   * ⚠ Forma se verifica INAINTE de interogare. `id` vine din adresa, iar PostgREST raspunde cu
   * `22P02` (sintaxa nevalida pentru uuid) la orice altceva — o eroare de server pentru ceea ce e,
   * de fapt, o cerere prostesc formulata.
   */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? "")) {
    return NextResponse.json({ error: "Fisier negasit." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("configurator_fisiere")
    .select("cheie, mime, nume")
    .eq("id", id)
    .maybeSingle();

  if (!data?.cheie) return NextResponse.json({ error: "Fisier negasit." }, { status: 404 });

  const octeti = await getFromR2(data.cheie);
  if (!octeti) return NextResponse.json({ error: "Fisier negasit." }, { status: 404 });

  /*
   * ⚠ `inline` pentru imagini, `attachment` pentru orice altceva.
   *
   * Un PDF deschis `inline` ruleaza in vizualizatorul browserului, pe originea NOASTRA. Fisierul e
   * urcat de un strain, deci exact aici nu vrem asta. Imaginile se deseneaza si nu executa nimic,
   * iar cumparatorul chiar trebuie sa-si vada poza in pagina.
   *
   * ⚠ Numele din antet se curata: el vine de la cel care a incarcat, iar ghilimelele si randurile
   * noi dintr-un `Content-Disposition` sunt chiar felul in care se sparge un antet in doua.
   */
  const numeCurat = String(data.nume ?? "fisier").replace(/[^\w.-]+/g, "_").slice(0, 80);
  const inline = data.mime !== "application/pdf";

  /*
   * ⚠ Micsorarea se face DUPA toate verificarile si NUMAI pe imagini.
   *
   * Tipul se ia din randul nostru, nu din antetul cererii, si se cere sa fie chiar unul dintre
   * cele trei pe care le primim la incarcare — nu `startsWith("image/")`. Un mime scris altfel in
   * baza n-ar trebui sa existe, dar daca ar exista, el ar ajunge la `sharp` ca „imagine".
   */
  const cerut = Number(req.nextUrl.searchParams.get("lat"));
  let corp = octeti;
  let tip = data.mime;

  if (LATIMI.has(cerut) && (TIPURI_IMAGINE as readonly string[]).includes(data.mime)) {
    try {
      corp = await sharp(octeti, { limitInputPixels: 268_402_689 })
        /*
         * ⚠ `rotate()` fara argument aplica orientarea din EXIF, si e OBLIGATORIU aici. Browserul
         * o aplica singur pe originalul JPEG; `sharp` scoate metadatele la iesire. Fara ea, poza
         * facuta cu telefonul apare culcata in miniatura si dreapta cand se deschide — iar in
         * previzualizare, culcata peste desenul comerciantului.
         */
        .rotate()
        .resize({ width: cerut, height: cerut, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      tip = "image/webp";
    } catch {
      /*
       * ⚠ Se cade INAPOI PE ORIGINAL, nu pe 500. `sharp` poate arunca pe un fisier stricat care
       * totusi are semnatura buna — la incarcare tratam la fel. O poza grea servita intreaga e
       * un necaz mic; un patrat gol in comanda comerciantului, unul mare: el nu mai vede ce a
       * cerut clientul si nu are de unde sa banuiasca de ce.
       */
      corp = octeti;
      tip = data.mime;
    }
  }

  return new NextResponse(new Uint8Array(corp), {
    headers: {
      "Content-Type": tip,
      "Content-Length": String(corp.length),
      /*
       * ⚠ Micsorata, poza pleaca ca `.webp` oricare i-ar fi fost numele: cine o salveaza cu
       * numele vechi ar avea pe disc un `poza.jpg` care nu e JPEG. Legatura de descarcare din
       * ecrane arata oricum spre ORIGINAL, fara `?lat=` — asta e doar pentru „salveaza imaginea".
       */
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${
        tip === data.mime ? numeCurat : numeCurat.replace(/\.[^.]+$/, "") + ".webp"
      }"`,
      "Cache-Control": "private, no-store",
      /*
       * ⚠ Fisierul e ales de un strain si servit de pe originea platformei. `nosniff` opreste
       * browserul sa ghiceasca alt tip decat cel scris — adica sa execute ca HTML ceva ce noi am
       * hotarat, din octeti, ca e o imagine.
       */
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
