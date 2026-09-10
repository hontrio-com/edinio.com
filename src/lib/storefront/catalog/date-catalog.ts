import type { Metadata } from "next";
import { canonicalCatalog, type FiltreCitite } from "@/lib/storefront/catalog/url";
import { slugCategorie } from "@/lib/storefront/category-href";
import { SEGMENT_MAGAZIN } from "@/lib/pages/reserved-slugs";
import { deriveStoreDescription, storeBaseUrl, type StoreSeo } from "@/lib/seo";
import { jsonLdSafe } from "@/lib/json-ld";
import {
  firimituriJsonLd, graf, listaJsonLd, paginaWebJsonLd, referintaMagazin,
  type ElementLista, type TreaptaFirimitura,
} from "@/lib/storefront/date-structurate";
import {
  descrierePaginii, descriereProprieCatalog, type ContextDescriere,
} from "@/lib/storefront/catalog/descriere-generata";
import type { StorefrontProduct } from "@/lib/storefront/product.types";

/**
 * Ce declara despre sine pagina de catalog si paginile de categorie.
 *
 * ═══ DE CE E UN MODUL SEPARAT DE `pagina-magazin.tsx` ═══
 *
 * Tot ce e aici e PUR: primeste randul de magazin, filtrele deja parsate si
 * produsele randate, si intoarce siruri. Nicio interogare, nicio componenta,
 * niciun `headers()`. Adica se poate proba — iar regulile de mai jos sunt exact
 * felul de reguli care nu cad niciodata singure: o pagina cu date structurate
 * gresite arata identic cu una corecta, raspunde 200 si trece de build.
 *
 * Locuiau in `pagina-magazin.tsx`, langa randare, si erau acoperite de zero
 * probe. Prima revizuire a gasit acolo doua afirmatii false.
 */
/**
 * Adresa canonica a paginii de catalog si daca versiunea asta merita indexata.
 *
 * ═══ DE CE E O FUNCTIE, DESI ARE TREI RANDURI ═══
 *
 * Are DOI consumatori care trebuie sa spuna acelasi lucru: eticheta
 * `alternates.canonical` + `robots` din `<head>`, si `url`-ul din datele
 * structurate. O nepotrivite intre ele inseamna o pagina care se declara
 * `noindex` sus si se descrie ca o colectie indexabila jos — semnal contradictoriu,
 * exact ce raporteaza Search Console ca eroare.
 *
 * ⚠ `canonicalCatalog` se cheama cu DOUA argumente, nu cu trei. Al treilea
 * (`fatete`) exista, si in randare chiar l-am avea la indemana — dar trimis doar
 * de aici, verdictul `indexabila` din JSON-LD ar fi devenit mai STRICT decat cel
 * care a produs eticheta `robots`, deci a doua nepotrivire, in sens invers.
 * Motivul e acelasi cu docblock-ul lui `scrieFiltre`: sursa unica.
 *
 * ⚠ `cat: undefined` nu e cosmetic: categoria e purtata de CALE pe pagina de
 * categorie, iar lasata si in interogare ar produce a doua adresa pentru acelasi
 * raft.
 */
export function canonicalPagina(
  radacinaAbsoluta: string,
  numeCategorie: string,
  sp: Record<string, string | string[] | undefined>,
): { url: string; indexabila: boolean } {
  const radacinaPagina = numeCategorie
    ? `${radacinaAbsoluta}/${SEGMENT_MAGAZIN}/${slugCategorie(numeCategorie)}`
    : `${radacinaAbsoluta}/${SEGMENT_MAGAZIN}`;
  return canonicalCatalog(radacinaPagina, { ...sp, cat: undefined });
}

/**
 * Titlul si descrierea paginii, dintr-un singur loc.
 *
 * Le cer si `<head>`-ul, si nodul `CollectionPage`. Scrise de doua ori, prima
 * nepotrivire ar fi fost o pagina care se numeste altfel in fila browserului
 * decat in datele ei structurate — doua raspunsuri la aceeasi intrebare.
 *
 * ═══ ⚠ FARA `seo.description`, SI ASTA E TOATA REPARATIA (10.09.2026) ═══
 *
 * Descrierea din Setari > SEO e a PAGINII PRINCIPALE (chiar ecranul o spune). Pusa
 * aici, catalogul si fiecare categorie purtau acelasi text in Google, adica exact ce
 * spune Google ca „nu ajuta": atunci isi scrie singur fragmentul din pagina. Reclamat
 * de caian-textile.ro. Parametrul `seo` a plecat din semnatura ca `tsc` sa semnaleze
 * orice apelant care l-ar mai trimite.
 *
 * Descrierea vine din `descrierePaginii`: intai textul propriu al paginii (subtitlul
 * catalogului, vezi `descriereProprieAPaginii`; din etapa 2 si descrierea scrisa pe
 * categorie), apoi textul generat din `context`. Trece O SINGURA DATA prin
 * `textCurat(…, 160)`, chiar acolo, deci meta = og = twitter = JSON-LD prin
 * constructie, inclusiv pe numele cu spatii duble sau cu `<` in ele.
 */
export function titluSiDescriere(
  categorie: string,
  displayName: string,
  context: ContextDescriere,
  descriereProprie?: string | null,
): { titlu: string; descriere: string } {
  return {
    titlu: categorie ? `${categorie} | ${displayName}` : `Toate produsele | ${displayName}`,
    descriere: descrierePaginii({ categorie, magazin: displayName, context, descriereProprie }),
  };
}

/**
 * Textul propriu al paginii, cand exista unul care merita sa fie descrierea ei.
 *
 * Pe CATALOG (decizia 5): subtitlul paginii de catalog, scris de comerciant anume
 * pentru ea, dar numai daca nu e chiar descrierea paginii principale copiata acolo
 * (vezi `descriereProprieCatalog`). Pe o CATEGORIE (etapa 2): descrierea scrisa de
 * comerciant pe ea, in Produse > Categorii (`descriereProprieCategoriei`), sau nimic.
 *
 * ⚠ `descriereCategorie` e OBLIGATORIE, nu optionala: un apelant care ar uita-o ar fi
 * pierdut textul comerciantului pe tacute, iar `tsc` n-ar fi spus nimic.
 *
 * ⚠ Descrierea paginii principale se compune EXACT ca in `[slug]/page.tsx` si in
 * layout: `seo.description`, apoi `deriveStoreDescription`. Comparata cu altceva,
 * un subtitlu copiat din pagina principala ar fi trecut drept text propriu si ar fi
 * refacut chiar dublura reparata aici.
 *
 * ⚠ O cheama si `<head>`-ul, si randarea (pentru `CollectionPage`), cu aceleasi
 * intrari. Un apelant care ar uita-o ar descrie pagina altfel sus decat jos.
 */
export function descriereProprieAPaginii(a: {
  numeCategorie: string;
  /** Textul scris de comerciant pe categoria paginii (`descriereProprieCategoriei`); `null` = niciunul. */
  descriereCategorie: string | null;
  subtitlu: string;
  seo: StoreSeo;
  business: { tagline?: string | null; description?: string | null };
  displayName: string;
}): string | null {
  if (a.numeCategorie.trim()) return a.descriereCategorie;
  const descriereAcasa = a.seo.description || deriveStoreDescription({
    tagline: a.business.tagline,
    description: a.business.description,
    displayName: a.displayName,
  });
  return descriereProprieCatalog(a.subtitlu, descriereAcasa);
}

/**
 * Metadata unei pagini de catalog, de categorie sau de rezultate, construita
 * INTREAGA dintr-un singur loc.
 *
 * ═══ ⚠ DE CE COMPLETA, CU `type`, `locale` SI `siteName` ═══
 *
 * Next contopeste metadatele pe chei de nivel intai: `openGraph` si `twitter` scrise
 * aici INLOCUIESC in intregime obiectele din layout (`resolve-metadata.js`). Ce nu e
 * aici nu se emite deloc. Iar pe `/cautare` cele doua lipseau cu totul, deci ramaneau
 * ale layout-ului, cu descrierea paginii principale.
 *
 * ⚠ Nicio cheie cu valoarea `undefined`: in Next 16 o cheie prezenta cu `undefined`
 * STERGE valoarea mostenita (vezi [[metadata-undefined-sterge-mostenirea]]). De aceea
 * `robots` si imaginile de twitter intra prin imprastiere conditionata.
 *
 * `titluFila` = titlul din fila browserului, cand trebuie sa difere de cel partajat:
 * pe rezultatele cautarii, termenul cautat sta DOAR in fila. Pus in og, ar fi aparut
 * in previzualizarile de pe Facebook si WhatsApp.
 */
export function metadataCatalog(a: {
  titlu: string;
  titluFila?: string;
  descriere: string;
  displayName: string;
  url: string;
  indexabila: boolean;
  noindex: boolean;
  images: string[];
}): Metadata {
  const { titlu, descriere: description, url, images } = a;
  return {
    // `absolute` scoate template-ul „%s | Edinio" al radacinii: pe domeniul
    // comerciantului, fila din browser n-are ce cauta cu numele platformei.
    title: { absolute: a.titluFila || titlu },
    description,
    // Filtrele deschid un spatiu combinatoriu: o pagina cu doua sau mai multe
    // bife nu se indexeaza, dar linkurile din ea se urmaresc mai departe.
    ...(a.noindex || !a.indexabila ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: "website", locale: "ro_RO", siteName: a.displayName, title: titlu, description, url, images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title: titlu, description, ...(images.length ? { images } : {}) },
    alternates: { canonical: url },
  };
}

/**
 * Datele structurate ale catalogului si ale paginilor de categorie.
 *
 * ═══ CE LIPSEA ═══
 *
 * Nimic nu se emitea aici. Paginile de categorie sunt trimise ANUME la indexat —
 * sitemapul scrie cate o intrare pentru fiecare, au titlu propriu si canonical
 * propriu — deci erau, dupa produse, cele mai valoroase adrese ale magazinului si
 * singurele fara nicio descriere pentru cine le indexeaza. Reclamat de un
 * comerciant, si avea dreptate.
 *
 * ═══ CAND NU SE EMITE NIMIC, SI DE CE ═══
 *
 * Regula e una singura: descriem doar pagina care se descrie si pe sine, adica
 * aceea al carei canonical arata catre ea insasi si care are voie in index. Orice
 * altceva ar fi un al doilea semnal, care contrazice primul.
 */
export function construiesteDateCatalog(a: ArgumenteDateCatalog & {
  /** Contextul descrierii, din `contextDescriere`, cu ACELEASI argumente ca `<head>`-ul. */
  descriere: ContextDescriere;
  /** Textul propriu al paginii (`descriereProprieAPaginii`), cu aceleasi intrari ca `<head>`-ul. */
  descriereProprie?: string | null;
}): string | null {
  // Cand nu se emite nimic, si de ce: vezi `emiteDateCatalog`. Pastrat si aici, ca
  // un apelant care uita predicatul sa nu poata descrie o pagina `noindex`.
  if (!emiteDateCatalog(a)) return null;

  const radacina = storeBaseUrl(a.business);
  const { url } = canonicalPagina(radacina, a.numeCategorie, a.sp);

  const displayName = a.business.store_name ?? a.business.business_name;
  // ⚠ NICIODATA `a.seo.description`: aceea e a paginii principale. Vezi `titluSiDescriere`.
  const { titlu, descriere } = titluSiDescriere(a.numeCategorie, displayName, a.descriere, a.descriereProprie);

  /*
   * Firimiturile oglindesc drumul REAL prin magazin, treapta cu treapta:
   * magazinul, catalogul, categoria-parinte (cand exista) si categoria curenta —
   * aceleasi trepte pe care le deseneaza si `AntetPagina` pe ecran.
   */
  const trepte: TreaptaFirimitura[] = [
    { nume: displayName, url: radacina },
    { nume: a.setari.titlu, url: `${radacina}/${SEGMENT_MAGAZIN}` },
  ];
  if (a.numeCategorie && a.parinteCategorie) {
    trepte.push({ nume: a.parinteCategorie, url: `${radacina}/${SEGMENT_MAGAZIN}/${slugCategorie(a.parinteCategorie)}` });
  }
  if (a.numeCategorie) {
    trepte.push({ nume: a.numeCategorie, url: `${radacina}/${SEGMENT_MAGAZIN}/${slugCategorie(a.numeCategorie)}` });
  }

  /*
   * ⚠⚠ LISTA DE PRODUSE SE EMITE DOAR PE PALIERUL SERVER, SI ASTA E ESENTIAL.
   *
   * Pe palierul CLIENT, `products` nu e felia acestei pagini: e CATALOGUL INTREG
   * al magazinului, adus nefiltrat, iar categoria si paginarea se aplica abia in
   * browser (vezi `reusitPeServer`, si comentariul despre `palierRandat`). Un
   * `ItemList` construit din el pe `/magazin/bocanci` ar fi declarat drept membri
   * ai raftului „Bocanci" produsele din TOATE celelalte rafturi — inclusiv din
   * cele pe care comerciantul si le-a stins anume.
   *
   * Se foloseste `reusitPeServer`, nu `palier`: primul spune ce s-a INTAMPLAT, al
   * doilea doar ce s-a decis. Cand RPC-ul cade, se citeste tot catalogul desi
   * palierul ramane „server".
   */
  /*
   * ⚠ ...SI NUMAI CAND ADRESA E CHIAR CANONICALUL EI.
   *
   * `canonicalCatalog` pastreaza in canonical DOAR `cat`, `sale` si `page`.
   * Cautarea, fatetele, pretul, stocul si sortarea cad — si nici nu fac pagina
   * `noindex`, fiindca `fatete` nu se numara deloc in `inPlus`. Pe palierul
   * server insa, produsele sunt EXACT felia taiata de RPC dupa acei parametri.
   *
   * Deci fara garda de aici, `/magazin?q=bocanci` ar fi lipit trei rezultate de
   * cautare pe un nod al carui `@id` e canonicalul catalogului INTREG, sub numele
   * „Toate produsele" — iar `/magazin` curat ar fi emis ACELASI `@id` cu alt
   * continut. Doua adrese care spun lucruri diferite despre aceeasi entitate.
   *
   * E imaginea in oglinda a defectului de deasupra: acolo lista era mai LARGA
   * decat pagina, aici ar fi mai INGUSTA decat adresa pe care se declara.
   *
   * `sale` si `page` NU intra in verificare: pe amandoua le poarta canonicalul,
   * deci acolo felia si adresa declarata coincid.
   *
   * Pagina ramane descrisa — nume, descriere, firimituri, toate adevarate pentru
   * canonical; se pierde doar afirmatia despre ce contine.
   */
  const filtreazaPesteCanonical =
    !!a.filtre.cautare.trim()
    || a.filtre.stoc
    || !!a.filtre.pretMin
    || !!a.filtre.pretMax
    || !!a.filtre.sortare
    || Object.keys(a.filtre.fatete).length > 0;

  const lista = a.reusitPeServer && !filtreazaPesteCanonical
    ? listaJsonLd(
        a.products
          // Fara slug, adresa ar fi `/product/<uuid>`, care ia 301 catre slug:
          // fiecare intrare din lista ar fi o redirectare.
          .filter((p) => (p.slug ?? "").trim())
          .slice(0, 60)
          .map<ElementLista>((p) => ({
            url: `${radacina}/product/${p.slug}`,
            nume: p.name,
            imagine: Array.isArray(p.images) ? (p.images as unknown[]).find((i) => typeof i === "string") as string : null,
          })),
        titlu,
      )
    : null;

  // Magazinul nu se REDECLARA aici cu adresa, telefonul si sloganul lui — se
  // refera. Doua noduri de firma cu valori diferite pe acelasi magazin sunt mai
  // rele decat unul singur, iar cel intreg sta pe pagina principala.
  const magazin = referintaMagazin(a.business, radacina);

  const nod = graf(
    paginaWebJsonLd({
      tip: "CollectionPage",
      nume: a.numeCategorie || a.setari.titlu,
      url,
      descriere,
      /*
       * ⚠ FARA `imagine`, si asta e o alegere, nu o scapare.
       *
       * `primaryImageOfPage` inseamna „imaginea principala DE PE pagina", iar
       * coperta magazinului NU se randeaza niciodata pe suprafata de catalog:
       * `MiniStoreRenderer` desface `surface="shop"` intr-un `ShopPageSection`
       * curat, iar `cover_url` e citit doar de sectiunile de hero ale paginii
       * principale. Ar fi fost aceeasi poza pe toate paginile de categorie ale
       * magazinului, si niciuna dintre ele n-o arata.
       *
       * Nici imaginea categoriei nu-i tine locul: modelul implicit nu deseneaza
       * categoria curenta, deci ar fi a doua afirmatie neadevarata. `og:image`
       * ramane neatins in `metadataMagazin` — aceea e imagine de PARTAJARE, nu o
       * afirmatie despre continutul paginii.
       */
      parteDin: magazin,
      lista,
    }),
    magazin,
    firimituriJsonLd(trepte),
  );
  return nod ? jsonLdSafe(nod) : null;
}

/** Ce trebuie sa stie pagina de catalog ca sa-si scrie datele structurate. */
export interface ArgumenteDateCatalog {
  business: { slug: string; custom_domain: string | null; business_name: string; store_name: string | null; store_city: string | null; cover_url: string | null; is_published: boolean };
  seo: StoreSeo;
  setari: { titlu: string };
  sp: Record<string, string | string[] | undefined>;
  filtre: FiltreCitite;
  numeCategorie: string;
  parinteCategorie: string | null;
  products: StorefrontProduct[];
  reusitPeServer: boolean;
  esteCiorna: boolean;
  /** Pagina de rezultate ale cautarii (`/cautare`). */
  esteCautare: boolean;
  /**
   * `subarboreAreProduse` pentru categoria paginii (decizia 6). `false` = pagina e
   * `noindex`; `null` = nu stim (fara rezumat, sau pagina e catalogul intreg).
   */
  subarboreCuProduse: boolean | null;
}

/**
 * Pagina asta isi scrie datele structurate?
 *
 * Regula e una singura: descriem doar pagina care se descrie si pe sine, adica
 * aceea al carei canonical arata catre ea insasi si care are voie in index. Orice
 * altceva ar fi un al doilea semnal, care contrazice primul.
 *
 * ⚠ E un predicat SEPARAT, nu doar prima linie din `construiesteDateCatalog`: randarea
 * il intreaba INAINTE sa ceara contextul descrierii, ca paginile care nu emit nimic sa
 * nu plateasca citirile degeaba (ciorna, `/cautare`, adresele filtrate).
 */
export function emiteDateCatalog(
  a: Pick<ArgumenteDateCatalog, "business" | "seo" | "sp" | "numeCategorie" | "esteCiorna" | "esteCautare" | "subarboreCuProduse">,
): boolean {
  // Magazin nepublicat sau previzualizare: `metadataMagazin` raspunde deja cu
  // `noindex, nofollow`. Ce nu se indexeaza, nu se descrie.
  if (a.esteCiorna) return false;
  if (a.seo.noindex) return false;

  // Rezultatele cautarii sunt `noindex` mereu (vezi `metadataMagazin`), iar
  // `CollectionPage` ar fi descris acolo catalogul intreg sub alt nume.
  if (a.esteCautare) return false;

  /*
   * ⚠ `?cat=` in interogare: forma VECHE a paginii de categorie.
   *
   * Canonicalul ei arata catre `/magazin/<categorie>`, deci adresa curenta e o
   * dublura. Un `CollectionPage` aici ar descrie o pagina care spune singura ca
   * nu ea e cea adevarata.
   */
  if ((Array.isArray(a.sp.cat) ? a.sp.cat[0] : a.sp.cat)?.trim()) return false;

  // Categorie fara niciun produs (decizia 6): `<head>` o declara `noindex`, prin
  // aceeasi regula ca sitemapul. `null` (nu stim) nu opreste nimic.
  if (a.subarboreCuProduse === false) return false;

  // Doua sau mai multe filtre in plus: spatiu combinatoriu, declarat `noindex` in
  // `<head>` de aceeasi functie. Vezi `canonicalPagina`.
  return canonicalPagina(storeBaseUrl(a.business), a.numeCategorie, a.sp).indexabila;
}

