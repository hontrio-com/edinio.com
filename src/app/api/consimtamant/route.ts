import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { serializeaza, validVid, VERSIUNE, type Metoda, type Stare } from "@/lib/edinio-marketing/consimtamant/stare";
import { NUME_COOKIE, atributeCookie, eCookieDeMaturat } from "@/lib/edinio-marketing/consimtamant/cookie";
import { scrubLaAbandon } from "@/lib/edinio-marketing/server/coada-conversii";

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
  /** Reluare tehnica: scrie DOAR piatra de mormant, nu atinge preferintele. */
  doarPiatra?: boolean;
};

const METODE: Metoda[] = ["t", "r", "p", "w"];

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ⚠ UN PLAFON PE RUTA, SI DE CE E LARG DINADINS
  ═══════════════════════════════════════════════════════════════════════════════

  Ruta scrie in baza pe calea de retragere. Un id de vizitator are 128 de biti,
  deci nimeni nu poate ghici id-ul cuiva anume — dar pentru ABUZ nu e nevoie sa
  ghicesti: se pot trimite id-uri intamplatoare la nesfarsit si se umple tabela.

  ⚠ SI DE CE 30 PE ORA, nu 5. Plafonul asta sta pe calea prin care omul isi
  RETRAGE acordul. Un drept care se poate lovi de un plafon nu mai e un drept.
  Treizeci de raspunsuri la banner intr-o ora nu le da nici cel mai nehotarat om;
  pentru un robot, in schimb, e deja o margine.

  ⚠ CE NU E: o margine globala. `rateLimit` tine socoteala in memoria instantei,
  deci pe serverless plafonul adevarat creste cu numarul de instante calde. E o
  franare, nu un zid — si e scris aici ca sa nu creada nimeni altceva.
*/
const PE_ORA = 30;

export async function POST(req: NextRequest) {
  if (!rateLimit(`consimtamant:${clientIp(req)}`, PE_ORA, 3_600_000)) {
    return NextResponse.json({ error: "prea multe cereri" }, { status: 429 });
  }

  let corp: Corp;
  try {
    corp = (await req.json()) as Corp;
  } catch {
    return NextResponse.json({ error: "corp necitibil" }, { status: 400 });
  }

  if (corp.v !== VERSIUNE) return NextResponse.json({ error: "versiune necunoscuta" }, { status: 400 });

  /*
    ═══════════════════════════════════════════════════════════════════════════
    ⚠ RELUAREA TEHNICA: SCRIE PIATRA, NU ATINGE PREFERINTELE
    ═══════════════════════════════════════════════════════════════════════════

    ⚠ CE APARA. Reluarea porneste dintr-o restanta din `localStorage`, cand o
    scriere a cazut. Daca ar trimite si preferinte, ea ar putea SUPRASCRIE
    alegerea de acum a omului cu una veche. Scenariul viu: cineva pastreaza
    statisticile si retrage numai marketingul; reluarea de mai tarziu i-ar fi
    stins si statisticile, prin `Set-Cookie`.

    Ramura asta iese INAINTE de orice atingere a cookie-urilor. Nu scrie niciun
    `Set-Cookie` — nici pe cel de hotarare, nici stergerile de la furnizori. Aici
    se face un singur lucru: se insemneaza ca omul a retras.

    ⚠ SI PAZA RAMANE ACEEASI: se stinge, nu se porneste. Cine ar ghici un id de
    128 de biti n-ar putea decat sa OPREASCA trimiterile acelui om.
  */
  if (corp.doarPiatra === true) {
    if (!validVid(corp.vidDeStins)) {
      return NextResponse.json({ error: "id de vizitator nevalid" }, { status: 400 });
    }
    const stins = await stingeVizitatorul(corp.vidDeStins);
    return NextResponse.json({ ok: true, retras: stins });
  }
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
    ═══ ⚠ SI SE STING SI COOKIE-URILE FURNIZORILOR DE AICI, nu doar din browser ═══

    ⚠ SI PE AMANDOUA VARIANTELE DE DOMENIU. Nota de aici spunea, pana azi, ca
    serverul face tocmai lucrul pe care nu-l facea: stergea cu un singur
    `Set-Cookie` FARA `Domain`, iar acela atinge numai cookie-ul legat de gazda
    exacta. Un `_ga` scris de Google pe `.edinio.com` ramanea neatins.

    Browserul incearca de mult toate trei variantele. Serverul trimitea una. Deci
    nota promitea o plasa care nu exista — si retragerea PAREA facuta.
  */
  const gazda = req.nextUrl.hostname;
  const apex = gazda.replace(/^www\./, "");
  /*
    ⚠ FARA `Domain` PRIMUL: cookie-ul legat de gazda exacta nu se sterge cu o
    comanda care poarta `Domain`, si nici invers. Browserul le tine ca pe doua
    lucruri deosebite, deci se trimit amandoua.
  */
  const domenii = ["", `; Domain=${gazda}`, `; Domain=.${apex}`];
  /*
    ⚠ SE STING SI PREFIXELE, nu doar numele intregi.

    Prima forma parcurgea numai o lista de nume exacte — deci `_ga`, `_ga_<ID>`
    si `_gcl_*` supravietuiau retragerii facute pe server. Iar `_gcl_*` e chiar
    cookie-ul care poarta `gclid`, adica id-ul clicului pe reclama Google.

    Nu se poate scrie o lista fixa: `_ga_<ID>` poarta id-ul proprietatii in
    chiar numele lui. De aceea se parcurg cookie-urile CERERII si se filtreaza
    prin aceeasi regula pe care o foloseste si browserul.

    ⚠ SI SE INTRA MEREU AICI, nu doar cand cade marketingul. Conditia veche
    (`if (!marketing)`) sarea peste cazul „a retras doar statisticile", iar `_ga`
    ramanea scris pe server desi omul tocmai il oprise.
  */
  for (const c of req.cookies.getAll()) {
    if (!eCookieDeMaturat(c.name, { statistici, marketing })) continue;
    for (const d of domenii) {
      deTrimis.push(`${c.name}=; Path=/; Max-Age=0${securizat ? "; Secure" : ""}${d}`);
    }
  }

  /*
    ⚠ SE SPUNE BROWSERULUI DACA S-A STINS CHIAR. Raspunsul ramane 200 si cand baza
    pica — alegerea e deja in vigoare, un 500 ar face-o sa para nereusita. Dar
    atunci retragerea ar trai numai in browser, iar cronul se uita in baza. Deci
    browserul primeste `retras: false`, isi noteaza restanta si reia la urmatoarea
    incarcare de pagina.
  */
  const retras = !marketing && vidDeOprit ? await stingeVizitatorul(vidDeOprit) : false;

  const raspuns = NextResponse.json({ ok: true, retras });
  for (const c of deTrimis) raspuns.headers.append("Set-Cookie", c);
  return raspuns;
}

/**
 * Insemneaza ca omul a retras, si opreste ce n-a plecat inca.
 *
 * ⚠ INTOARCE DACA S-A SCRIS CHIAR. Browserul isi sterge restanta numai pe `true`;
 * un `false` inseamna „reia la urmatoarea pagina". De aceea nimic de aici n-are
 * voie sa raporteze izbanda pe o scriere care n-a avut loc.
 *
 * ⚠ SI DE CE NU ARUNCA MAI DEPARTE. Alegerea omului e deja in vigoare in
 * browserul lui; un 500 ar face-o sa para nereusita. Se scrie in jurnal si se
 * raspunde cinstit cu `retras: false`.
 */
async function stingeVizitatorul(vizitator: string): Promise<boolean> {
  try {
    /*
      ⚠ CLIENTUL SE FACE INAUNTRUL LUI `try`. `createAdminClient()` ARUNCA daca
      lipseste variabila de mediu; construit afara, ar fi doborat toata ruta cu
      500 — tocmai pe calea de RETRAGERE, unde raspunsul mai poarta si cookie-ul
      reconfirmat si stergerile de la furnizori.
    */
    const admin = createAdminClient();

    /*
      ═══ ⚠ `.throwOnError()`, ALTFEL `retras: true` E O MINCIUNA ═══

      ⚠ MASURAT pe 03.09.2026 cu supabase-js 2.106.1: o scriere respinsa NU
      arunca — se rezolva cu `{ data: null, error: {...} }`. Deci `catch`-ul de mai
      jos nu se deschidea, si se raporta izbanda peste o scriere care n-a avut loc.

      Iar browserul, primind `true`, isi STERGEA restanta. Adica tocmai plasa pusa
      impotriva unei baze picate se anula singura: retragerea ramanea numai in
      browser, iar cronul, care se uita in baza, trimitea mai departe.
    */
    await admin.from("edinio_consimtamant_retras").upsert(
      { vizitator, sursa: "browser" },
      { onConflict: "vizitator", ignoreDuplicates: true },
    ).throwOnError();

    /*
      ⚠ SE ABANDONEAZA CE N-A PLECAT INCA. Ce a plecat deja nu se recheama — Meta
      are o cale de stergere a datelor, TikTok n-am verificat-o. Nu se face azi si
      nu se promite; politica spune deja exact atat.

      ⚠ SI SE STERGE CONTEXTUL OMULUI de pe randurile abandonate. Ramanea intreg —
      IP, `user-agent`, `_fbp`/`_fbc`/`_ttp`, adresa de venire — si ramanea tocmai
      pe randurile celor care si-au RETRAS acordul.
    */
    const { count } = await admin.from("edinio_conversion_outbox")
      .update({
        abandonat_la: new Date().toISOString(),
        ultima_eroare: "consimtamant retras",
        ...scrubLaAbandon(),
      }, { count: "exact" })
      .eq("vizitator", vizitator)
      .is("trimis_la", null)
      .is("abandonat_la", null)
      .throwOnError();

    if (count && count > 0) {
      await logError({
        action: "consimtamant.retras",
        message: `${count} conversii nu mai pleaca: omul si-a retras acordul`,
        severity: "info",
      });
    }
    return true;
  } catch (e) {
    /*
      ⚠ O BAZA PICATA N-ARE VOIE SA STRICE RETRAGEREA. Alegerea e deja in vigoare
      in browserul omului, iar raspunsul poarta oricum cookie-urile. Se scrie in
      jurnal cu severitate `error` — o retragere nescrisa inseamna ca mai plecau
      conversii — si se raspunde cinstit cu `false`, ca browserul sa reia.
    */
    await logError({
      action: "consimtamant.scriere",
      message: e instanceof Error ? e.message : "nu s-a putut stinge vizitatorul",
      details: { vizitator },
      severity: "error",
    });
    return false;
  }
}
