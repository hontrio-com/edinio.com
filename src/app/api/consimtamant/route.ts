import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { serializeaza, validVid, VERSIUNE, type Metoda, type Stare } from "@/lib/edinio-marketing/consimtamant/stare";
import { NUME_COOKIE, atributeCookie, eCookieDeMaturat } from "@/lib/edinio-marketing/consimtamant/cookie";

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

type Corp = {
  v?: number; statistici?: boolean; marketing?: boolean; metoda?: string;
  vid?: string | null;
  /** Id-ul de STINS, trimis numai la retragere. Vezi nota de mai jos. */
  vidDeStins?: string | null;
};

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
    ═══ ⚠ DE UNDE SE IA ID-UL DE VIZITATOR, SI DE CE ALTFEL LA FIECARE CAPAT ═══

    La ACORDARE id-ul abia s-a nascut in browser si inca nu e in cookie-ul care a
    plecat cu cererea, deci se primeste din corp. Nu e nimic de aparat: omul isi
    da un id nou lui insusi.

    La RETRAGERE forma veche il citea DOAR din cookie-ul cererii, ca nimeni sa nu
    poata anula conversiile altuia postand un id ghicit.

    ⚠ NUMAI CA NU MERGEA — masurat prin citire pe 03.09.2026. Browserul scrie
    cookie-ul nou SINCRON, inainte de `fetch`; la retragere cookie-ul nou nu mai
    poarta id. Deci `dinCookie` era mereu gol pe calea de retragere si ramura de
    mai jos nu se deschidea niciodata: fara piatra de mormant, fara abandonarea
    conversiilor din coada, fara insemnare in jurnal. Cronul le trimitea inainte.

    ⚠ CE S-A ALES, si ce se pierde. Id-ul de stins vine acum din corp — dar NUMAI
    pe calea cu `marketing` fals, adica numai ca sa OPRESTI ceva. Paza care
    conteaza ramane intreaga: nimeni nu poate PORNI trimiteri pe id-ul altuia.
    Iar cine ar ghici un id de 128 de biti n-ar putea decat sa opreasca
    trimiterea conversiilor acelui om — fapta cade in partea sigura.

    ⚠ SI COOKIE-UL RAMANE PRIMUL MARTOR: daca el poarta inca un id (cerere venita
    inaintea scrierii, sau alt browser), acela e cel bun si corpul nu-l poate
    schimba. Corpul completeaza doar cand cookie-ul tace.
  */
  const dinCookie = req.cookies.get(NUME_COOKIE)?.value?.split(".")[5];
  const vid = marketing
    ? (validVid(corp.vid) ? corp.vid : (validVid(dinCookie) ? dinCookie : undefined))
    : undefined;
  const vidDeOprit = marketing
    ? undefined
    : validVid(dinCookie) ? dinCookie
    : validVid(corp.vidDeStins) ? corp.vidDeStins
    : undefined;

  const stare: Stare = {
    statistici, marketing,
    cand: Math.floor(Date.now() / 1000),
    metoda,
    ...(vid ? { vid } : {}),
  };

  /*
    ⚠ COOKIE-URILE SE ADUNA INTR-O LISTA, si raspunsul se face abia la sfarsit.

    Forma dinainte construia raspunsul aici si apoi ii adauga anteturi. De cand
    corpul raspunsului spune si daca s-a stins ceva (`retras`), el nu mai e
    cunoscut in clipa asta. Iar mutarea anteturilor de pe un raspuns pe altul e
    tocmai locul in care mai multe `Set-Cookie` se pot contopi intr-unul singur,
    despartite prin virgula — adica exact stergerile de mai jos s-ar pierde, si
    retragerea ar parea facuta.
  */
  const deTrimis: string[] = [];
  const securizat = req.nextUrl.protocol === "https:";
  deTrimis.push(`${NUME_COOKIE}=${encodeURIComponent(serializeaza(stare))}; ${atributeCookie(securizat)}`);

  /*
    ⚠ SI SE STING SI COOKIE-URILE FURNIZORILOR DE AICI, nu doar din browser.
    Unele sunt scrise pe `.edinio.com`, iar JavaScript-ul din pagina nu le poate
    sterge intotdeauna pe amandoua variantele de domeniu. Sters doar pe una,
    celalalt ramane si retragerea doar PARE facuta.
  */
  if (!marketing) {
    /*
      ⚠ SE STING SI PREFIXELE, nu doar numele intregi.

      Prima forma parcurgea numai `COOKIE_FURNIZORI_EXACTE` — deci `_ga`, `_ga_<ID>`
      si `_gcl_*` supravietuiau retragerii facute pe server. Iar `_gcl_*` e chiar
      cookie-ul care poarta `gclid`, adica id-ul clicului pe reclama Google.

      Nu se poate scrie o lista fixa: `_ga_<ID>` poarta id-ul proprietatii in
      chiar numele lui. De aceea se parcurg cookie-urile CERERII si se filtreaza
      prin aceeasi regula pe care o foloseste si browserul.
    */
    for (const c of req.cookies.getAll()) {
      if (!eCookieDeMaturat(c.name)) continue;
      deTrimis.push(`${c.name}=; Path=/; Max-Age=0${securizat ? "; Secure" : ""}`);
    }
  }

  const admin = createAdminClient();

  /*
    ⚠ SE SPUNE BROWSERULUI DACA S-A STINS CHIAR. Raspunsul ramane 200 si cand baza
    pica — alegerea e deja in vigoare, un 500 ar face-o sa para nereusita. Dar
    atunci retragerea ar trai numai in browser, iar cronul se uita in baza. Deci
    browserul primeste `retras: false`, isi noteaza restanta si reia la urmatoarea
    incarcare de pagina.
  */
  let retras = false;

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

      retras = true;

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
      ⚠ O BAZA PICATA N-ARE VOIE SA STRICE RETRAGEREA. Cookie-ul e deja pregatit
      pentru raspuns si scris in browser, deci alegerea e in vigoare oricum. Se scrie in jurnal
      si se merge mai departe — un 500 aici ar face pagina sa para ca n-a mers.
    */
    await logError({
      action: "consimtamant.scriere",
      message: e instanceof Error ? e.message : "nu s-a putut scrie hotararea",
      /*
        ⚠ „error" cand era ceva de STINS, „warning" altfel. O acordare nescrisa e
        o dovada pierduta; o RETRAGERE nescrisa inseamna ca mai plecau conversii.
        Cele doua n-au voie sa se uite la fel in jurnal.
      */
      severity: vidDeOprit ? "error" : "warning",
    });
  }

  const raspuns = NextResponse.json({ ok: true, retras });
  for (const c of deTrimis) raspuns.headers.append("Set-Cookie", c);
  return raspuns;
}
