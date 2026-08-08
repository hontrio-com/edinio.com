import type { SupabaseClient } from "@supabase/supabase-js";
import { construiesteFateteDinJetoane } from "@/lib/storefront/catalog/facets";

/**
 * Agregatele catalogului: ce trebuie sa stie pagina DESPRE TOT, ca sa poata
 * trimite doar o pagina.
 *
 * Patru lucruri de pe pagina de catalog nu se pot deriva dintr-o pagina de
 * produse, fiindca descriu intregul: fatetele cu numaratorile lor, intervalul de
 * pret care da capetele filtrului, arborele de categorii curatat la cele care
 * chiar contin produse, si numarul total. Toate se calculeaza azi in browser
 * peste tot catalogul — de aia trebuie trimis tot catalogul.
 *
 * POLITICA DE FATETE NU SE REEXPRIMA AICI. Se cheama `construiesteFateteDinJetoane`,
 * care trece prin exact aceeasi agregare ca `construiesteFatete`: aceleasi
 * praguri (o valoare cu un singur produs nu e filtru; o fateta cu o singura
 * valoare n-are ce alege), aceeasi deduplicare, aceeasi ordonare. `facets.test.ts`
 * ramane paznicul lor. Daca cineva ar rescrie regulile aici, ar aparea a doua
 * politica de fatete si ar diverge tacut.
 */

/** Cate randuri se citesc odata din proiectie. Cap PostgREST, vezi fetch-all.ts. */
const FEREASTRA = 1000;

interface RandRezumat {
  product_id: string;
  category: string | null;
  price_min: number | string;
  are_imagine: boolean;
  fara_stoc: boolean;
  fatete: string[] | null;
}

export interface RezumatCalculat {
  business_id: string;
  fara_imagini: boolean;
  fara_stoc_ascuns: boolean;
  total: number;
  price_min: number;
  price_max: number;
  categorii: string[];
  fatete: { jetoane: string[]; fatete: unknown[] };
}

/**
 * Cele PATRU combinatii de comutatoare, calculate dintr-o singura citire.
 *
 * Precalculate toate, schimbarea unui comutator din panou nu declanseaza
 * niciodata un recalcul la cerere: comerciantul apasa si vede imediat, iar
 * vizitatorul nu plateste niciodata.
 *
 * Exportata separat de scriere ca sa poata fi testata fara baza.
 */
export function rezumaRanduri(businessId: string, randuri: RandRezumat[]): RezumatCalculat[] {
  const out: RezumatCalculat[] = [];
  for (const faraImagini of [false, true]) {
    for (const faraStocAscuns of [false, true]) {
      // Exact filtrul din `visibleProducts` (MiniStoreRenderer), pe coloanele
      // proiectate: `are_imagine` in loc de `images.length`, `fara_stoc` in loc
      // de derivarea din harta catalogului.
      const vizibile = randuri.filter((r) => {
        if (faraImagini && !r.are_imagine) return false;
        if (faraStocAscuns && r.fara_stoc) return false;
        return true;
      });

      const preturi = vizibile.map((r) => Number(r.price_min)).filter((n) => Number.isFinite(n));
      const index = construiesteFateteDinJetoane(
        vizibile.map((r) => ({ id: r.product_id, fatete: r.fatete })),
      );

      out.push({
        business_id: businessId,
        fara_imagini: faraImagini,
        fara_stoc_ascuns: faraStocAscuns,
        total: vizibile.length,
        // Zero pe catalog gol, nu `Infinity`: coloana e `numeric not null`, iar
        // `Math.min()` fara argumente da `Infinity`, care nu se serializeaza.
        price_min: preturi.length ? Math.min(...preturi) : 0,
        price_max: preturi.length ? Math.max(...preturi) : 0,
        // Numele de categorie purtate de produse VIZIBILE — inclusiv cele
        // „orfane", fara rand in `categories`, pe care importurile le lasa des
        // si care au pagini adevarate in magazin.
        categorii: Array.from(new Set(vizibile.map((r) => r.category).filter((c): c is string => !!c))).sort(),
        fatete: { jetoane: index.jetoane, fatete: index.fatete },
      });
    }
  }
  return out;
}

/**
 * Citeste proiectia unui magazin, in ferestre, si calculeaza cele patru randuri.
 *
 * `marcatLa` e marcajul citit din coada. Se da mai departe pana la stergerea de la
 * final, ca sa nu se stearga marcaje puse INTRE citire si reconstructie — vezi
 * acolo. `null` inseamna „chemat direct, in afara cozii".
 */
export async function rezumaCatalog(
  admin: SupabaseClient,
  businessId: string,
  marcatLa: string | null = null,
): Promise<number> {
  const randuri: RandRezumat[] = [];
  for (let from = 0; ; from += FEREASTRA) {
    const { data, error } = await admin
      .from("catalog_produs")
      .select("product_id, category, price_min, are_imagine, fara_stoc, fatete")
      .eq("business_id", businessId)
      .order("product_id")
      .range(from, from + FEREASTRA - 1);
    if (error) {
      console.error(`[rezumat] ${businessId}: ${error.message}`);
      return 0;
    }
    const bucata = (data ?? []) as unknown as RandRezumat[];
    randuri.push(...bucata);
    if (bucata.length < FEREASTRA) break;
  }

  const rezumate = rezumaRanduri(businessId, randuri);
  const { error: eScr } = await admin.rpc("catalog_scrie_rezumat", {
    p_randuri: rezumate as unknown as Record<string, unknown>[],
  });
  if (eScr) {
    console.error(`[rezumat] scrierea pentru ${businessId} a esuat: ${eScr.message}`);
    return 0;
  }
  /*
   * Vocabularul NU se mai reface aici. Are coada lui.
   *
   * Se refacea in aceeasi trecere cu rezumatul, si asta parea firesc: depind de
   * aceleasi date. Dar nu depind de aceleasi EVENIMENTE. Rezumatul chiar depinde
   * de stoc — cele patru randuri ale lui numara produsele cu si fara stoc ascuns
   * — deci orice sincronizare de marketplace il invalideaza pe drept. Vocabularul
   * depinde numai de `cauta_norm`, pe care o schimbare de stoc n-o atinge deloc.
   *
   * Legate, fiecare schimbare de stoc refacea tot indexul de cautare al
   * magazinului: masurat pe eSAFE, 1,46 s pentru 7.827 de cuvinte si 98.661 de
   * perechi, la fiecare trecere. Cu patru sincronizari de marketplace pe minut,
   * asta e munca aruncata continuu — si creste cu marimea catalogului, adica
   * exact acolo unde doare.
   *
   * Acum `catalog_cuvinte_murdar` se marcheaza doar cand `cauta_norm` chiar s-a
   * schimbat, iar `refaCuvinteleCozii` o goleste in acelasi cron.
   */

  /*
   * Coada se goleste DOAR la succes: altfel un magazin care esueaza o data n-ar
   * mai fi recalculat niciodata.
   *
   * SI DOAR PANA LA MARCAJUL CITIT. Fara `lte`, un produs modificat intre citirea
   * cozii si scrierea rezumatului isi pierdea marcajul proaspat, iar rezumatul
   * ramanea vechi la nesfarsit — nimic nu-l mai chema inapoi. Aceeasi cursa a fost
   * reparata deja pe coada de proiectie si pe cea de vocabular; asta a ramas pe
   * dinafara, la trei randuri de cea corecta (`refaCuvinteleCozii`, mai jos).
   */
  const stergere = admin.from("catalog_rezumat_murdar").delete().eq("business_id", businessId);
  await (marcatLa ? stergere.lte("marcat_la", marcatLa) : stergere);
  return rezumate.length;
}

/**
 * Recalculeaza magazinele marcate. Chemat din acelasi cron ca proiectorul, DUPA
 * el: altfel ar rezuma randuri care tocmai urmeaza sa se schimbe.
 *
 * Putine magazine per rulare, nu o mie: recalculul citeste TOT magazinul, deci e
 * partea scumpa.
 *
 * DE LA CINCI LA DOUAZECI SI CINCI. Cinci pe minut inseamna 300 pe ora — sub
 * numarul de magazine ACTIVE la care tinteste platforma, deci coada ar fi ramas
 * permanent in urma si rezumatele ar fi imbatranit tacut. Iar partea cu adevarat
 * scumpa a trecerii — reconstructia vocabularului de cautare, 1,46 s pe eSAFE — a
 * plecat intre timp pe coada ei, care se marcheaza doar cand se schimba TEXTUL.
 * Ce ramane aici e o citire de proiectie si o agregare, adica de ordinul zecilor
 * de milisecunde pe magazin.
 */
export const MAX_REZUMATE_PE_RULARE = 25;

export async function rezumaCoada(admin: SupabaseClient, maxim = MAX_REZUMATE_PE_RULARE): Promise<number> {
  const { data, error } = await admin
    .from("catalog_rezumat_murdar")
    // `marcat_la`, nu doar id-ul: e marcajul pana la care are voie sa stearga
    // `rezumaCatalog`. Fara el, coada pierde marcajele puse intre timp.
    .select("business_id, marcat_la")
    .order("marcat_la", { ascending: true })
    .limit(maxim);
  if (error) {
    console.error("[rezumat] citirea cozii a esuat:", error.message);
    return 0;
  }
  let facute = 0;
  for (const r of (data ?? []) as unknown as { business_id: string; marcat_la: string }[]) {
    if (await rezumaCatalog(admin, r.business_id, r.marcat_la)) facute++;
  }
  return facute;
}

/**
 * Reface vocabularul magazinelor al caror TEXT s-a schimbat.
 *
 * Separat de rezumat fiindca se declanseaza altfel: rezumatul la orice schimbare
 * din catalog (stocul inclus), vocabularul doar cand se schimba `cauta_norm`.
 * Vezi nota din `rezumaCatalog`.
 *
 * Coada se goleste DOAR pana la marcajul citit: un produs redenumit intre citire
 * si reconstructie ramane marcat si se reia. Aceeasi garda ca la coada de
 * proiectie.
 */
export async function refaCuvinteleCozii(admin: SupabaseClient, maxim = MAX_REZUMATE_PE_RULARE): Promise<number> {
  const { data, error } = await admin
    .from("catalog_cuvinte_murdar")
    .select("business_id, marcat_la")
    .order("marcat_la", { ascending: true })
    .limit(maxim);
  if (error) {
    console.error("[cuvinte] citirea cozii a esuat:", error.message);
    return 0;
  }
  let facute = 0;
  for (const r of (data ?? []) as { business_id: string; marcat_la: string }[]) {
    const { error: eCuv } = await admin.rpc("catalog_reface_cuvinte", { p_business: r.business_id });
    if (eCuv) {
      console.error(`[cuvinte] ${r.business_id}: ${eCuv.message}`);
      continue;
    }
    await admin.from("catalog_cuvinte_murdar").delete()
      .eq("business_id", r.business_id).lte("marcat_la", r.marcat_la);
    facute++;
  }
  return facute;
}
