import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFromR2 } from "@/lib/r2";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";

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

  return new NextResponse(new Uint8Array(octeti), {
    headers: {
      "Content-Type": data.mime,
      "Content-Length": String(octeti.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${numeCurat}"`,
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
