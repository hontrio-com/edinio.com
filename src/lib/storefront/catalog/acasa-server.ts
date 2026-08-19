import { parseProductSections } from "@/lib/store-sections";
import { numeSubarbore, type CategorieArbore } from "@/lib/storefront/catalog/subarbore";
import { dinProiectie, proiectieDb, type RandProiectie } from "@/lib/storefront/catalog/din-proiectie";
import { cautaPeServer, sortareLaCautare, type PaginaCautata } from "@/lib/storefront/catalog/cauta-server";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import type { Fateta } from "@/lib/storefront/catalog/facets";
import { hartaOrdine, type Asezare } from "@/lib/storefront/asezare";
import type { StoreDesign } from "@/lib/storefront/design/types";

/**
 * Pagina principala, pe palierul server: o pagina de produse plus randurile ei.
 *
 * Sta separat de `[slug]/page.tsx` fiindca fisierul ala are deja 500 de linii si
 * patru ramuri mari (magazin suspendat, un singur produs, catalog mutat, catalog
 * pe pagina). Legatura cu baza n-are ce cauta printre ele.
 *
 * Doua apeluri, nu unul: `catalog_pagina` pentru grila si `catalog_randuri`
 * pentru randurile de sectiuni. Se cer in paralel — randurile nu depind de
 * pagina, si invers.
 */

/** Cate produse pe pagina la grila din pagina principala. Vezi `PRODUCTS_PER_PAGE`. */
const PE_PAGINA_ACASA = 20;

interface Rezumat {
  total: number;
  price_min: number;
  price_max: number;
  categorii: string[];
  fatete: { jetoane?: string[]; fatete?: Fateta[] };
}

export interface RezultatAcasa {
  products: StorefrontProduct[];
  totalVizibile: number;
  totalFiltrate: number;
  featured: StorefrontProduct[];
  sectiuni: Record<string, StorefrontProduct[]>;
}

/**
 * Intoarce `true` daca a reusit. La orice esec intoarce `false` si NU scrie
 * nimic — apelantul cade pe calea veche.
 *
 * Asta e regula invatata pe pielea noastra: un RPC stricat a randat odata un
 * catalog gol, fiindca eroarea se pierdea intr-un `data: null`. Un catalog gol
 * arata a magazin fara marfa, nu a defect, deci nu-l raporteaza nimeni.
 * Palierul server e o optimizare; o optimizare n-are voie sa fie singurul drum
 * catre produse.
 */
export async function incarcaAcasaDeLaServer(args: {
  businessId: string;
  pagina: number;
  pageContent: Record<string, unknown>;
  /**
   * Designul REZOLVAT al magazinului: din el se afla ce randuri de produse se
   * cer, ca decizia sa fie aceeasi cu cea de la randare.
   */
  design: StoreDesign;
  categorii: CategorieArbore[];
  faraImagini: boolean;
  faraStocAscuns: boolean;
  rezumat: Rezumat;
  /**
   * Ordinea implicita a grilei: asezarea aleasa in editor, altfel
   * `page_content.sort_options.default_sort`, altfel „newest". Vezi mai jos de ce.
   */
  sortareImplicita: string;
  /**
   * Asezarea aleasa in editor, pentru cele doua feluri care au nevoie de mai mult
   * decat un nume: „manual" isi duce lista de id-uri, „random" samanta zilei.
   *
   * Samanta se calculeaza pe SERVER (`samantaAmestec`) si se trimite gata
   * amestecata si aici, si spre SQL. Motivul e scris pe larg in `asezare.ts`:
   * recalculata in browser ar fi rupt hidratarea, iar recalculata la fiecare
   * cerere ar fi rupt paginarea.
   */
  asezare: Asezare;
  samanta: number;
  /**
   * `?cat=` si `?sale=`, pe care pagina principala le citeste din adresa si le
   * trimite grilei ca `initialCategory`/`initialOnSale`.
   *
   * Netrimise, serverul ar fi intors catalogul intreg in timp ce browserul
   * filtra. `categorie` vine ca NUME deja rezolvat (poate sosi ca id in adresa),
   * iar subarborele se calculeaza aici, cu acelasi `numeSubarbore`.
   */
  categorie: string;
  reduceri: boolean;
  /**
   * `?q=`, brut. Pe pagina principala grila se cauta la fel ca pe pagina de
   * catalog — netransmis, serverul ar fi intors catalogul nefiltrat in timp ce
   * browserul cauta, adica exact defectul prins de trei ori la `?cat=` si la
   * sortare.
   */
  cautare: string;
  /** Sortarea ceruta EXPLICIT in adresa (`?sort=`), goala daca nu e. */
  sortareDinAdresa: string;
  /**
   * Pretul si „doar in stoc", din adresa.
   *
   * Bara de deasupra grilei paginii principale are chiar controalele astea. Pana
   * la palierul server se opreau in memoria browserului, si acolo mergeau: lista
   * era intreaga si se filtra pe loc. Acum lista vine gata filtrata din baza, deci
   * un control care nu ajunge pana aici nu poate face nimic.
   */
  pretMin: string;
  pretMax: string;
  stoc: boolean;
  preia: (r: RezultatAcasa) => void;
}): Promise<boolean> {
  const { businessId, pagina, pageContent, design, categorii, faraImagini, faraStocAscuns } = args;
  const db = proiectieDb();

  /*
   * Sectiunile se citesc cu ACELASI parser ca in browser, si subarborele cu
   * acelasi `numeSubarbore`. In SQL pleaca doar liste de nume, gata rezolvate:
   * regulile de sectiune raman intr-un singur loc.
   *
   * Ce randuri se cer din baza spune insa DESIGNUL, nu `page_content`.
   *
   * ⚠ Aici erau doua porti pentru acelasi rand. Randarea citeste `enabled` din
   * design; cererea de date citea flagul din `page_content`. Cat timp cele doua
   * spuneau acelasi lucru, mergea — dar in clipa in care comerciantul aprindea
   * „Recomandate" din editorul de design, ochiul se misca, sectiunea se declara
   * vizibila si randul ramanea gol: nimeni nu cerusera produsele.
   *
   * Designul e sursa buna fiindca el le cuprinde pe amandoua: `enabled` se
   * deriva din `page_content` cat timp editorul de design n-a spus altceva.
   * Vezi `parse.ts`.
   */
  const aprinsaInDesign = (id: string) => design.home.some((s) => s.id === id && s.enabled);
  const sectiuni = parseProductSections(pageContent.product_sections)
    .filter((s) => aprinsaInDesign(s.id));
  const spec = {
    faraImagini,
    faraStocAscuns,
    // Randul „Recomandate" se cere doar cand e pornit. `featured` e id-ul lui in
    // designul derivat (`defaults.ts`).
    featuredLimit: aprinsaInDesign("featured") ? 24 : 0,
    sectiuni: sectiuni.map((s) => ({
      id: s.id,
      mode: s.mode,
      limit: s.limit,
      productIds: s.productIds ?? [],
      categorii: s.category
        ? (s.includeSubcategories ? numeSubarbore(categorii, s.category) : [s.category])
        : [],
    })),
  };

  const filtreGrila = {
    faraImagini, faraStocAscuns,
    reduceri: args.reduceri,
    stoc: args.stoc,
    pretMin: args.pretMin,
    pretMax: args.pretMax,
    categorii: args.categorie ? numeSubarbore(categorii, args.categorie) : null,
  };
  const seCauta = args.cautare.trim().length > 0;

  const [pagRasp, randRasp] = await Promise.all([
    /*
     * Grila: cautare cand exista `?q=`, altfel pagina obisnuita.
     *
     * Sortarea EFECTIVA, nu „niciuna", si se compune ALTFEL in cele doua cazuri.
     * Fara cautare, clientul foloseste `initialSort || default_sort`. CU cautare
     * si fara `?sort=` explicit, foloseste „relevance" — fiindca `sortTouched`
     * porneste ca `!!initialSort`. Netrimisa corect, serverul ar fi ordonat dupa
     * data si browserul dupa relevanta: acelasi NUMAR de produse, alte produse.
     * Exact bug-ul prins la /magazin, apoi la sortarea de acasa, apoi la `?cat=`.
     */
    seCauta
      ? cautaPeServer({
        businessId,
        q: args.cautare,
        filtre: filtreGrila,
        sortare: sortareLaCautare(args.sortareDinAdresa),
        limit: PE_PAGINA_ACASA,
        offset: (pagina - 1) * PE_PAGINA_ACASA,
      })
      : db.rpc("catalog_pagina", {
        p_business: businessId,
        // `initialSort || default_sort`, exact ce compune browserul pe pagina
        // principala (acolo nu intra si `setari.sortareImplicita`, fiindca pagina
        // principala n-are bara de filtre a magazinului).
        p_filtre: {
          ...filtreGrila,
          sortare: args.sortareDinAdresa || args.sortareImplicita,
          /*
           * Cele doua se trimit MEREU, nu doar cand sortarea e chiar aia.
           *
           * `sortareDinAdresa` bate implicitul, deci un vizitator care alege
           * „Pret crescator" trece prin aceeasi cerere. Trimise conditionat dupa
           * sortarea efectiva, ar fi fost inca o ramura de tinut in acord cu
           * browserul — iar ele nu costa nimic: SQL le citeste doar pe ramura lor.
           */
          samanta: String(args.samanta),
          // `{ id: pozitie }`, nu tablou: vezi `hartaOrdine` — de opt ori mai
          // ieftin in `ORDER BY` pe un catalog mare, masurat.
          ordine: hartaOrdine(args.asezare.ids),
          ordineRest: args.asezare.rest,
        },
        p_limit: PE_PAGINA_ACASA,
        p_offset: (pagina - 1) * PE_PAGINA_ACASA,
      }),
    db.rpc("catalog_randuri", { p_business: businessId, p_spec: spec }),
  ]);

  /*
   * `cautaPeServer` intoarce direct pagina sau `null`; `rpc` intoarce
   * `{data, error}`. Se normalizeaza aici, ca restul functiei sa nu stie care
   * cale a mers — si ca `null` din cautare sa insemne acelasi lucru ca o eroare
   * de RPC: cade pe calea veche.
   */
  const pag = seCauta
    ? (pagRasp as PaginaCautata | null)
    : ((pagRasp as { data: unknown; error: { message: string } | null }).data as { randuri: RandProiectie[]; total: number } | null);
  const eroarePagina = seCauta
    ? null
    : (pagRasp as { error: { message: string } | null }).error;

  if (!pag || eroarePagina || randRasp.error || !randRasp.data) {
    console.error("[acasa] palierul server a esuat:",
      eroarePagina?.message ?? randRasp.error?.message ?? "raspuns gol");
    return false;
  }

  const rand = randRasp.data as { featured: RandProiectie[]; sectiuni: Record<string, RandProiectie[]> };

  args.preia({
    products: (pag.randuri ?? []).map(dinProiectie),
    totalVizibile: args.rezumat.total,
    totalFiltrate: pag.total,
    featured: (rand.featured ?? []).map(dinProiectie),
    sectiuni: Object.fromEntries(
      Object.entries(rand.sectiuni ?? {}).map(([k, v]) => [k, (v ?? []).map(dinProiectie)]),
    ),
  });
  return true;
}
