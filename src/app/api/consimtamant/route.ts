import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { serializeaza, validVid, VERSIUNE, type Metoda, type Stare } from "@/lib/edinio-marketing/consimtamant/stare";
import { NUME_COOKIE, atributeCookie, COOKIE_FURNIZORI_EXACTE } from "@/lib/edinio-marketing/consimtamant/cookie";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  HOTARAREA, CONFIRMATA DE SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA, DESI BROWSERUL A SCRIS DEJA COOKIE-UL. Un cookie scris din
  JavaScript e taiat la 7 zile de Safari (ITP). Fara reemitere de la server,
  „refuzul se tine minte 180 de zile" ar deveni tacut „bannerul revine
  saptamanal" — adica il obosim pe om pana cedeaza. Aia nu mai e alegere libera.

  ⚠ SI DE CE E O RUTA, NU O ACTIUNE DE SERVER. Actiunile trec prin poarta MFA din
  `proxy.ts`; un om cu MFA in asteptare ar fi primit 403 tocmai pe calea de
  RETRAGERE. Un drept care se poate bloca de o alta poarta nu e un drept.
*/

type Corp = { v?: number; statistici?: boolean; marketing?: boolean; metoda?: string; vid?: string | null };

const METODE: Metoda[] = ["t", "r", "p", "w"];

export async function POST(req: NextRequest) {
  let corp: Corp;
  try {
    corp = (await req.json()) as Corp;
  } catch {
    return NextResponse.json({ error: "corp necitibil" }, { status: 400 });
  }

  if (corp.v !== VERSIUNE) return NextResponse.json({ error: "versiune necunoscuta" }, { status: 400 });
  const metoda = METODE.includes(corp.metoda as Metoda) ? (corp.metoda as Metoda) : null;
  if (!metoda) return NextResponse.json({ error: "metoda necunoscuta" }, { status: 400 });

  const statistici = corp.statistici === true;
  const marketing = corp.marketing === true;

  /*
    ⚠ ID-UL SE IA DIN COOKIE-UL CERERII, NU DIN CORP — cu o singura exceptie.

    La ACORDARE, id-ul abia s-a nascut in browser si inca nu e in cookie-ul care
    a plecat cu cererea asta, deci trebuie primit din corp; acolo nu e nimic de
    aparat, omul isi da un id nou lui insusi.

    La RETRAGERE e pe dos, si acolo sta pericolul: daca am lua id-ul din corp,
    oricine ar putea POSTa un id ghicit si ar anula conversiile ALTCUIVA. Deci se
    citeste numai din cookie-ul care a venit cu cererea.
  */
  const dinCookie = req.cookies.get(NUME_COOKIE)?.value?.split(".")[5];
  const vid = marketing
    ? (validVid(corp.vid) ? corp.vid : (validVid(dinCookie) ? dinCookie : undefined))
    : undefined;
  const vidDeOprit = validVid(dinCookie) ? dinCookie : undefined;

  const stare: Stare = {
    statistici, marketing,
    cand: Math.floor(Date.now() / 1000),
    metoda,
    ...(vid ? { vid } : {}),
  };

  const raspuns = NextResponse.json({ ok: true });
  const securizat = req.nextUrl.protocol === "https:";
  raspuns.headers.append(
    "Set-Cookie",
    `${NUME_COOKIE}=${encodeURIComponent(serializeaza(stare))}; ${atributeCookie(securizat)}`,
  );

  /*
    ⚠ SI SE STING SI COOKIE-URILE FURNIZORILOR DE AICI, nu doar din browser.
    Unele sunt scrise pe `.edinio.com`, iar JavaScript-ul din pagina nu le poate
    sterge intotdeauna pe amandoua variantele de domeniu. Sters doar pe una,
    celalalt ramane si retragerea doar PARE facuta.
  */
  if (!marketing) {
    for (const nume of COOKIE_FURNIZORI_EXACTE) {
      raspuns.headers.append("Set-Cookie", `${nume}=; Path=/; Max-Age=0${securizat ? "; Secure" : ""}`);
    }
  }

  const admin = createAdminClient();

  try {
    if (!marketing && vidDeOprit) {
      await admin.from("edinio_consimtamant_retras").upsert(
        { vizitator: vidDeOprit, sursa: "browser" },
        { onConflict: "vizitator", ignoreDuplicates: true },
      );

      /*
        ⚠ SE ABANDONEAZA CE N-A PLECAT INCA. Ce a plecat deja nu se recheama —
        Meta are o cale de stergere a datelor, TikTok n-am verificat-o. Nu se face
        azi si nu se promite; politica spune deja exact atat.
      */
      const { count } = await admin.from("edinio_conversion_outbox")
        .update({ abandonat_la: new Date().toISOString(), ultima_eroare: "consimtamant retras" }, { count: "exact" })
        .eq("vizitator", vidDeOprit)
        .is("trimis_la", null)
        .is("abandonat_la", null);

      if (count && count > 0) {
        await logError({
          action: "consimtamant.retras",
          message: `${count} conversii nu mai pleaca: omul si-a retras acordul`,
          severity: "info",
        });
      }
    }
  } catch (e) {
    /*
      ⚠ O BAZA PICATA N-ARE VOIE SA STRICE RETRAGEREA. Cookie-ul e deja scris in
      raspuns si in browser, deci alegerea e in vigoare oricum. Se scrie in jurnal
      si se merge mai departe — un 500 aici ar face pagina sa para ca n-a mers.
    */
    await logError({
      action: "consimtamant.scriere",
      message: e instanceof Error ? e.message : "nu s-a putut scrie hotararea",
      severity: "warning",
    });
  }

  return raspuns;
}
