import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveStoreDescription, deriveStoreTitle, parseStoreSeo, storeBaseUrl, type StoreSeo } from "@/lib/seo";
import { metadataMagazinNepublicat } from "@/lib/storefront/antet-magazin";
import { textCurat } from "@/lib/storefront/date-structurate";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import type { StoreDesign } from "@/lib/storefront/design/types";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { shopOnPage } from "@/lib/storefront/design/commerce";
import { citesteAsezare, sortareaAsezarii } from "@/lib/storefront/asezare";
import { citesteSetariMagazin } from "@/lib/storefront/catalog/shop-settings";
import { canonicalCatalog, citesteFiltreDinAdresa } from "@/lib/storefront/catalog/url";
import { canonicalPagina, metadataCatalog, titluSiDescriere } from "@/lib/storefront/catalog/date-catalog";
import { descrierePaginiiCatalog, descriereProprieCategoriei } from "@/lib/storefront/catalog/metadata-magazin";
import {
  categoriiMagazin, contextDescriere, rezumatMagazin,
  type CategoriiMagazin, type RezumatMagazin,
} from "@/lib/storefront/catalog/context-descriere";
import {
  orfaneCuProduse, preturiFaraTva, subarboreAreProduse, type ContextDescriere,
} from "@/lib/storefront/catalog/descriere-generata";

/**
 * Metadata paginii principale cand adresa ei poarta un filtru care ii schimba
 * continutul: `?cat=`, `?sale=1` sau `?page=N`.
 *
 * ═══ CE ERA STRICAT (10.09.2026) ═══
 *
 * Adresele astea primeau titlul si descrierea PAGINII PRINCIPALE, cu canonical
 * propriu. Deci `ralls.ro/?cat=Rochii` si `ralls.ro/?page=2` apareau in Google cu
 * exact textul paginii principale, `caian-textile.ro/?cat=PROSOAPE` arata canonical
 * catre o adresa care isi avea canonicalul in alta parte (lant), iar `?cat=` nu se
 * verifica deloc: `?cat=zzz-inexistent` isi era singur canonical.
 *
 * ═══ CELE SASE RAMURI ═══
 *
 *   1. Magazinul cu un singur produs: pagina principala E produsul, oricare ar fi
 *      filtrul, deci canonical = radacina, cu textul produsului.
 *   2. Categoria din `?cat=` nu exista: canonical = radacina, cu textul paginii
 *      principale. Grila nu arata nimic propriu acolo.
 *   3. Magazin CU pagina de catalog, categoria exista: canonical = pagina categoriei
 *      (`/magazin/<categorie>`), cu titlul si descrierea EI.
 *   4. Magazin CU pagina de catalog, fara `cat`: canonical = `/magazin`, cu `sale` si
 *      `page`, cu titlul si descrierea catalogului.
 *   5. Magazin FARA pagina de catalog, categoria exista: `/?cat=` E pagina categoriei.
 *      Titlul si descrierea ei, canonical cu numele REAL (nu cu id-ul sau cu literele
 *      din adresa).
 *   6. Magazin FARA pagina de catalog, fara `cat`: titlul paginii principale cu
 *      „Reduceri" sau „(pagina N)", descrierea catalogului.
 *
 * ⚠ NICIODATA `seo.description` pe ramurile 3-6: aceea e a paginii principale, si
 * exact asta era defectul. `seo` intra doar pentru `noindex` si pentru comparatia din
 * decizia 5 (`descriereProprieAPaginii`).
 *
 * ⚠ Pe ramura 3 textul se compune prin ACELASI `descrierePaginiiCatalog` ca in
 * `metadataMagazin` pentru pagina tinta: aceeasi sortare a grilei canonicalului, aceleasi
 * comutatoare, acelasi `sale`, acelasi TVA. Altfel doua adrese cu acelasi canonical s-ar
 * fi descris diferit.
 */

/**
 * Adresa paginii principale poarta un filtru care ii schimba continutul.
 *
 * Aceleasi trei chei pe care le pastra si canonicalul de dinainte: categoria,
 * reducerile si pagina. Cautarea libera (`?q=`) ramane in afara: acolo canonicalul
 * catre radacina e corect, sunt infinit de multe. Citite cu ACELASI parser ca grila.
 */
export function esteAcasaFiltrata(sp: Record<string, string | string[] | undefined>): boolean {
  const f = citesteFiltreDinAdresa(sp, []);
  return !!f.categorie.trim() || f.reduceri || f.pagina > 1;
}

/**
 * Numele REAL al categoriei din `?cat=`, sau `null` cand nu exista.
 *
 * `cat` poate purta numele (headere, footer) sau id-ul (linkurile de meniu de tip
 * categorie). Se cauta ca pe `/magazin?cat=`: dupa id, apoi dupa nume fara litere
 * mari, in lista VIZIBILA (o categorie stinsa n-are pagina). Apoi printre numele
 * purtate doar de produse, cu produse vizibile: importurile lasa des categorii care
 * nu ajung in tabel, iar acelea au pagini adevarate.
 */
export function categoriaDinAdresa(
  cat: string,
  categorii: CategoriiMagazin,
  rezumat: RezumatMagazin | null,
): string | null {
  const c = cat.trim();
  if (!c) return null;
  const mic = c.toLowerCase();
  const cuProduse = rezumat && Array.isArray(rezumat.categorii) ? new Set(rezumat.categorii) : null;
  return categorii.vizibile.find((x) => x.id === c)?.name
    ?? categorii.vizibile.find((x) => x.name.toLowerCase() === mic)?.name
    ?? orfaneCuProduse(categorii.toate, categorii.stinse, cuProduse).find((n) => n.toLowerCase() === mic)
    ?? null;
}

/**
 * Titlul paginii principale pe o adresa fara categorie (ramura 6).
 *
 * Fara el, `/?page=2` avea titlul paginii 1: acelasi titlu pe doua adrese
 * indexabile, cu continut diferit.
 */
function titluCatalogAcasa(titluAcasa: string, reduceri: boolean, pagina: number): string {
  const t = reduceri ? `Reduceri | ${titluAcasa}` : titluAcasa;
  return pagina > 1 ? `${t} (pagina ${pagina})` : t;
}

/**
 * Contextul descrierii pe un magazin FARA pagina de catalog (ramurile 5 si 6), unde grila
 * paginii principale E catalogul.
 *
 * Sortarea e a acelei grile (asezarea, apoi `default_sort`), cum o compune randarea ei
 * (`[slug]/page.tsx`). La „amestecat" si „ordinea mea" RPC-ul nu primeste samanta sau lista,
 * deci produsele numite pot fi altele decat primele din grila; textul ramane adevarat, fiindca
 * spune „Printre produse".
 *
 * ⚠ Exportata pentru `descriereAutomataCategoriei` (panoul): placeholderul editorului trebuie sa
 * fie EXACT textul de pe `/?cat=`, deci argumentele se compun intr-un singur loc, aici.
 */
export function contextPaginiiFaraCatalog(
  businessId: string,
  nume: string,
  pageContent: unknown,
  reduceri: boolean,
  faraTva: boolean,
): Promise<ContextDescriere> {
  const pc = (pageContent ?? {}) as Record<string, unknown>;
  const sortare = sortareaAsezarii(
    citesteAsezare(pc),
    (pc.sort_options as { default_sort?: string } | undefined)?.default_sort,
  );
  return contextDescriere(
    businessId,
    nume,
    pc.hide_products_without_images === true,
    pc.hide_out_of_stock_products === true,
    reduceri,
    sortare,
    faraTva,
  );
}

export async function metadataAcasaFiltrata(a: {
  business: {
    id: string; slug: string; custom_domain: string | null;
    store_name: string | null; business_name: string;
    tagline: string | null; description: string | null;
  };
  seo: StoreSeo;
  pageContent: unknown;
  /** Designul PUBLICAT: daca exista pagina de catalog, subtitlul si sortarea ei. */
  design: StoreDesign;
  /** `preturiFaraTva(store_settings)`. */
  faraTva: boolean;
  sp: Record<string, string | string[] | undefined>;
  /** Ce spune despre sine pagina principala (a magazinului, sau a produsului unic). */
  acasa: { titlu: string; descriere: string; imagini: string[] };
  unSingurProdus: boolean;
}): Promise<Metadata> {
  // When a custom domain is configured, consolidate SEO to it (so edinio.com/slug
  // also points its canonical at the store's own domain).
  const radacina = storeBaseUrl(a.business);
  const displayName = a.business.store_name ?? a.business.business_name;
  const noindexMagazin = !!a.seo.noindex;
  const caPaginaPrincipala = () => metadataCatalog({
    titlu: a.acasa.titlu,
    descriere: a.acasa.descriere,
    displayName,
    url: radacina,
    indexabila: true,
    noindex: noindexMagazin,
    images: a.acasa.imagini,
  });

  // Ramura 1: modul „un singur produs" nu are catalog; pagina principala e produsul.
  if (a.unSingurProdus) return caPaginaPrincipala();

  const filtre = citesteFiltreDinAdresa(a.sp, []);
  const pc = (a.pageContent ?? {}) as Record<string, unknown>;
  const faraImagini = pc.hide_products_without_images === true;
  const faraStocAscuns = pc.hide_out_of_stock_products === true;
  const id = a.business.id;

  let nume = "";
  let faraProduse = false;
  if (filtre.categorie.trim()) {
    const [categorii, rezumat] = await Promise.all([
      categoriiMagazin(id),
      rezumatMagazin(id, faraImagini, faraStocAscuns),
    ]);
    nume = categoriaDinAdresa(filtre.categorie, categorii, rezumat) ?? "";
    // Ramura 2: categoria nu exista. Canonical catre radacina, nu catre ea insasi:
    // altfel orice sir scris in adresa devenea o pagina de sine statatoare.
    if (!nume) return caPaginaPrincipala();
    // Decizia 6, pe forma veche a paginii de categorie: aceeasi regula ca pe
    // `/magazin/<categorie>` si ca in sitemap.
    faraProduse = subarboreAreProduse(categorii.vizibile, nume, rezumat?.categorii) === false;
  }

  /*
   * Cand catalogul are si pagina lui, versiunile FILTRATE ale paginii principale
   * arata canonical catre ea.
   *
   * `/?cat=Manusi` si `/magazin?cat=Manusi` listeaza aceleasi produse. Lasate
   * amandoua auto-canonice, Google ar fi ales singur intre ele si ar fi impartit
   * semnalul de link in doua. Canonicalul e exact unealta pentru asta: cele doua
   * adrese raman functionale pentru vizitator, dar una singura se indexeaza.
   *
   * Pagina principala NEfiltrata isi pastreaza canonicalul ei: nu e un duplicat,
   * are hero, randuri alese si restul sectiunilor pe langa grila.
   *
   * ⚠ Direct catre `/magazin/<categorie>`, nu catre `/magazin?cat=`: aceea isi are la
   * randul ei canonicalul pe pagina categoriei, deci ar fi fost un lant.
   */
  if (shopOnPage(a.design)) {
    // Ramurile 3 si 4. Textul e al paginii tinta, prin ACELASI `descrierePaginiiCatalog`
    // ca `metadataMagazin` si ca `CollectionPage`-ul ei.
    const { url, indexabila } = canonicalPagina(radacina, nume, a.sp);
    const { context, descriereProprie } = await descrierePaginiiCatalog({
      businessId: id,
      numeCategorie: nume,
      pageContent: a.pageContent,
      sp: a.sp,
      setari: citesteSetariMagazin(a.design),
      faraTva: a.faraTva,
      seo: a.seo,
      business: a.business,
      displayName,
    });
    const { titlu, descriere } = titluSiDescriere(nume, displayName, context, descriereProprie);
    return metadataCatalog({
      titlu, descriere, displayName, url, indexabila,
      noindex: noindexMagazin || faraProduse,
      images: a.acasa.imagini,
    });
  }

  /*
   * Ramurile 5 si 6: fara pagina de catalog, grila paginii principale E catalogul.
   *
   * Canonicalul urmeaza filtrele care CHIAR schimba continutul.
   *
   * Paginile 2..N, categoriile si reducerile sunt adrese crawlabile, cu produse
   * diferite; toate aratau catre radacina, deci Google le vedea ca duplicate ale
   * primei pagini si nu indexa niciuna. Cautarea libera (?q=) ramane in afara:
   * acolo canonicalul catre radacina e corect, sunt infinit de multe.
   *
   * Codificarea e cea din linkuri (`encodeURIComponent`, prin `canonicalCatalog`), nu
   * cea din `URLSearchParams`: aceea scrie spatiile cu `+`, deci canonicalul ar arata
   * catre alta adresa decat cea pe care a crawlat-o Google.
   *
   * ⚠ ETAPA 2: pe ramura 5 castiga si aici textul scris de comerciant pe categorie, ca pe
   * `/magazin/<categorie>`. Pana acum apelul de mai jos nu primea al patrulea argument, deci
   * la magazinele fara pagina de catalog textul lui n-ar fi ajuns nicaieri. Pe ramura 6 nu e
   * nicio categorie (`null`), iar pe `?sale=1` regula din `descrierePaginii` il lasa deoparte.
   */
  const [context, descriereCategorie] = await Promise.all([
    contextPaginiiFaraCatalog(id, nume, a.pageContent, filtre.reduceri, a.faraTva),
    descriereProprieCategoriei(id, nume),
  ]);
  const { url, indexabila } = canonicalCatalog(radacina, { ...a.sp, cat: nume || undefined });
  const { titlu, descriere } = titluSiDescriere(nume, displayName, context, descriereCategorie);
  return metadataCatalog({
    titlu: nume ? titlu : titluCatalogAcasa(a.acasa.titlu, filtre.reduceri, filtre.pagina),
    descriere,
    displayName,
    url,
    indexabila,
    noindex: noindexMagazin || faraProduse,
    images: a.acasa.imagini,
  });
}

/** Coloanele din `store_settings` pe care le citeste metadata paginii principale. */
type SetariMetadata = {
  page_content: unknown;
  storefront_design?: unknown;
  vat_enabled?: boolean | null;
  prices_include_vat?: boolean | null;
};

/** Ce foloseste metadata din produsul magazinului „un singur produs" (`getStoreProduct`). */
export interface ProdusUnicMetadata {
  name: string;
  description: string | null;
  images: unknown;
  page_sections: unknown;
}

/**
 * Metadata paginii principale (`[slug]/page.tsx`), cu adresa filtrata sau nu.
 *
 * ═══ DE CE E AICI, SI NU IN PAGINA ═══
 *
 * Corpul statea in `generateMetadata` din `[slug]/page.tsx`, un `.tsx` care nu se poate
 * rula in probe. Proba de sursa numara apelurile lui `metadataAcasaFiltrata`, dar nu vedea
 * GARDA dinaintea lor. `esteAcasaFiltrata(sp) && false` (adresele filtrate primeau iar
 * titlul si descrierea paginii principale) sau `if (!filtrata)` (pagina principala
 * NEfiltrata a oricarui magazin cu pagina de catalog primea canonical catre `/magazin`,
 * cu titlul „Toate produsele") treceau de tsc, de probe si de build. Aici se ruleaza, pe o
 * baza de proba (`metadata-acasa.test.ts`).
 *
 * `incarcaProdus` e `getStoreProduct` in aplicatie: randarea il cere cu aceleasi
 * argumente, iar `cache()` il da o singura data. E PRIMIT, nu importat, fiindca citeste
 * cu clientul vizitatorului (cookie-uri), care nu exista in afara unei cereri.
 */
export async function metadataPaginiiPrincipale(a: {
  slug: string;
  sp: Record<string, string | string[] | undefined>;
  incarcaProdus: (businessId: string, productId: string) => Promise<ProdusUnicMetadata | null>;
}): Promise<Metadata> {
  const { slug, sp } = a;
  // Read via the service role: the SEO overrides live in store_settings, which
  // is no longer anon-readable, so a nested anon select would return null there.
  const { data: business } = await createAdminClient()
    .from("businesses")
    // Coloanele de TVA: pe adresele filtrate, descrierea scrie „fără TVA" langa pret
    // cand preturile magazinului sunt fara TVA (`preturiFaraTva`).
    .select("id, business_name, store_name, tagline, description, store_city, cover_url, custom_domain, is_published, store_settings(page_content, storefront_design, vat_enabled, prices_include_vat)")
    .eq("slug", slug)
    .single();
  if (!business) return {};

  /*
   * Vitrina NEPUBLICATA raspunde 200 (ecranul „in curand disponibil"), deci
   * metadata ei trebuie sa spuna explicit `noindex`: altfel magazinele in lucru
   * intra in indexul Google ca pagini goale si raman acolo si dupa publicare,
   * concurand chiar pagina adevarata. Vezi `incarcaMagazinul`.
   */
  if (!business.is_published) {
    return metadataMagazinNepublicat(business.store_name ?? business.business_name);
  }

  // Merchant overrides (Settings > SEO) win; otherwise fall back to the
  // auto-derived defaults (single source of truth in @/lib/seo).
  const rawSettings = (business as unknown as { store_settings: SetariMetadata | SetariMetadata[] | null }).store_settings;
  const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
  const seo = parseStoreSeo(settings?.page_content ?? null);
  // Designul PUBLICAT: daca exista pagina de catalog, iar pentru adresele filtrate si
  // subtitlul si sortarea ei. Contextul e minimal: `shop.page` nu depinde de culori
  // sau de bannere.
  const designPtSeo = parseStoreDesign(
    settings?.storefront_design ?? null,
    { primaryColor: "#1AB554", pageContent: {}, features: {} },
  );

  const displayName = business.store_name ?? business.business_name;
  const title = seo.title || deriveStoreTitle(displayName, business.store_city);
  const description = seo.description || deriveStoreDescription({ tagline: business.tagline, description: business.description, displayName });
  // When a custom domain is configured, consolidate SEO to it (so edinio.com/slug
  // also points its canonical at the store's own domain).
  const radacina = storeBaseUrl({ slug, custom_domain: business.custom_domain });
  /*
   * Adresele FILTRATE (`?cat=`, `?sale=1`, `?page=N`) au titlul, descrierea si
   * canonicalul lor, in `metadataAcasaFiltrata`: acolo stau si regulile (catalog
   * separat sau nu, categorie verificata, magazin cu un singur produs).
   *
   * ⚠ Pana pe 10.09.2026 le compunea codul de aici: primeau titlul si descrierea
   * paginii principale, iar `cat` nu se verifica, deci `?cat=zzz` isi era singur
   * canonical. Aici ramane doar pagina principala NEfiltrata, cu canonicalul ei.
   */
  const url = radacina;
  const filtrata = esteAcasaFiltrata(sp);
  const comun = {
    business: { ...business, slug },
    seo,
    pageContent: settings?.page_content ?? null,
    design: designPtSeo,
    faraTva: preturiFaraTva(settings),
    sp,
  };

  // One Product Store: the homepage *is* the chosen product's landing page, so its
  // metadata comes from that product (canonical stays on the homepage URL). Store
  // SEO overrides (Settings > SEO) still win when set.
  const storeMode = parseStoreMode(settings?.page_content ?? null);
  if (storeMode.mode === "one_product" && storeMode.productId) {
    const product = await a.incarcaProdus(business.id, storeMode.productId);
    if (product) {
      const ps = product.page_sections as { seo?: { title?: string; description?: string }; short_description?: string } | null;
      const opsTitle = seo.title || ps?.seo?.title || product.name;
      const opsDescription = seo.description
        || ps?.seo?.description
        /* ⚠ `textCurat`, nu o taiere proprie: eticheta devine SPATIU, altfel „…cazare.Beneficii:". */
        || textCurat(ps?.short_description, 155)
        || (product.description ? textCurat(product.description, 155) : product.name);
      const pImgs = product.images as string[] | null;
      const opsImage = seo.ogImage || pImgs?.[0] || business.cover_url;
      const opsImages = opsImage ? [opsImage] : [];
      if (filtrata) {
        return metadataAcasaFiltrata({
          ...comun,
          acasa: { titlu: opsTitle, descriere: opsDescription, imagini: opsImages },
          unSingurProdus: true,
        });
      }
      return {
        title: { absolute: opsTitle },
        description: opsDescription,
        ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
        // `type` si `locale` se scriu explicit: obiectul asta inlocuieste in
        // intregime openGraph-ul din layout-ul radacina, deci ce nu e aici nu se
        // emite deloc, iar og:type e obligatoriu in protocol.
        openGraph: { type: "website", locale: "ro_RO", siteName: displayName, title: opsTitle, description: opsDescription, url, images: opsImages },
        twitter: {
          card: opsImages.length ? "summary_large_image" : "summary",
          title: opsTitle,
          description: opsDescription,
          ...(opsImages.length ? { images: opsImages } : {}),
        },
        alternates: { canonical: url },
      };
    }
    // Chosen product missing/inactive: fall through to the store metadata below.
  }

  const ogImage = seo.ogImage || business.cover_url;
  const images = ogImage ? [ogImage] : [];
  if (filtrata) {
    return metadataAcasaFiltrata({
      ...comun,
      acasa: { titlu: title, descriere: description, imagini: images },
      unSingurProdus: false,
    });
  }
  return {
    // `absolute` strips the root layout's "%s | Edinio" template: storefronts
    // must show only the merchant's own name in Google / browser tabs.
    title: { absolute: title },
    description,
    // Advanced opt-in: hide the homepage from search. "follow" stays on so
    // crawlers still reach the (indexable) product pages it links to.
    ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: "website", locale: "ro_RO", siteName: displayName, title, description, url, images },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      ...(images.length ? { images } : {}),
    },
    alternates: { canonical: url },
  };
}
