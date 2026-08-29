import { adresaPostalaJsonLd, contactJsonLd, sameAsJsonLd, type IdentitateBusiness } from "@/lib/storefront/identitate-publica";

/**
 * Datele structurate (JSON-LD) ale paginilor publice, construite dintr-un singur loc.
 *
 * ═══ DE CE EXISTA FISIERUL ASTA ═══
 *
 * Pana acum JSON-LD se emitea in TREI fisiere si nicaieri altundeva: pagina
 * principala a magazinului (`Store`), pagina de produs (`Product` +
 * `BreadcrumbList`) si pagina principala a site-ului de prezentare. Restul —
 * catalogul, fiecare pagina de categorie, fiecare pagina proprie a
 * comerciantului (deci si blogul si articolele lui), fiecare pagina de politici
 * — raspundeau 200 cu ZERO date structurate, desi toate au titlu propriu,
 * canonical propriu si intrare in sitemap. Adica sunt trimise anume la indexat,
 * fara nicio descriere pentru cine le indexeaza.
 *
 * Reclamat de un comerciant, verificat pe cod: paginile de categorie sunt, dupa
 * produse, cele mai valoroase adrese ale unui magazin (comentariul din
 * `sitemap.xml/route.ts` o spune de mult), iar articolele lui de blog erau
 * indexate ca pagini oarecare.
 *
 * Scris o singura data, aici, din acelasi motiv pentru care exista
 * `identitate-publica.ts`: sase rute care emit fiecare propria varianta ajung
 * garantat sa spuna lucruri diferite despre acelasi magazin.
 *
 * ═══ REGULA CARE GUVERNEAZA TOT FISIERUL ═══
 *
 * Nu se afirma NIMIC ce comerciantul n-a declarat. Fiecare camp de mai jos e
 * optional si dispare cand n-avem valoarea, in loc sa primeasca o rezerva
 * inventata. Un `datePublished` ghicit, o adresa dedusa sau o categorie pe care
 * n-a scris-o nimeni sunt afirmatii FALSE facute in numele lui — mai rele decat
 * campul lipsa, fiindca lipsa doar saraceste listarea, iar falsul o compromite.
 * Aceeasi regula e deja scrisa, cu alte cuvinte, in `product-jsonld.ts`.
 *
 * ⚠ Serializarea se face NEAPARAT cu `jsonLdSafe` (`lib/json-ld.ts`). Modulul
 * asta produce obiecte, nu siruri, tocmai ca nimeni sa nu fie tentat sa le
 * treaca prin `JSON.stringify` direct.
 */

/** Singura limba pe care o putem afirma: platforma e in romana, cap-coada. */
export const LIMBA = "ro-RO";

/** Cat text lasam intr-o descriere. Peste atat, nimeni nu mai citeste oricum. */
const MAX_DESCRIERE = 500;

/** Google taie `headline` la ~110 caractere; peste atat, campul e ignorat. */
const MAX_TITLU_ARTICOL = 110;

type Nod = Record<string, unknown>;

/**
 * Text curat dintr-un camp care poate contine HTML.
 *
 * Descrierile de produs si textele din blocuri sunt scrise intr-un editor bogat,
 * deci poarta etichete. Trecute asa mai departe, ar ajunge `<p>` si `<strong>` in
 * `description`, adica exact ce nu se citeste nicaieri ca text.
 */
export function textCurat(brut: string | null | undefined, max = MAX_DESCRIERE): string {
  if (!brut) return "";
  const curat = brut
    // Eticheta devine SPATIU, nu sir gol: `<p>unu</p><p>doi</p>` scos fara spatiu
    // ar da „unudoi". Doua cuvinte lipite arata a greseala de scriere in fiecare
    // descriere care are un paragraf.
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    // ...dar spatiul dinaintea semnelor de punctuatie e o urma a etichetei, nu
    // text: „certificari ." se citeste ca o greseala, iar descrierea asta ajunge
    // in rezultatele de cautare.
    .replace(/\s+([.,;:!?)\]])/g, "$1")
    .replace(/([([])\s+/g, "$1")
    .trim();
  return taiaLaCuvant(curat, max);
}

/**
 * Taie la `max`, dar nu prin mijlocul unui cuvant.
 *
 * ⚠ „Întreținere ușo" e felul de sfarsit care arata a greseala, nu a text taiat — si ajunge exact
 * in rezultatele de cautare. De cand descrierea se scrie pe FIECARE varianta a unui produs, se
 * vede de sapte ori pe aceeasi pagina in loc de o data.
 *
 * ⚠ Cand nu exista niciun spatiu in ultima cincime, se taie brut: un cuvant de patru sute de
 * caractere nu e text, si scurtat la jumatate n-ar mai spune nimic.
 */
function taiaLaCuvant(text: string, max: number): string {
  if (text.length <= max) return text;
  const bucata = text.slice(0, max);
  const ultimulSpatiu = bucata.lastIndexOf(" ");
  const taiat = ultimulSpatiu > max * 0.8 ? bucata.slice(0, ultimulSpatiu) : bucata;
  /*
   * ⚠ SI SEMNUL RAMAS SINGUR LA CAPAT SE SCOATE. Descrierile scrise cu liste („✔ bumbac,
   * ✔ elastic") se taie adesea fix dupa un semn, si atunci textul se incheie cu un „✔" orfan —
   * care in rezultatele de cautare arata a pagina stricata, nu a text scurtat.
   */
  return taiat.replace(/[\s•✔✓✗*+\-–—,;:|]+$/u, "").trimEnd();
}

/** Un URL absolut http(s), sau nimic. Filtru pentru orice camp scris de om. */
export function urlAbsolut(brut: string | null | undefined): string {
  const t = (brut ?? "").trim();
  return /^https?:\/\//i.test(t) ? t : "";
}

/**
 * O data calendaristica in forma pe care o citeste schema.org, sau nimic.
 *
 * Accepta ce ne dau coloanele (`timestamptz` ISO) si ce poate scrie un om
 * (`2026-08-15`). Orice altceva NU devine `datePublished`: o data invalida e o
 * eroare de validare in Search Console, iar una inventata e mai rau.
 */
export function dataIso(brut: string | null | undefined): string {
  const t = (brut ?? "").trim();
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

/**
 * Mai multe noduri intr-un singur bloc `<script>`.
 *
 * `@graph` e forma care leaga nodurile intre ele fara sa le repete: pagina,
 * firimiturile si intrebarile frecvente descriu ACEEASI adresa, iar scrise ca
 * trei scripturi independente n-ar avea cum sa se refere una la alta. Precedentul
 * e chiar in repo, la site-ul de prezentare.
 *
 * Nodurile goale cad: fiecare constructor de mai jos poate intoarce `null` cand
 * n-are ce afirma, si atunci pur si simplu lipseste din graf.
 */
export function graf(...noduri: (Nod | null | undefined)[]): Nod | null {
  // `@context` se declara O SINGURA DATA, sus. Nodurile gata construite in alta
  // parte si-l poarta cu ele (`buildProductJsonLd`), iar lasat inauntrul unui
  // `@graph` devine un context cu alt domeniu de aplicare — valid, dar exact
  // felul de subtilitate pe care n-o vrea nimeni intr-un fisier de date.
  const bune = noduri
    .filter((n): n is Nod => !!n)
    .map((n) => {
      if (!("@context" in n)) return n;
      const fara = { ...n };
      delete fara["@context"];
      return fara;
    });
  if (bune.length === 0) return null;
  if (bune.length === 1) return { "@context": "https://schema.org", ...bune[0] };
  return { "@context": "https://schema.org", "@graph": bune };
}

/* ─── Firimituri ───────────────────────────────────────────────────────────── */

export interface TreaptaFirimitura {
  nume: string;
  /** Adresa ABSOLUTA a treptei. O treapta fara adresa nu se emite. */
  url: string;
}

/**
 * `BreadcrumbList` — firul Ariadnei din rezultatele de cautare.
 *
 * ⚠ Sub doua trepte nu se emite nimic. O firimitura cu un singur element nu
 * descrie niciun drum, iar doua trepte care arata catre ACEEASI adresa sunt
 * raportate de Search Console ca firimitura invalida — exact ce s-ar intampla
 * daca cineva ar copia tiparul pe pagina principala a unui magazin cu un singur
 * produs, unde produsul CHIAR e radacina.
 */
export function firimituriJsonLd(trepte: TreaptaFirimitura[]): Nod | null {
  const curate = trepte
    .map((t) => ({ nume: t.nume.trim(), url: t.url.trim() }))
    .filter((t) => t.nume && t.url);
  // Trepte consecutive catre aceeasi adresa (magazin cu catalogul chiar pe
  // pagina principala: „Magazin" si „Toate produsele" sunt acelasi URL) se
  // contopesc, altfel iese chiar firimitura invalida de mai sus.
  const fara: TreaptaFirimitura[] = [];
  for (const t of curate) {
    if (fara.length && fara[fara.length - 1].url === t.url) continue;
    fara.push(t);
  }
  if (fara.length < 2) return null;
  return {
    "@type": "BreadcrumbList",
    itemListElement: fara.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.nume,
      item: t.url,
    })),
  };
}

/* ─── Liste de elemente ────────────────────────────────────────────────────── */

export interface ElementLista {
  url: string;
  nume?: string | null;
  imagine?: string | null;
}

/**
 * `ItemList` in forma SUMARA: pozitie + adresa, atat.
 *
 * Deliberat NU se pune cate un `Product` cu `Offer` complet pe fiecare element.
 * Pagina de catalog nu are din ce: proiectia pe care o citeste (`catalog_produs`)
 * n-are brand, n-are cod de bare si n-are starea de stoc aleasa din editor, deci
 * un `Offer` construit din ce ramane ar afirma MAI PUTIN decat pagina de produs
 * despre acelasi articol — si ar publica oferte pe o adresa care nu e canonicalul
 * lor. Forma sumara trimite crawlerul exact acolo unde datele sunt intregi.
 */
export function listaJsonLd(elemente: ElementLista[], numeLista?: string): Nod | null {
  const curate = elemente.filter((e) => urlAbsolut(e.url));
  if (curate.length === 0) return null;
  return {
    "@type": "ItemList",
    ...(numeLista?.trim() ? { name: numeLista.trim() } : {}),
    numberOfItems: curate.length,
    itemListElement: curate.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: urlAbsolut(e.url),
      ...(e.nume?.trim() ? { name: e.nume.trim() } : {}),
      ...(urlAbsolut(e.imagine) ? { image: urlAbsolut(e.imagine) } : {}),
    })),
  };
}

/* ─── Pagini ───────────────────────────────────────────────────────────────── */

/**
 * Subtipurile de `WebPage` pe care le folosim.
 *
 * Lista e INCHISA si e singura poarta prin care o valoare venita din baza poate
 * deveni `@type`. `custom_pages.seo` e o coloana `Json`: tipul TypeScript spune
 * ce ne asteptam sa gasim acolo, nu ce se afla cu adevarat. Fara lista alba,
 * cine scrie in coloana scrie direct in `<script>`-ul paginii publice.
 */
export const TIPURI_PAGINA = ["WebPage", "AboutPage", "ContactPage", "CollectionPage", "FAQPage"] as const;
export type TipPagina = (typeof TIPURI_PAGINA)[number];

export interface ArgumentePagina {
  tip?: TipPagina;
  nume: string;
  url: string;
  descriere?: string | null;
  imagine?: string | null;
  dataModificarii?: string | null;
  /** Lista pe care o poarta pagina (produse, articole). Devine `mainEntity`. */
  lista?: Nod | null;
  /** Cui apartine pagina: magazinul sau site-ul. Vezi `referintaMagazin`. */
  parteDin?: Nod | null;
  /** Entitatea pe care o DESCRIE pagina (o pagina „Despre noi" descrie firma). */
  despre?: Nod | null;
}

export function paginaWebJsonLd(a: ArgumentePagina): Nod | null {
  const nume = a.nume.trim();
  const url = urlAbsolut(a.url);
  if (!nume || !url) return null;
  const tip: TipPagina = a.tip && TIPURI_PAGINA.includes(a.tip) ? a.tip : "WebPage";
  const descriere = textCurat(a.descriere);
  const imagine = urlAbsolut(a.imagine);
  const modificata = dataIso(a.dataModificarii);
  return {
    "@type": tip,
    "@id": `${url}#pagina`,
    name: nume,
    url,
    inLanguage: LIMBA,
    ...(descriere ? { description: descriere } : {}),
    ...(imagine ? { primaryImageOfPage: { "@type": "ImageObject", url: imagine } } : {}),
    ...(modificata ? { dateModified: modificata } : {}),
    ...(a.parteDin ? { isPartOf: a.parteDin } : {}),
    ...(a.despre ? { about: a.despre } : {}),
    ...(a.lista ? { mainEntity: a.lista } : {}),
  };
}

/* ─── Intrebari frecvente ──────────────────────────────────────────────────── */

/**
 * `FAQPage` din intrebarile chiar scrise pe pagina.
 *
 * Se emite doar din blocul `faq`, adica din perechile pe care le-a introdus
 * comerciantul in editor — niciodata dintr-un titlu care se termina cu semnul
 * intrebarii. Perechile incomplete cad: o intrebare fara raspuns e o eroare de
 * validare, nu o intrebare.
 */
export function intrebariJsonLd(perechi: { q?: string; a?: string }[]): Nod | null {
  const curate = perechi
    .map((p) => ({ q: textCurat(p.q, 300), a: textCurat(p.a, 1000) }))
    .filter((p) => p.q && p.a);
  if (curate.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: curate.map((p) => ({
      "@type": "Question",
      name: p.q,
      acceptedAnswer: { "@type": "Answer", text: p.a },
    })),
  };
}

/* ─── Blog ─────────────────────────────────────────────────────────────────── */

/** Cine semneaza si cine publica: magazinul, ca organizatie. */
export interface Editor {
  nume: string;
  url: string;
  logo?: string | null;
}

function organizatie(e: Editor): Nod {
  const logo = urlAbsolut(e.logo);
  return {
    "@type": "Organization",
    name: e.nume,
    url: e.url,
    ...(logo ? { logo: { "@type": "ImageObject", url: logo } } : {}),
  };
}

export interface ArgumenteArticol {
  titlu: string;
  url: string;
  descriere?: string | null;
  imagine?: string | null;
  dataPublicarii?: string | null;
  dataModificarii?: string | null;
  editor: Editor;
  /** Numele autorului, cand comerciantul l-a scris. Altfel semneaza magazinul. */
  autor?: string | null;
  /** Blogul din care face parte articolul, cand magazinul are unul. */
  blog?: { nume: string; url: string } | null;
}

/**
 * `BlogPosting` — un articol de blog.
 *
 * `author` cade pe organizatie cand omul n-a scris un nume: Google cere campul,
 * iar magazinul CHIAR e autorul in lipsa altei mentiuni. `datePublished` insa NU
 * are rezerva inventata — vine ori din data declarata de comerciant, ori din data
 * la care s-a creat pagina, care e cel mai apropiat fapt de care dispunem.
 */
export function articolJsonLd(a: ArgumenteArticol): Nod | null {
  const titlu = a.titlu.trim().slice(0, MAX_TITLU_ARTICOL);
  const url = urlAbsolut(a.url);
  if (!titlu || !url) return null;
  const imagine = urlAbsolut(a.imagine);
  const publicat = dataIso(a.dataPublicarii);
  const modificat = dataIso(a.dataModificarii);
  const descriere = textCurat(a.descriere);
  const autor = (a.autor ?? "").trim();
  return {
    "@type": "BlogPosting",
    "@id": `${url}#articol`,
    headline: titlu,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: LIMBA,
    ...(descriere ? { description: descriere } : {}),
    ...(imagine ? { image: [imagine] } : {}),
    ...(publicat ? { datePublished: publicat } : {}),
    // `dateModified` doar cand chiar difera de publicare: aceeasi valoare de doua
    // ori nu spune nimic, iar pe paginile nemodificate ar fi doar zgomot.
    ...(modificat && modificat !== publicat ? { dateModified: modificat } : {}),
    author: autor ? { "@type": "Person", name: autor } : organizatie(a.editor),
    publisher: organizatie(a.editor),
    ...(a.blog && urlAbsolut(a.blog.url)
      ? { isPartOf: { "@type": "Blog", name: a.blog.nume, url: urlAbsolut(a.blog.url) } }
      : {}),
  };
}

export interface ArgumenteBlog {
  nume: string;
  url: string;
  descriere?: string | null;
  editor: Editor;
  articole: { titlu: string; url: string; imagine?: string | null; dataPublicarii?: string | null }[];
}

/**
 * `Blog` — pagina care aduna articolele.
 *
 * Articolele NU se deduc din blocurile paginii (un link catre un articol poate fi
 * oriunde, si un buton catre magazin ar fi trecut drept articol): se citesc din
 * paginile-surori marcate ANUME ca articol de comerciant. Ce n-a marcat el, nu
 * apare — si asta e raspunsul corect, nu o lipsa.
 */
export function blogJsonLd(a: ArgumenteBlog): Nod | null {
  const nume = a.nume.trim();
  const url = urlAbsolut(a.url);
  if (!nume || !url) return null;
  const descriere = textCurat(a.descriere);
  const articole = a.articole.filter((art) => art.titlu.trim() && urlAbsolut(art.url));
  return {
    "@type": "Blog",
    "@id": `${url}#blog`,
    name: nume,
    url,
    inLanguage: LIMBA,
    ...(descriere ? { description: descriere } : {}),
    publisher: organizatie(a.editor),
    ...(articole.length
      ? {
          blogPost: articole.map((art) => {
            const publicat = dataIso(art.dataPublicarii);
            const imagine = urlAbsolut(art.imagine);
            return {
              "@type": "BlogPosting",
              headline: art.titlu.trim().slice(0, MAX_TITLU_ARTICOL),
              url: urlAbsolut(art.url),
              mainEntityOfPage: { "@type": "WebPage", "@id": urlAbsolut(art.url) },
              ...(imagine ? { image: [imagine] } : {}),
              ...(publicat ? { datePublished: publicat } : {}),
            };
          }),
        }
      : {}),
  };
}

/* ─── Magazinul, ca entitate ───────────────────────────────────────────────── */

export interface BusinessJsonLd extends IdentitateBusiness {
  business_name: string;
  store_name?: string | null;
  tagline?: string | null;
  description?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  social?: unknown;
  website?: string | null;
}

/**
 * Nodul de identitate al magazinului: `Store` sau `OnlineStore`.
 *
 * ⚠ TIPUL SE ALEGE DUPA CE STIM. `Store` e un `LocalBusiness`, adica afirma un
 * punct de lucru fizic. Emis pentru un magazin care n-a completat nicio bucata de
 * adresa, e o afirmatie pe care nimeni n-a facut-o — si tocmai lipsa adresei e
 * ce declanseaza in Search Console avertismentul „lipseste address" pe un tip
 * care o cere. `OnlineStore` (subtip de `OnlineBusiness`) descrie exact cazul
 * comertului fara vitrina, si e majoritatea platformei.
 *
 * `@id` stabil, derivat din canonicalul magazinului, ca celelalte pagini sa poata
 * arata catre ACEEASI entitate in loc sa o redeclare fiecare cu datele ei.
 *
 * NU se emit `openingHours` si `paymentAccepted`: nu exista coloana pentru
 * niciuna, deci orice valoare ar fi inventata.
 */
export function magazinJsonLd(business: BusinessJsonLd, url: string): Nod {
  const nume = (business.store_name ?? business.business_name).trim();
  const adresa = adresaPostalaJsonLd(business);
  const sameAs = sameAsJsonLd(business);
  const slogan = (business.tagline ?? "").trim();
  // Descrierea magazinului, apoi sloganul: aceeasi ordine ca `deriveStoreDescription`,
  // ca eticheta `<meta name="description">` si datele structurate sa nu spuna
  // doua lucruri diferite despre acelasi magazin.
  const descriere = textCurat(business.description) || slogan;
  const imagini = [urlAbsolut(business.cover_url)].filter(Boolean);
  const logo = urlAbsolut(business.logo_url);
  return {
    "@type": adresa ? "Store" : "OnlineStore",
    "@id": `${url}#magazin`,
    name: nume,
    url,
    ...(descriere ? { description: descriere } : {}),
    ...(slogan ? { slogan } : {}),
    ...(imagini.length ? { image: imagini } : {}),
    ...(logo ? { logo } : {}),
    ...(adresa ? { address: adresa } : {}),
    ...contactJsonLd(business),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/**
 * Referinta scurta catre nodul de magazin, pentru `isPartOf` / `publisher`.
 *
 * ⚠ Un `@id` singur NU e de ajuns cand nodul tinta e pe ALTA pagina: crawlerul
 * citeste fiecare adresa separat, deci `{"@id": ".../#magazin"}` pus pe pagina de
 * categorie ar arata catre un nod care nu exista in graful ei. De aia referinta
 * poarta si tipul si numele: ramane o afirmatie completa singura, si se contopeste
 * cu nodul intreg acolo unde el chiar e emis.
 */
export function referintaMagazin(business: BusinessJsonLd, url: string): Nod {
  return {
    "@type": "Organization",
    "@id": `${url}#magazin`,
    name: (business.store_name ?? business.business_name).trim(),
    url,
  };
}
