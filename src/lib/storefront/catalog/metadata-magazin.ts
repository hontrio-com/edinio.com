import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { metadataMagazinNepublicat } from "@/lib/storefront/antet-magazin";
import { slugCategorie } from "@/lib/storefront/category-href";
import { SEGMENT_CAUTARE, SEGMENT_MAGAZIN } from "@/lib/pages/reserved-slugs";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { citesteSetariMagazin, type SetariMagazin } from "@/lib/storefront/catalog/shop-settings";
import { canonicalCatalog, citesteFiltreDinAdresa, type FiltreCitite } from "@/lib/storefront/catalog/url";
import { parseStoreSeo, storeBaseUrl, type StoreSeo } from "@/lib/seo";
import {
  construiesteDateCatalog, descriereProprieAPaginii, emiteDateCatalog, metadataCatalog, titluSiDescriere,
  type ArgumenteDateCatalog,
} from "@/lib/storefront/catalog/date-catalog";
import { categoriiMagazin, contextDescriere, rezumatMagazin } from "@/lib/storefront/catalog/context-descriere";
import { citesteSeoCategorie } from "@/lib/storefront/catalog/seo-categorie";
import {
  numeScurtMagazin, preturiFaraTva, subarboreAreProduse, type ContextDescriere,
} from "@/lib/storefront/catalog/descriere-generata";
import { sortareEfectivaGrila } from "@/lib/storefront/catalog/sortare-efectiva";
import type { CategorieArbore } from "@/lib/storefront/catalog/subarbore";
import type { StorefrontProduct } from "@/lib/storefront/product.types";

/**
 * Metadata paginii de catalog, a paginilor de categorie si a rezultatelor cautarii.
 *
 * ═══ DE CE E UN MODUL SEPARAT DE `pagina-magazin.tsx` ═══
 *
 * Un `.tsx` nu se poate importa in probe (vezi `scripts/tests/ts-resolve.mjs`), iar
 * metadata e exact partea care nu cade niciodata singura: o descriere gresita arata
 * identic cu una corecta, raspunde 200 si trece de build. Aici `metadataMagazin` se
 * ruleaza CHIAR ea, pe o baza de proba (`metadata-magazin.test.ts`). `pagina-magazin`
 * o reexporta, deci rutele nu s-au schimbat.
 */

export interface ArgumentePaginaMagazin {
  slug: string;
  sp: Record<string, string | string[] | undefined>;
  /** Segmentul de categorie din cale, cand pagina e a unei categorii. */
  categorieSlug?: string;
  /**
   * Pagina de REZULTATE ale cautarii (`/cautare?q=…`).
   *
   * ═══ ⚠ DE CE E UN STEAG, SI NU O A DOUA PAGINA ═══
   *
   * Rezultatele au nevoie de exact ce are catalogul: grila, filtrele, paginarea,
   * fatetele, ordonarea. O pagina scrisa separat ar fi fost o a doua copie a
   * acelorasi sapte sute de randuri, care se desparte de prima la prima schimbare.
   *
   * ⚠ Steagul schimba DOUA lucruri, si numai doua:
   *
   *   1. Nu se mai redirecteaza magazinele care n-au catalog separat. Pagina de
   *      rezultate trebuie sa existe pentru ORICARE magazin; altfel cautarea din
   *      header, care e in toate design-urile, ar fi dus inapoi pe pagina principala
   *      la unii si pe o pagina adevarata la altii.
   *   2. Nu se indexeaza. Rezultatele proprii de cautare n-au ce cauta in Google
   *      (o spun chiar ei in indrumarul pentru webmasteri), iar spatiul de adrese e
   *      nesfarsit: un termen scris de oricine ar fi devenit o pagina.
   */
  esteCautare?: boolean;
}

/**
 * Categoria al carei nume da segmentul cerut.
 *
 * Cautarea e pe NUME slugificat, nu pe o coloana `slug`: categoriile n-au asa
 * ceva, iar produsele isi poarta categoria ca text. Vezi `slugCategorie`.
 */
export function potrivesteCategorie<T extends { name: string }>(lista: T[], segment: string): T | null {
  const cautat = slugCategorie(segment);
  if (!cautat) return null;
  return lista.find((c) => slugCategorie(c.name) === cautat) ?? null;
}

/**
 * Randul de categorie a carui descriere o poarta pagina numelui `nume`.
 *
 * ═══ O SINGURA REGULA, ACEEASI CU A PAGINII ═══
 *
 * `/magazin/<segment>` arata PRIMA categorie vizibila, in ordinea din panou (`sort_order`,
 * `id`), al carei nume da segmentul (`potrivesteCategorie`). Tot ea isi da si descrierea: pe
 * pagina ei, pe `/magazin?cat=` si `/?cat=` (canonicalul lor arata acolo) si in `CollectionPage`.
 *
 * ⚠ NUME DUBLATE: doua categorii cu acelasi segment (acelasi nume in doua ramuri, sau o
 * diferenta doar de litere mari ori de diacritice) sunt O SINGURA pagina, iar descrierea e a
 * PRIMEI. Textul celei de-a doua nu se foloseste nicaieri; panoul o spune
 * (`descriereAutomataCategoriei`, campul `umbritaDe`).
 *
 * ⚠ La magazinele FARA pagina de catalog, `/?cat=Rochii` si `/?cat=Rochii!` sunt adrese
 * diferite, dar cu acelasi segment: tot prima isi da textul. Pret mic pentru o regula unica, pe
 * care panoul o poate spune intr-o fraza.
 *
 * Un nume fara segment (doar semne, sau alt alfabet, pe care `slugify` le arunca) n-are pagina
 * `/magazin/<segment>`, deci se cauta dupa numele exact.
 *
 * `vizibile` = lista din `categoriiMagazin`, deja ordonata ca in panou.
 */
export function randulPaginiiCategoriei<T extends { id: string; name: string }>(vizibile: T[], nume: string): T | null {
  const n = nume.trim();
  if (!n) return null;
  if (slugCategorie(n)) return potrivesteCategorie(vizibile, n);
  return vizibile.find((c) => c.name.trim() === n) ?? null;
}

/**
 * Descrierea scrisa de comerciant pe categoria paginii `numeCategorie` (Produse > Categorii).
 *
 * `null` = pagina e catalogul intreg, numele nu e al niciunei categorii vizibile (categorie
 * purtata doar de produse), comerciantul n-a scris nimic, ori citirea a picat. In toate, ramane
 * textul automat.
 *
 * ⚠ Pe `?sale=1` textul se citeste, dar nu se foloseste: regula sta intr-un singur loc,
 * `descrierePaginii`.
 */
export async function descriereProprieCategoriei(businessId: string, numeCategorie: string): Promise<string | null> {
  if (!numeCategorie.trim()) return null;
  const { vizibile } = await categoriiMagazin(businessId);
  const rand = randulPaginiiCategoriei(vizibile, numeCategorie);
  return rand ? citesteSeoCategorie(businessId, rand.id) : null;
}


/** Numele de categorie care exista DOAR pe produse (importuri fara categorie in tabel). */
export async function numeCategoriiDinProduse(businessId: string): Promise<{ name: string }[]> {
  const randuri = await fetchAllRows("storefront.magazin.categoriiProduse", (from, to) =>
    createAdminClient()
      .from("products").select("category").eq("business_id", businessId).eq("is_active", true)
      .order("id").range(from, to));
  return Array.from(new Set(randuri.map((r) => r.category).filter(Boolean) as string[]))
    .map((name) => ({ name }));
}

/** Coloanele din `store_settings` pe care le citeste metadata. */
type SetariCitite = {
  page_content: unknown;
  storefront_design: unknown;
  vat_enabled: boolean | null;
  prices_include_vat: boolean | null;
};

export async function metadataMagazin({ slug, sp, categorieSlug, esteCautare }: ArgumentePaginaMagazin): Promise<Metadata> {
  const admin = createAdminClient();
  const { data: business } = await admin
    .from("businesses")
    // `tagline` si `description`: din ele se compune descrierea paginii principale,
    // cu care se compara subtitlul catalogului (decizia 5). Coloanele de TVA: fara
    // ele, un pret fara TVA ar fi aparut in Google ca pret intreg.
    .select("id, business_name, store_name, tagline, description, cover_url, custom_domain, is_published, store_settings(page_content, storefront_design, vat_enabled, prices_include_vat)")
    .eq("slug", slug)
    .single();
  if (!business) return {};

  // Nepublicat: pagina redirectioneaza catre vitrina, care arata „in curand
  // disponibil". Metadata ei n-are ce cauta in index. Vezi `incarcaMagazinul`.
  if (!business.is_published) {
    return metadataMagazinNepublicat(business.store_name ?? business.business_name);
  }

  const brut = (business as unknown as {
    store_settings: SetariCitite | SetariCitite[] | null;
  }).store_settings;
  const settings = Array.isArray(brut) ? brut[0] : brut;
  const seo = parseStoreSeo(settings?.page_content ?? null);
  const displayName = business.store_name ?? business.business_name;

  // Aceeasi formula ca peste tot in storefront, nu una scrisa a doua oara aici:
  // pe domeniu propriu canonicalul e domeniul, altfel adresa de pe platforma.
  const radacina = storeBaseUrl({ slug, custom_domain: business.custom_domain });
  const images = business.cover_url ? [business.cover_url] : [];

  /*
   * ⚠ REZULTATELE DE CAUTARE NU SE INDEXEAZA, NICIODATA.
   *
   * Google o cere limpede in indrumarul pentru webmasteri, si are dreptate: spatiul de
   * adrese e nesfarsit (orice termen scris de oricine ar fi devenit o pagina), iar
   * paginile alea n-au continut propriu, doar o felie din catalog.
   *
   * `follow: true` ramane: legaturile catre produse merita urmarite.
   *
   * ⚠ Termenul cautat sta DOAR in fila browserului (`titluFila`). Descrierea, og si
   * twitter nu-l poarta: s-ar fi vazut in previzualizarile de pe Facebook si WhatsApp.
   * og si twitter se dau COMPLETE (vezi `metadataCatalog`); pana acum lipseau, deci
   * ramaneau ale layout-ului, cu descrierea paginii principale.
   *
   * Imaginea e cea pe care o mostenea pagina din layout (`seo.ogImage`, apoi coperta),
   * ca partajarea rezultatelor sa arate la fel ca pana acum.
   */
  if (esteCautare) {
    /* ⚠ Citit ca vecinii lui: un `?q=a&q=b` ajunge tablou, iar `.trim()` pe tablou
       ar fi cazut in randare, nu la compilare. */
    const termen = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim().slice(0, 80);
    const imagine = seo.ogImage || business.cover_url;
    return metadataCatalog({
      titlu: `Caută · ${displayName}`,
      titluFila: termen ? `Rezultate pentru „${termen}” · ${displayName}` : `Caută · ${displayName}`,
      descriere: `Caută printre produsele ${numeScurtMagazin(displayName)}.`,
      displayName,
      url: `${radacina}/${SEGMENT_CAUTARE}`,
      indexabila: false,
      noindex: true,
      images: imagine ? [imagine] : [],
    });
  }

  /*
   * Comutatoarele magazinului: aceleasi cu care randarea isi alege randul de rezumat si
   * isi taie grila. Descrierea numara produsele pe care le arata CHIAR pagina.
   */
  const pc = (settings?.page_content ?? {}) as Record<string, unknown>;
  const faraImagini = pc.hide_products_without_images === true;
  const faraStocAscuns = pc.hide_out_of_stock_products === true;

  /*
   * Categoriile se citesc MEREU, si pe `/magazin`.
   *
   * Pana acum se citeau doar cand adresa avea o categorie. Dar descrierea catalogului
   * numeste categoriile lui de sus, deci fara ele lista ar fi iesit goala. Citirea e
   * cea din `context-descriere.ts`, ordonata ca in panou (`sort_order`, `id`): cand doua
   * categorii dau acelasi segment, metadata si randarea aleg ACEEASI, prima. Fara
   * ordine, metadata putea descrie una si randarea arata alta.
   *
   * Fara subarborii stinsi: pagina lor da 404, iar metadata unei pagini care nu
   * exista n-are ce descrie.
   */
  const [categorii, rezumat] = await Promise.all([
    categoriiMagazin(business.id),
    rezumatMagazin(business.id, faraImagini, faraStocAscuns),
  ]);
  const vizibile = categorii.vizibile;

  /*
   * Categoria vine ori din cale, ori din `?cat=`.
   *
   * Cu o categorie in adresa, pagina ESTE pagina acelei categorii. Un titlu
   * „Toate produsele" pe `?cat=Manusi de protectie` spune si vizitatorului din
   * fila si motorului de cautare exact pe langa.
   *
   * `cat` poate purta si un id de categorie, cand vine dintr-un element de
   * meniu. Un id in titlu ar fi mai rau decat titlul generic, deci se foloseste
   * doar cand arata a nume.
   */
  const catBrut = (Array.isArray(sp.cat) ? sp.cat[0] : sp.cat)?.trim() ?? "";
  let categorie = "";
  let radacinaPagina = `${radacina}/${SEGMENT_MAGAZIN}`;
  // Categoria e in cale sau in interogare; in ambele cazuri se cauta in tabel, ca
  // titlul sa fie numele adevarat si canonicalul adresa adevarata.

  if (categorieSlug) {
    // Si printre categoriile purtate doar de produse, ca la randare: importurile
    // lasa des categorii care nu ajung in tabel, iar acelea au pagini adevarate,
    // deci merita titlu adevarat. Cautarea in produse costa, deci se face doar
    // cand tabelul n-a raspuns.
    const gasita = potrivesteCategorie(vizibile, categorieSlug)
      ?? potrivesteCategorie(await numeCategoriiDinProduse(business.id), categorieSlug);
    // Fara categorie nu exista pagina: ruta va da 404, iar metadata unei pagini
    // care nu exista n-are ce descrie.
    if (!gasita) return {};
    categorie = gasita.name;
    radacinaPagina = `${radacina}/${SEGMENT_MAGAZIN}/${slugCategorie(gasita.name)}`;
  } else if (catBrut) {
    /*
     * Forma veche, `?cat=`, isi trimite acum valoarea catre pagina categoriei.
     *
     * `cat` poate purta si un id de categorie, cand vine dintr-un element de
     * meniu. Cautarea acopera ambele, deci si linkurile alea capata in sfarsit un
     * titlu cu nume, nu unul generic. Canonicalul se muta pe pagina categoriei ca
     * cele doua adrese sa nu se concureze in index, dar numai cand categoria
     * chiar exista, altfel ar arata catre un 404.
     */
    const gasita = vizibile.find((c) => c.id === catBrut)
      ?? vizibile.find((c) => c.name.toLowerCase() === catBrut.toLowerCase());
    if (gasita) {
      categorie = gasita.name;
      radacinaPagina = `${radacina}/${SEGMENT_MAGAZIN}/${slugCategorie(gasita.name)}`;
    } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(catBrut)) {
      // Nume care nu e in tabel (categorie ramasa doar pe produse, dintr-un
      // import): bun de titlu, dar canonicalul ramane pe catalog.
      categorie = catBrut.slice(0, 80);
    }
  }

  // Categoria nu mai are ce cauta in interogarea canonicalului: o poarta calea.
  const { url, indexabila } = canonicalCatalog(radacinaPagina, { ...sp, cat: undefined });

  /*
   * Setarile paginii de catalog, din designul PUBLICAT: subtitlul (decizia 5) si
   * sortarea implicita a grilei. `shop.page` nu depinde de contextul designului
   * (culori, bannere), deci contextul minim da aceleasi setari ca in randare.
   */
  const setari = citesteSetariMagazin(parseStoreDesign(
    settings?.storefront_design ?? null,
    { primaryColor: "#1AB554", pageContent: {}, features: {} },
  ));

  /*
   * ⚠ Prin `descrierePaginiiCatalog`, ca nodul `CollectionPage` din randare
   * (`dateStructuratePaginaCatalog`) si ca `/?cat=` (`metadataAcasaFiltrata`). Acolo se
   * compun, intr-un singur loc, argumentele lui `contextDescriere`: pagina se descrie la
   * fel sus si jos, iar `cache()` da contextul o singura data.
   */
  const { context, descriereProprie } = await descrierePaginiiCatalog({
    businessId: business.id,
    numeCategorie: categorie,
    pageContent: settings?.page_content ?? null,
    sp,
    setari,
    faraTva: preturiFaraTva(settings),
    seo,
    business,
    displayName,
  });
  // Aceleasi doua siruri le foloseste si nodul `CollectionPage` din randare.
  const { titlu, descriere } = titluSiDescriere(categorie, displayName, context, descriereProprie);

  /*
   * ⚠ DECIZIA 6: categoria fara niciun produs nu se indexeaza.
   *
   * O singura regula, `subarboreAreProduse`, pentru pagina si pentru sitemap: o pagina
   * `noindex` anuntata in sitemap e contradictia pe care Search Console o raporteaza
   * ca eroare. `null` (rezumatul lipseste) inseamna „nu stim", deci pagina ramane
   * indexabila. `follow` ramane: linkurile din meniu merita urmarite.
   */
  const faraProduse = subarboreAreProduse(vizibile, categorie, rezumat?.categorii) === false;

  return metadataCatalog({
    titlu,
    descriere,
    displayName,
    url,
    indexabila,
    noindex: !!seo.noindex || faraProduse,
    images,
  });
}

/** Intrarile descrierii paginii de catalog sau de categorie. */
export interface IntrariDescriereCatalog {
  businessId: string;
  /** `""` = catalogul intreg. */
  numeCategorie: string;
  /** `store_settings.page_content`: comutatoarele magazinului si `default_sort`. */
  pageContent: unknown;
  /** Adresa ceruta. Din ea se citeste doar `sale`: canonicalul il pastreaza. */
  sp: Record<string, string | string[] | undefined>;
  /** Setarile paginii de catalog, din design: subtitlul (decizia 5) si sortarea implicita. */
  setari: Pick<SetariMagazin, "subtitlu" | "sortareImplicita">;
  /** `preturiFaraTva(store_settings)`. */
  faraTva: boolean;
  seo: StoreSeo;
  /** Din `tagline` si `description` se compune descrierea paginii principale (decizia 5). */
  business: { tagline?: string | null; description?: string | null };
  displayName: string;
}

/**
 * Contextul si textul propriu din care se scrie descrierea paginii de catalog sau a unei
 * categorii: `titluSiDescriere(categorie, displayName, context, descriereProprie)`.
 *
 * ═══ ⚠ UN SINGUR LOC PENTRU ARGUMENTELE LUI `contextDescriere` ═══
 *
 * Descrierea o scriu TREI apelanti: `<head>`-ul catalogului (`metadataMagazin`), nodul
 * `CollectionPage` din randare (`dateStructuratePaginaCatalog`) si `/?cat=` la magazinele
 * cu pagina de catalog (`metadataAcasaFiltrata`), care arata canonical catre aceeasi
 * pagina. Cat timp fiecare isi compunea singur argumentele, o sortare, un comutator sau
 * un subtitlu uitat intr-unul trecea de toate probele: fiecare apelant era corect luat
 * singur, dar pagina se descria altfel sus decat jos. Iar `cache()` da contextul o
 * singura data numai pe argumente IDENTICE.
 *
 *   - comutatoarele: ale magazinului, din `page_content`, ca grila;
 *   - `reduceri`: citit cu ACELASI parser ca grila; canonicalul pastreaza `sale=1`;
 *   - sortarea: a grilei CANONICALULUI, deci fara `?sort=` (sirul gol);
 *   - `faraTva`: regula serverului care incaseaza (`preturiFaraTva`);
 *   - textul propriu: pe o categorie, cel scris de comerciant (`descriereProprieCategoriei`,
 *     etapa 2); pe catalog, subtitlul paginii (decizia 5). Tot aici, deci si `<head>`-ul, si
 *     `CollectionPage`, si `/?cat=` il primesc deodata; unul care l-ar fi uitat ar fi descris
 *     aceeasi pagina cu doua texte.
 */
export async function descrierePaginiiCatalog(
  a: IntrariDescriereCatalog,
): Promise<{ context: ContextDescriere; descriereProprie: string | null }> {
  const pc = (a.pageContent ?? {}) as Record<string, unknown>;
  const [context, descriereCategorie] = await Promise.all([
    contextDescriere(
      a.businessId,
      a.numeCategorie,
      pc.hide_products_without_images === true,
      pc.hide_out_of_stock_products === true,
      citesteFiltreDinAdresa(a.sp, []).reduceri,
      sortareEfectivaGrila("", a.setari.sortareImplicita, a.pageContent),
      a.faraTva,
    ),
    descriereProprieCategoriei(a.businessId, a.numeCategorie),
  ]);
  return {
    context,
    descriereProprie: descriereProprieAPaginii({
      numeCategorie: a.numeCategorie,
      descriereCategorie,
      subtitlu: a.setari.subtitlu,
      seo: a.seo,
      business: a.business,
      displayName: a.displayName,
    }),
  };
}

/**
 * Datele structurate (JSON-LD) ale paginii de catalog, de categorie sau de rezultate, din
 * intrarile pe care le are randarea (`RandeazaMagazin`).
 *
 * ═══ DE CE E AICI, SI NU IN `pagina-magazin.tsx` ═══
 *
 * Un `.tsx` nu se poate rula in probe. Cat timp randarea isi compunea singura
 * argumentele, doua reguli ramaneau neaparate: steagul `esteCautare` (pierdut, `/cautare`
 * emitea iar `CollectionPage` pentru catalogul intreg, pe o pagina `noindex`) si
 * argumentele descrierii (o categorie sau un subtitlu uitat dadea in `CollectionPage` alt
 * text decat in `<head>`). Aici se ruleaza, pe o baza de proba.
 *
 * ⚠ Contextul descrierii se cere NUMAI cand pagina chiar isi scrie datele structurate
 * (`emiteDateCatalog`). Ciorna, `/cautare`, `?cat=`, adresele filtrate si categoriile fara
 * produse nu emit nimic, deci n-au de ce plati cele doua RPC-uri.
 */
export async function dateStructuratePaginaCatalog(a: {
  business: ArgumenteDateCatalog["business"] & { id: string; tagline?: string | null; description?: string | null };
  pageContent: unknown;
  /** `preturiFaraTva(store_settings)`. */
  faraTva: boolean;
  setari: Pick<SetariMagazin, "titlu" | "subtitlu" | "sortareImplicita">;
  sp: Record<string, string | string[] | undefined>;
  /**
   * Filtrele PARSATE, nu `sp` brut: `citesteFiltreDinAdresa` a aruncat deja cheile care
   * nu sunt fatete reale ale magazinului, deci `utm_source` si `gclid` (aterizarea din
   * orice reclama) nu trec drept filtre.
   */
  filtre: FiltreCitite;
  numeCategorie: string;
  parinteCategorie: string | null;
  products: StorefrontProduct[];
  reusitPeServer: boolean;
  esteCiorna: boolean;
  esteCautare: boolean;
  /** Categoriile VIZIBILE, pentru decizia 6. */
  categorii: readonly CategorieArbore[];
  /** `rezumat.categorii` pentru comutatoarele magazinului; lipsa = nu stim. */
  categoriiCuProduse: readonly string[] | null | undefined;
}): Promise<string | null> {
  const seo = parseStoreSeo(a.pageContent ?? null);
  const argumente: ArgumenteDateCatalog = {
    business: a.business,
    seo,
    setari: a.setari,
    sp: a.sp,
    filtre: a.filtre,
    numeCategorie: a.numeCategorie,
    parinteCategorie: a.parinteCategorie,
    products: a.products,
    reusitPeServer: a.reusitPeServer,
    esteCiorna: a.esteCiorna,
    esteCautare: a.esteCautare,
    // Decizia 6: ACEEASI regula ca `robots` din `<head>` si ca sitemapul.
    subarboreCuProduse: subarboreAreProduse(a.categorii, a.numeCategorie, a.categoriiCuProduse),
  };
  if (!emiteDateCatalog(argumente)) return null;
  const { context, descriereProprie } = await descrierePaginiiCatalog({
    businessId: a.business.id,
    numeCategorie: a.numeCategorie,
    pageContent: a.pageContent,
    sp: a.sp,
    setari: a.setari,
    faraTva: a.faraTva,
    seo,
    business: a.business,
    displayName: a.business.store_name ?? a.business.business_name,
  });
  return construiesteDateCatalog({ ...argumente, descriere: context, descriereProprie });
}
