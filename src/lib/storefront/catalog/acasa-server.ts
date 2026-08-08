import { parseProductSections } from "@/lib/store-sections";
import { numeSubarbore, type CategorieArbore } from "@/lib/storefront/catalog/subarbore";
import { dinProiectie, proiectieDb, type RandProiectie } from "@/lib/storefront/catalog/din-proiectie";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import type { Fateta } from "@/lib/storefront/catalog/facets";

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
  categorii: CategorieArbore[];
  faraImagini: boolean;
  faraStocAscuns: boolean;
  rezumat: Rezumat;
  /** `page_content.sort_options.default_sort`, sau „newest". Vezi mai jos de ce. */
  sortareImplicita: string;
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
  preia: (r: RezultatAcasa) => void;
}): Promise<boolean> {
  const { businessId, pagina, pageContent, categorii, faraImagini, faraStocAscuns } = args;
  const db = proiectieDb();

  /*
   * Sectiunile se citesc cu ACELASI parser ca in browser, si subarborele cu
   * acelasi `numeSubarbore`. In SQL pleaca doar liste de nume, gata rezolvate:
   * regulile de sectiune raman intr-un singur loc.
   */
  const sectiuni = parseProductSections(pageContent.product_sections).filter((s) => s.enabled);
  const spec = {
    faraImagini,
    faraStocAscuns,
    // Randul „Recomandate" se cere doar cand e pornit din editor.
    featuredLimit: pageContent.show_featured_section === true ? 24 : 0,
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

  const [pagRasp, randRasp] = await Promise.all([
    db.rpc("catalog_pagina", {
      p_business: businessId,
      /*
       * Sortarea EFECTIVA, nu „niciuna".
       *
       * Pe pagina principala clientul foloseste `initialSort || default_sort`, iar
       * `default_sort` e „newest" cand nu scrie altceva. Netrimisa, serverul ar fi
       * ordonat dupa catalog si browserul dupa data — acelasi NUMAR de produse,
       * alte produse. Exact bug-ul prins la /magazin, repetat aici; de aia testul
       * diferential se ruleaza pe FIECARE suprafata, nu o data pe magazin.
       */
      p_filtre: {
        faraImagini, faraStocAscuns,
        sortare: args.sortareImplicita,
        reduceri: args.reduceri,
        categorii: args.categorie ? numeSubarbore(categorii, args.categorie) : null,
      },
      p_limit: PE_PAGINA_ACASA,
      p_offset: (pagina - 1) * PE_PAGINA_ACASA,
    }),
    db.rpc("catalog_randuri", { p_business: businessId, p_spec: spec }),
  ]);

  if (pagRasp.error || !pagRasp.data || randRasp.error || !randRasp.data) {
    console.error("[acasa] palierul server a esuat:",
      pagRasp.error?.message ?? randRasp.error?.message ?? "raspuns gol");
    return false;
  }

  const pag = pagRasp.data as { randuri: RandProiectie[]; total: number };
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
