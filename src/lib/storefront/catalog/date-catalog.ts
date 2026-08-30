import { canonicalCatalog, type FiltreCitite } from "@/lib/storefront/catalog/url";
import { slugCategorie } from "@/lib/storefront/category-href";
import { SEGMENT_MAGAZIN } from "@/lib/pages/reserved-slugs";
import { deriveStoreTitle, storeBaseUrl, type StoreSeo } from "@/lib/seo";
import { jsonLdSafe } from "@/lib/json-ld";
import {
  firimituriJsonLd, graf, listaJsonLd, paginaWebJsonLd, referintaMagazin,
  type ElementLista, type TreaptaFirimitura,
} from "@/lib/storefront/date-structurate";
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
 */
export function titluSiDescriere(
  seo: StoreSeo,
  categorie: string,
  displayName: string,
  oras: string | null | undefined,
): { titlu: string; descriere: string } {
  return {
    titlu: categorie ? `${categorie} | ${displayName}` : `Toate produsele | ${displayName}`,
    descriere:
      seo.description
      || (categorie
        ? `${categorie} de la ${displayName}. Filtreaza dupa pret, brand si atribute.`
        : `Vezi toate produsele din ${deriveStoreTitle(displayName, oras)}. Filtreaza dupa categorie, pret si atribute.`),
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
export function construiesteDateCatalog(a: {
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
}): string | null {
  // Magazin nepublicat sau previzualizare: `metadataMagazin` raspunde deja cu
  // `noindex, nofollow`. Ce nu se indexeaza, nu se descrie.
  if (a.esteCiorna) return null;
  if (a.seo.noindex) return null;

  /*
   * ⚠ `?cat=` in interogare: forma VECHE a paginii de categorie.
   *
   * Canonicalul ei arata catre `/magazin/<categorie>`, deci adresa curenta e o
   * dublura. Un `CollectionPage` aici ar descrie o pagina care spune singura ca
   * nu ea e cea adevarata.
   */
  if ((Array.isArray(a.sp.cat) ? a.sp.cat[0] : a.sp.cat)?.trim()) return null;

  const radacina = storeBaseUrl(a.business);
  const { url, indexabila } = canonicalPagina(radacina, a.numeCategorie, a.sp);
  // Doua sau mai multe filtre in plus: spatiu combinatoriu, declarat `noindex` in
  // `<head>` de aceeasi functie. Vezi `canonicalPagina`.
  if (!indexabila) return null;

  const displayName = a.business.store_name ?? a.business.business_name;
  const { titlu, descriere } = titluSiDescriere(a.seo, a.numeCategorie, displayName, a.business.store_city);

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

