import type { SectionKind } from "./types";

/**
 * Catalogul de sectiuni si variante.
 *
 * Registry-ul e DATE PURE: nicio componenta React, niciun import de client.
 * Parserul (server), editorul (client) si randarea il citesc pe toate trei, iar
 * maparea catre componente traieste separat, in dispecerul din
 * `src/components/storefront/SectionRenderer.tsx`, ca sa nu tarasca tot
 * catalogul de variante in fiecare bundle care are nevoie doar de etichete.
 *
 * Costul unei variante noi: un fisier de componenta + o intrare aici. Doar
 * variantele DEJA implementate apar in registry — o intrare fara componenta ar
 * insemna o sectiune care nu randeaza nimic.
 *
 * Migrarea setarilor este deliberat progresiva. Sectiunile „classic" continua sa
 * citeasca flag-urile lor din `page_content` exact ca azi; setarile se muta in
 * `settings`-ul sectiunii abia cand construim variantele acelei sectiuni. Asa
 * decompunerea nu schimba niciun comportament.
 */

// ---------------------------------------------------------------------------
// Descriptori de campuri (genereaza automat formularul din editor)
// ---------------------------------------------------------------------------

export interface ShowIf {
  key: string;
  equals: unknown;
}

interface FieldBase {
  key: string;
  label: string;
  help?: string;
  showIf?: ShowIf;
}

export type Field =
  | (FieldBase & { type: "text"; placeholder?: string; maxLength?: number })
  | (FieldBase & { type: "textarea"; placeholder?: string; maxLength?: number })
  | (FieldBase & { type: "link"; placeholder?: string })
  | (FieldBase & { type: "toggle" })
  | (FieldBase & { type: "select"; options: { value: string; label: string }[] })
  | (FieldBase & { type: "color"; allowEmpty?: boolean })
  | (FieldBase & { type: "image" })
  | (FieldBase & { type: "range"; min: number; max: number; step?: number; unit?: string })
  | (FieldBase & { type: "icon" })
  | (FieldBase & { type: "products" })
  | (FieldBase & { type: "category" })
  | (FieldBase & { type: "repeater"; itemLabel: string; fields: Field[]; max?: number })
  /**
   * Lista de actiuni care se pot reordona si stinge una cate una — iconitele din
   * header, de exemplu. Valoarea salvata e `{ key, on }[]`, deci o actiune
   * stinsa isi pastreaza locul si revine acolo cand e reaprinsa.
   */
  | (FieldBase & { type: "actions"; options: { value: string; label: string }[] });

/** O intrare din valoarea unui camp `actions`. */
export interface ActionState {
  key: string;
  on: boolean;
}

export type VariantTag = "clasic" | "simplu" | "indraznet" | "cu imagine" | "compact" | "elegant" | "detaliat";

export interface VariantMeta {
  label: string;
  tags: VariantTag[];
  /**
   * `contained` primeste containerul si spatiul vertical standard de la shell;
   * `full` se intinde pe toata latimea si isi gestioneaza singura spatierea.
   */
  layout: "contained" | "full";
  /**
   * Inaltimea naturala a sectiunii, in px la latime de desktop. Miniatura din
   * galerie foloseste valoarea ca sa aiba proportia corecta: un header e o
   * banda joasa, un hero e aproape un ecran.
   */
  previewHeight?: number;
  /**
   * Latimea la care se randeaza miniatura, cand cea aleasa din comutatorul
   * telefon/calculator n-are sens pentru sectiunea asta. Panourile inguste —
   * sertarul de cos si modalul de comanda — sunt singurele care o folosesc azi.
   */
  previewWidth?: number;
  /**
   * Unde traieste varianta: un panou peste magazin (sertar, modal) sau o pagina
   * de sine statatoare, cu adresa proprie.
   *
   * Nu e o subtilitate de aspect, ci de comportament: la `page`, butonul de cos
   * navigheaza in loc sa deschida ceva, si asta trebuie sa se stie si in header,
   * si in rute, si in invelisul paginilor fara catalog. Implicit `panel`, ca
   * variantele existente sa insemne exact ce inseamnau.
   */
  surface?: "panel" | "page";
  /**
   * Varianta emite ea insasi H1-ul paginii — vizibil, ca la hero-ul cu text
   * peste imagine, sau doar pentru cititoarele de ecran, ca la celelalte.
   *
   * Pagina de magazin il citeste ca sa stie daca mai trebuie sa puna unul de
   * rezerva: hero-ul e singurul emitent de azi si se poate si stinge, si sterge.
   */
  providesH1?: boolean;
  /**
   * Varianta are nevoie de lista categoriilor de nivel intai. Paginile fara
   * catalog o incarca doar cand asa ceva e ales — altfel ar fi o interogare in
   * plus pe fiecare pagina de produs, degeaba.
   */
  needsCategories?: boolean;
  /**
   * Varianta contine deja o caseta de cautare, deci cea din sectiunea de catalog
   * se ascunde. Fara asta, pagina de magazin ar avea doua casete una sub alta.
   */
  replacesCatalogSearch?: boolean;
  /**
   * Varianta isi randeaza singura banda de anunt, in interiorul ei. Bara de
   * anunt separata nu se mai afiseaza; fara asta, mesajul ar aparea de doua ori,
   * o data deasupra header-ului si o data inauntru.
   */
  hostsAnnouncement?: boolean;
  /**
   * Ce trebuie sa AIBA magazinul ca varianta sa poata fi aleasa.
   *
   * Aici intra doar lipsuri care lasa o jumatate de design GOALA, nu preferinte.
   * Pragul de categorii a stat candva tot aici si a fost o greseala — oprea
   * magazinul cu trei categorii inca goale sa aleaga tocmai designul pentru care
   * si le facea, desi bara aceea arata bine si cu trei randuri. Bannerul e alt
   * caz: fara el, jumatatea din dreapta a hero-ului e o suprafata alba, si nu
   * exista reglaj care sa o umple.
   */
  requires?: { minBanners?: number };
  /**
   * Ce trebuie sa stie comerciantul dupa ce alege varianta.
   *
   * Pentru design-urile care depind de ceva reglat in ALT ecran: fara nota, el
   * alege designul, nu vede elementul care il defineste si crede ca s-a stricat.
   */
  note?: string;
  fields: Field[];
  defaults?: Record<string, unknown>;
}

export interface SectionMeta {
  label: string;
  /** Nume de iconita Lucide, rezolvat in editor. */
  icon: string;
  scope: "chrome" | "home" | "product" | "shop" | "commerce";
  /** Poate exista o singura instanta (header, footer, grila principala). */
  singleton: boolean;
  /** Poate fi stearsa din lista de sectiuni. */
  removable: boolean;
  /**
   * Apare in „Design sectiuni".
   *
   * Doar sectiunile pentru care construim mai multe design-uri. Un ecran plin de
   * sectiuni cu o singura varianta ar da impresia unei alegeri care nu exista;
   * restul raman reglabile din editorul magazinului, ca pana acum.
   */
  inCatalog?: boolean;
  variants: Record<string, VariantMeta>;
}

// ---------------------------------------------------------------------------
// Catalogul
// ---------------------------------------------------------------------------

/**
 * Iconitele de actiune dintr-un header, in ordinea implicita.
 *
 * Lista e comuna tuturor variantelor, ca setarea sa insemne acelasi lucru
 * oriunde: cine muta cosul inaintea telefonului gaseste aceeasi optiune si dupa
 * ce schimba designul header-ului.
 */
export const HEADER_ACTIONS = [
  { value: "cautare", label: "Cautare" },
  { value: "telefon", label: "Telefon" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "cos", label: "Cos" },
];

export type HeaderAction = "cautare" | "telefon" | "whatsapp" | "cos";

/**
 * Ce iconite stie sa afiseze fiecare varianta de header.
 *
 * Lista ajunge in doua locuri: optiunile campului „Iconite" de mai jos si
 * `useHeaderSettings`, care filtreaza la randare. Scrise separat s-au despartit —
 * trei variante ofereau in editor un „Telefon" pe care nu il randau, deci un
 * comutator care nu facea nimic. Cele care il arata in alta parte (bara de
 * contact, bara de sus) il au din alt camp, nu de aici.
 */
export const HEADER_VARIANT_ACTIONS: Record<string, HeaderAction[]> = {
  search: ["telefon", "whatsapp", "cos"],
  centered: ["cautare", "whatsapp", "cos"],
  editorial: ["cautare", "whatsapp", "cos"],
  wedge: ["cautare", "telefon", "whatsapp", "cos"],
  market: ["whatsapp", "cos"],
  pills: ["telefon", "whatsapp", "cos"],
  nav: ["cautare", "telefon", "whatsapp", "cos"],
};

/**
 * Setarile pe care le au toate variantele de header.
 *
 * Fontul nu e o familie libera, ci alegerea intre cele doua deja incarcate de
 * magazin (titluri sau text). O a treia familie doar pentru meniu ar insemna un
 * fisier de font in plus descarcat de fiecare vizitator, pentru cateva cuvinte.
 */
function headerFields(suportate: readonly HeaderAction[]): Field[] {
  return [
    {
      key: "actions",
      type: "actions",
      label: "Iconite",
      help: "Ordinea si care se vad. Cele fara date completate lipsesc oricum.",
      // Ordinea implicita ramane cea din HEADER_ACTIONS, comuna tuturor
      // variantelor: cine muta cosul inaintea telefonului gaseste aceeasi
      // optiune si dupa ce schimba designul header-ului.
      options: HEADER_ACTIONS.filter((o) => (suportate as readonly string[]).includes(o.value)),
    },
    {
      key: "menuFont",
      type: "select",
      label: "Fontul meniului",
      options: [
        { value: "body", label: "Ca textul magazinului" },
        { value: "heading", label: "Ca titlurile" },
      ],
    },
    {
      key: "menuCase",
      type: "select",
      label: "Scrierea meniului",
      options: [
        { value: "normal", label: "Normala" },
        { value: "majuscule", label: "Majuscule spatiate" },
      ],
    },
  ];
}

const HEADER_DEFAULTS = { menuFont: "body", menuCase: "normal" };

/**
 * Reglajele pe care le au TOATE variantele de pagina de produs.
 *
 * Aici intra doar lucruri care azi sunt scrise in cod, nu si cele care au deja
 * un comutator in editorul magazinului (insignele de incredere, numarul de
 * vizitatori, estimarea de livrare, efectul butonului, intervalul de pret). Doua
 * comutatoare pentru acelasi lucru inseamna, mai devreme sau mai tarziu, un
 * comerciant care stinge unul si nu intelege de ce lucrul ramane aprins.
 */
const PDP_FIELDS_COMUNE: Field[] = [
  { key: "showBreadcrumb", type: "toggle", label: "Arata firimiturile de navigare" },
  {
    key: "showAddToCart", type: "toggle", label: "Arata butonul „Adauga in cos”",
    help: "Stins, ramane doar comanda directa. In magazinul cu un singur produs butonul nu apare oricum, fiindca acolo nu exista cos.",
  },
];

const PDP_DEFAULTS_COMUNE = { showBreadcrumb: true, showAddToCart: true };

/**
 * Setarile comune modelelor de pagina de cos.
 *
 * Doar ce tine de pagina in sine. Ce se intampla la comanda — campuri
 * personalizate, optiuni suplimentare, cod de reducere — ramane in
 * `page_content.checkout_config`, unde era, ca sa nu ajunga aceeasi decizie in
 * doua locuri.
 */
const CART_PAGE_FIELDS: Field[] = [
  {
    key: "showProgress",
    type: "toggle",
    label: "Arata progresul catre livrarea gratuita",
    help: "Se vede doar daca ai setat un prag de livrare gratuita.",
  },
  {
    key: "showRecommendations",
    type: "toggle",
    label: "Arata produse recomandate",
    help: "Sub lista de produse, ca in sertarul de cos.",
  },
];

const CART_PAGE_DEFAULTS = { showProgress: true, showRecommendations: true };

/**
 * Grupurile de filtre ale paginii de catalog.
 *
 * Sunt STATICE, desi valorile dinauntru vin din produsele fiecarui magazin:
 * comerciantul alege ce FELURI de filtre se vad si in ce ordine, nu ce valori.
 * Asa reglajul incape in campul de tip `actions`, care stie deja sa pastreze
 * ordinea si sa adauge la coada un grup aparut mai tarziu — fara un tip de camp
 * nou, cu optiuni venite din date.
 */
export const GRUPURI_FILTRE = [
  { value: "categorii", label: "Categorii" },
  { value: "pret", label: "Pret, reduceri si stoc" },
  { value: "atribute", label: "Atribute (marime, culoare)" },
  { value: "brand", label: "Brand" },
  { value: "etichete", label: "Etichete" },
  { value: "specificatii", label: "Specificatii" },
];

/**
 * Ce trebuie sa stie comerciantul dupa ce alege un design de pagina de catalog.
 *
 * Alegerea nu schimba doar aspectul: muta produsele de pe pagina principala,
 * deci merita spus raspicat, inainte de a fi publicata.
 */
const SHOP_NOTA =
  "Produsele capata o pagina proprie, cu adresa ei si cu toate filtrele. Implicit raman si pe pagina principala; le poti muta complet de aici, din primul comutator.";

/**
 * Reglajele comune celor trei modele.
 *
 * Doar ce tine de PAGINA. Ce produse se vad — ascunde-le pe cele fara imagini
 * sau fara stoc — ramane in „Editeaza magazinul", unde era: aceeasi decizie in
 * doua locuri inseamna, mai devreme sau mai tarziu, un comerciant care stinge
 * unul si nu intelege de ce lucrul ramane aprins.
 */
/**
 * Sortarile pe care le stie catalogul.
 *
 * „Relevanta" lipseste deliberat: nu e o alegere a comerciantului, exista doar
 * cat timp vizitatorul are o cautare activa.
 */
export const SORTARI_CATALOG = [
  { value: "newest", label: "Cele mai noi" },
  { value: "price_asc", label: "Pret crescator" },
  { value: "price_desc", label: "Pret descrescator" },
  { value: "name_asc", label: "Nume A-Z" },
  { value: "popular", label: "Recomandate" },
];

const SHOP_FIELDS: Field[] = [
  {
    key: "pastreazaGrilaAcasa", type: "toggle", label: "Pastreaza produsele si pe pagina principala",
    help: "Pornit, pagina principala ramane cu grila ei, iar pagina Magazin e locul cu toate filtrele. Stins, produsele se muta complet aici.",
  },

  // --- Antet ---------------------------------------------------------------
  { key: "titlu", type: "text", label: "Titlul paginii", placeholder: "Toate produsele", maxLength: 60 },
  {
    key: "arataTitlu", type: "toggle", label: "Arata titlul",
    help: "Stins, titlul ramane doar pentru cititoarele de ecran si pentru Google.",
  },
  {
    key: "subtitlu", type: "textarea", label: "Text sub titlu",
    placeholder: "Echipamente de protectie pentru santier, birou si atelier.",
    maxLength: 300,
    help: "Un rand-doua despre ce gaseste vizitatorul aici. Ajuta si la cautari.",
  },
  {
    key: "imagineAntet", type: "image", label: "Imagine de antet",
    help: "Se intinde pe toata latimea, deasupra titlului. Fara ea, pagina incepe direct cu titlul.",
  },
  { key: "arataFirimituri", type: "toggle", label: "Arata firimiturile de navigare" },
  { key: "arataNumarul", type: "toggle", label: "Arata cate produse s-au gasit" },

  // --- Grila ---------------------------------------------------------------
  {
    key: "coloane", type: "select", label: "Produse pe rand, pe calculator",
    options: [
      { value: "2", label: "2" },
      { value: "3", label: "3" },
      { value: "4", label: "4" },
      { value: "5", label: "5" },
      { value: "6", label: "6" },
    ],
  },
  {
    key: "coloaneMobil", type: "select", label: "Produse pe rand, pe telefon",
    options: [
      { value: "1", label: "1, cu carduri mari" },
      { value: "2", label: "2" },
    ],
  },
  {
    key: "perPage", type: "range", label: "Produse pe pagina",
    min: 8, max: 96, step: 4, unit: " produse",
    help: "Mai multe inseamna mai putine apasari, dar o pagina mai grea pe telefon.",
  },
  {
    key: "modPaginare", type: "select", label: "Cum se vad urmatoarele produse",
    options: [
      { value: "pagini", label: "Pagini numerotate" },
      { value: "buton", label: "Buton „Incarca mai multe”" },
      { value: "infinit", label: "Se incarca la derulare" },
    ],
    help: "Paginile numerotate raman scrise in adresa la toate trei, deci Google le gaseste oricum.",
  },

  // --- Filtre --------------------------------------------------------------
  {
    key: "grupuriFiltre", type: "actions", label: "Filtre",
    help: "Ordinea si care se vad. Cele fara date in produse lipsesc oricum.",
    options: GRUPURI_FILTRE,
  },
  {
    key: "valoriVizibile", type: "range", label: "Cate valori se vad per filtru",
    min: 3, max: 20, step: 1, unit: " valori",
    help: "Restul se deschid cu o apasare. Valorile bifate raman mereu la vedere.",
  },
  { key: "arataNumaratori", type: "toggle", label: "Arata cate produse are fiecare valoare" },
  {
    key: "filtreDesfasurate", type: "toggle", label: "Filtrele pornesc desfasurate",
    help: "Implicit sunt pliate, ca vizitatorul sa vada toata lista de filtre dintr-o privire si sa deschida doar ce il intereseaza. Porneste-l daca ai putine atribute si vrei totul la vedere.",
  },

  // --- Sortare -------------------------------------------------------------
  {
    key: "sortareImplicita", type: "select", label: "Sortarea implicita a paginii",
    options: [
      { value: "", label: "Ca in Editeaza magazinul" },
      ...SORTARI_CATALOG,
    ],
    help: "Gol = ramane sortarea aleasa pentru tot magazinul. Aici o poti schimba doar pentru pagina asta.",
  },
  {
    key: "sortariOferite", type: "actions", label: "Sortari oferite vizitatorului",
    options: SORTARI_CATALOG,
  },

  // --- Sub grila -----------------------------------------------------------
  {
    key: "textSubGrila", type: "textarea", label: "Text sub produse",
    maxLength: 2000,
    help: "Apare sub grila, dupa paginare. Locul obisnuit pentru un text de prezentare a gamei.",
  },
];

const SHOP_DEFAULTS = {
  pastreazaGrilaAcasa: true,
  titlu: "Toate produsele",
  arataTitlu: true,
  arataFirimituri: true,
  arataNumarul: true,
  coloaneMobil: "2",
  perPage: 20,
  modPaginare: "pagini",
  valoriVizibile: 6,
  arataNumaratori: true,
  filtreDesfasurate: false,
  sortareImplicita: "",
};

export const SECTION_REGISTRY: Partial<Record<SectionKind, SectionMeta>> = {
  // --- Chrome -------------------------------------------------------------
  announcement: {
    label: "Bara de anunt",
    icon: "Megaphone",
    scope: "chrome",
    singleton: true,
    removable: true,
    variants: {
      marquee: { label: "Text derulant", tags: ["clasic"], layout: "full", previewHeight: 40, fields: [] },
    },
  },
  header: {
    label: "Header",
    icon: "PanelTop",
    scope: "chrome",
    singleton: true,
    removable: false,
    inCatalog: true,
    variants: {
      classic: { label: "Simplu", tags: ["clasic"], layout: "full", previewHeight: 70, fields: [] },
      search: {
        label: "Cu bara mare de cautare",
        tags: ["indraznet"],
        layout: "full",
        // Cauta in catalog direct din header, cu selector de categorie. Pe pagina
        // de magazin filtreaza pe loc; de pe alte pagini duce acolo cu `?q=`.
        previewHeight: 120,
        needsCategories: true,
        replacesCatalogSearch: true,
        fields: headerFields(HEADER_VARIANT_ACTIONS.search),
        defaults: HEADER_DEFAULTS,
      },
      centered: {
        label: "Logo la mijloc",
        tags: ["elegant", "clasic"],
        layout: "full",
        // Randul cu contact, logo si iconite, plus randul de meniu.
        previewHeight: 148,
        fields: [
          ...headerFields(HEADER_VARIANT_ACTIONS.centered),
          { key: "showContact", type: "toggle", label: "Arata contactul langa logo" },
        ],
        defaults: { ...HEADER_DEFAULTS, showContact: true },
      },
      editorial: {
        label: "Elegant, cu mesaj derulant",
        tags: ["elegant", "simplu"],
        layout: "full",
        // Bara de contact, randul cu logo si meniu, banda de anunt.
        previewHeight: 144,
        hostsAnnouncement: true,
        note: "Mesajul derulant se scrie si se porneste din Editeaza magazinul > Design magazin, la „Bara de anunt”. Aici il vezi ca exemplu.",
        fields: [
          ...headerFields(HEADER_VARIANT_ACTIONS.editorial),
          { key: "showTopBar", type: "toggle", label: "Arata bara de contact" },
        ],
        defaults: { ...HEADER_DEFAULTS, showTopBar: true },
      },
      wedge: {
        label: "Fundal inchis, colt colorat",
        tags: ["indraznet", "simplu"],
        layout: "full",
        previewHeight: 88,
        fields: [
          ...headerFields(HEADER_VARIANT_ACTIONS.wedge),
          {
            key: "menuAlign",
            type: "select",
            label: "Pozitia meniului",
            options: [
              { value: "centru", label: "La mijloc" },
              { value: "stanga", label: "Langa logo" },
            ],
          },
        ],
        defaults: { ...HEADER_DEFAULTS, menuAlign: "centru" },
      },
      market: {
        label: "Magazin mare, cu categorii",
        tags: ["indraznet"],
        layout: "full",
        // Bara de servicii, randul principal cu cautare lata si bara de
        // categorii + meniu + telefon.
        previewHeight: 168,
        needsCategories: true,
        replacesCatalogSearch: true,
        fields: [
          ...headerFields(HEADER_VARIANT_ACTIONS.market),
          { key: "showTopBar", type: "toggle", label: "Arata bara de sus" },
          {
            key: "topText",
            type: "text",
            label: "Mesaj in bara de sus",
            placeholder: "Livrare gratuita peste 300 lei",
            maxLength: 90,
            showIf: { key: "showTopBar", equals: true },
          },
          { key: "showHotline", type: "toggle", label: "Arata telefonul in bara de categorii" },
        ],
        defaults: { ...HEADER_DEFAULTS, showTopBar: true, showHotline: true },
      },
      pills: {
        label: "Rotunjit, cu butoane colorate",
        tags: ["indraznet", "compact"],
        layout: "full",
        // Banda pe fundalul paginii, cu pastila de categorii, cautare rotunjita
        // cu buton colorat, buton conturat de actiune si iconite in cerculete.
        previewHeight: 116,
        needsCategories: true,
        replacesCatalogSearch: true,
        fields: [
          ...headerFields(HEADER_VARIANT_ACTIONS.pills),
          {
            key: "showAction",
            type: "toggle",
            label: "Arata butonul de actiune",
            help: "Stins, header-ul ramane cu categoriile, cautarea si iconitele.",
          },
          {
            key: "actionLabel",
            type: "text",
            label: "Text buton",
            placeholder: "Reduceri",
            maxLength: 24,
            showIf: { key: "showAction", equals: true },
          },
          {
            key: "actionHref",
            type: "link",
            label: "Link buton",
            help: "Gol = produsele cu reducere din magazin. Poti pune o pagina proprie sau o adresa externa.",
            showIf: { key: "showAction", equals: true },
          },
        ],
        // Stins implicit: vezi comentariul din `HeaderPills`. Eticheta ramane
        // completata, ca aprinderea butonului sa dea imediat ceva cu sens.
        defaults: { ...HEADER_DEFAULTS, showAction: false, actionLabel: "Reduceri" },
      },
      nav: {
        label: "Meniu langa logo",
        tags: ["simplu", "elegant"],
        layout: "full",
        // Meniul sta langa logo, cautarea deschide un panou in loc sa ocupe
        // spatiu permanent, iar cosul e o pastila inchisa cu totalul in ea.
        previewHeight: 72,
        needsCategories: true,
        fields: headerFields(HEADER_VARIANT_ACTIONS.nav),
        defaults: HEADER_DEFAULTS,
      },
    },
  },
  footer: {
    label: "Footer",
    icon: "PanelBottom",
    scope: "chrome",
    singleton: true,
    removable: false,
    inCatalog: true,
    variants: {
      dark: {
        label: "Inchis, pe coloane",
        tags: ["clasic", "indraznet"],
        layout: "full",
        previewHeight: 560,
        needsCategories: true,
        fields: [
          {
            key: "showTagline",
            type: "toggle",
            label: "Arata sloganul sub logo",
            help: "Sloganul din datele magazinului. Stins, in coloana ramane doar logo-ul.",
          },
        ],
        defaults: { showTagline: false },
      },
      columns: {
        label: "Deschis, pe coloane",
        tags: ["simplu", "cu imagine"],
        layout: "full",
        previewHeight: 560,
        needsCategories: true,
        fields: [
          {
            key: "showTagline",
            type: "toggle",
            label: "Arata sloganul sub logo",
            help: "Sloganul din datele magazinului. Stins, in coloana ramane doar logo-ul.",
          },
        ],
        defaults: { showTagline: false },
      },
      centered: {
        label: "Centrat, aerisit",
        tags: ["elegant", "simplu"],
        layout: "full",
        previewHeight: 620,
        fields: [
          {
            key: "showTagline",
            type: "toggle",
            label: "Arata sloganul sub logo",
            help: "Sloganul din datele magazinului. Stins, in coloana ramane doar logo-ul.",
          },
        ],
        defaults: { showTagline: false },
      },
    },
  },

  // --- Pagina magazin -----------------------------------------------------
  hero: {
    label: "Hero",
    icon: "Image",
    scope: "home",
    singleton: true,
    removable: true,
    inCatalog: true,
    variants: {
      // Toate trei emit H1-ul paginii: `banners` si `categories` unul ascuns,
      // `overlay` numele magazinului scris peste imagine.
      banners: { label: "Doar imagini", tags: ["clasic", "cu imagine"], layout: "full", previewHeight: 655, providesH1: true, fields: [] },
      categories: {
        label: "Categorii la stanga, bannere la dreapta",
        tags: ["cu imagine", "compact"],
        layout: "full",
        previewHeight: 515,
        providesH1: true,
        // Bara de categorii tine partea stanga; dreapta o tine bannerul. Fara el
        // ramane un gol de doua treimi din latime, pe care nimic nu il acopera.
        requires: { minBanners: 1 },
        fields: [
          {
            key: "maxCategories",
            type: "range",
            label: "Cate categorii se vad",
            // De la doua: magazinul cu putine categorii alege oricum varianta, iar
            // un prag mai mare decat cate are ar fi fost un reglaj fara efect.
            min: 2,
            // Bara are loc fizic pentru zece randuri; peste, reglajul promitea
            // ceva ce nu se vedea, iar comerciantul il urca degeaba.
            max: 10,
            step: 1,
          },
        ],
        defaults: { maxCategories: 10 },
      },
      overlay: {
        label: "Imagine cu text peste",
        providesH1: true,
        tags: ["clasic", "cu imagine", "indraznet"],
        layout: "full",
        previewHeight: 420,
        fields: [],
      },
    },
  },
  usp_strip: {
    label: "Beneficii pe scurt",
    icon: "ShieldCheck",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      icons: { label: "Iconite", tags: ["detaliat"], layout: "full", fields: [] },
    },
  },
  catalog_toolbar: {
    label: "Cautare si filtre",
    icon: "Search",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      classic: { label: "Cautare, sortare si filtre", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  category_nav: {
    label: "Categorii",
    icon: "LayoutGrid",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      classic: { label: "Butoane rotunde", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  shipping_progress: {
    label: "Prag transport gratuit",
    icon: "Truck",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      banner: { label: "Bara de progres", tags: ["clasic", "compact"], layout: "contained", fields: [] },
    },
  },
  /**
   * Randul de produse NU are catalog de design-uri.
   *
   * Cele doua variante oglindesc comutatorul Grila/Carusel din editorul
   * magazinului (`page_content.product_sections[].layout`), care ramane singura
   * sursa a asezarii. Sunt aici doar ca parserul si derivarea classic sa aiba ce
   * scrie; design-uri proprii de rand facem separat, mai tarziu.
   */
  product_row: {
    label: "Rand de produse",
    icon: "Rows3",
    scope: "home",
    singleton: false,
    /*
     * ⚠ Nu se sterge de aici, si nici nu se duplica.
     *
     * Continutul randului traieste in `page_content.product_sections`; randul din
     * design e doar oglinda lui. `edit.ts` refuza de mult si stergerea, si
     * adaugarea — un rand nascut aici ar avea un id fara pereche in continut,
     * deci n-ar aparea niciodata in magazin — dar butoanele se afisau dupa
     * steagurile de aici, deci comerciantul apasa cosul de gunoi si nu se
     * intampla nimic: nici lista neschimbata nu se explica, nici vreun mesaj nu
     * aparea. Randurile se fac si se sterg din „Editeaza magazinul".
     */
    removable: false,
    variants: {
      grid: { label: "Grila", tags: ["clasic"], layout: "contained", fields: [] },
      carousel: { label: "Carusel", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  product_grid: {
    label: "Catalog produse",
    icon: "Grid3x3",
    scope: "home",
    singleton: true,
    removable: false,
    variants: {
      classic: { label: "Standard", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  benefits: {
    label: "Beneficii",
    icon: "Sparkles",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      list: { label: "Lista", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  reviews: {
    label: "Recenzii",
    icon: "Star",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      grid: { label: "Grila", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  gallery: {
    label: "Galerie",
    icon: "Images",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      grid: { label: "Grila", tags: ["clasic", "cu imagine"], layout: "contained", fields: [] },
    },
  },
  about: {
    label: "Despre noi",
    icon: "FileText",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      classic: { label: "Clasic", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  contact: {
    label: "Contact",
    icon: "Phone",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      classic: { label: "Clasic", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },

  // --- Pagina de produs ---------------------------------------------------
  product_page: {
    label: "Pagina de produs",
    icon: "Package",
    scope: "product",
    singleton: true,
    removable: false,
    inCatalog: true,
    variants: {
      classic: {
        label: "Clasic",
        tags: ["clasic"],
        layout: "full",
        // Miniatura arata partea de sus a paginii — galeria si zona de
        // cumparare. Pagina intreaga trece de 3000 px, iar micsorata intr-un
        // card ar deveni o banda ilizibila.
        previewHeight: 780,
        fields: PDP_FIELDS_COMUNE,
        defaults: PDP_DEFAULTS_COMUNE,
      },
      detailed: {
        label: "Detaliat",
        tags: ["detaliat"],
        layout: "full",
        previewHeight: 780,
        fields: [
          ...PDP_FIELDS_COMUNE,
          {
            key: "galleryThumbs", type: "select", label: "Miniaturile galeriei",
            options: [
              { value: "left", label: "In stanga imaginii" },
              { value: "bottom", label: "Sub imagine" },
            ],
          },
          { key: "showDetails", type: "toggle", label: "Arata caseta „Detalii produs”" },
          { key: "showSpecsSummary", type: "toggle", label: "Arata un rezumat al specificatiilor" },
          {
            key: "specsCount", type: "range", label: "Cate specificatii in rezumat",
            min: 3, max: 12, step: 1, unit: " randuri",
            showIf: { key: "showSpecsSummary", equals: true },
          },
          { key: "showTiers", type: "toggle", label: "Arata reducerile de cantitate", help: "Se completeaza din fisa produsului. Preturile de treapta se aplica la comanda directa." },
          { key: "showContact", type: "toggle", label: "Arata telefonul si WhatsApp sub produs" },
        ],
        defaults: {
          ...PDP_DEFAULTS_COMUNE,
          galleryThumbs: "left",
          showDetails: true,
          showSpecsSummary: true,
          specsCount: 6,
          showTiers: true,
          showContact: true,
        },
      },
    },
  },

  // --- Pagina de catalog --------------------------------------------------
  /**
   * Unde stau produsele: pe pagina principala, ca pana acum, sau pe o pagina a
   * lor, cu adresa proprie.
   *
   * ATENTIE: `none` trebuie sa ramana PRIMA cheie, si trebuie sa ramana fara
   * `surface`. Parserul cade pe prima varianta declarata pentru orice
   * configuratie pe care n-o recunoaste, iar slotul ajunge prin designul classic
   * la absolut toate magazinele. O varianta de tip pagina pusa prima ar fi
   * deschis, in ziua deployului, o ruta publica si crawlabila pe fiecare magazin
   * publicat — inclusiv pe cele fara niciun produs, unde ar fi aratat un catalog
   * gol. Nimeni n-ar fi apasat nimic. Acelasi avertisment ca la `cart_drawer`,
   * cu o miza mai mare: acolo exista un panou ca alternativa, aici nu.
   */
  shop_page: {
    label: "Pagina Magazin",
    icon: "Store",
    scope: "shop",
    singleton: true,
    removable: false,
    inCatalog: true,
    variants: {
      none: {
        label: "Produsele stau pe pagina principala",
        tags: ["clasic"],
        layout: "contained",
        previewHeight: 420,
        fields: [],
      },
      sidebar: {
        label: "Filtre in bara laterala",
        tags: ["clasic", "detaliat"],
        layout: "full",
        surface: "page",
        previewHeight: 900,
        providesH1: true,
        note: SHOP_NOTA,
        fields: SHOP_FIELDS,
        defaults: { ...SHOP_DEFAULTS, coloane: "4" },
      },
      toolbar: {
        label: "Filtre in capul paginii",
        tags: ["simplu", "elegant"],
        layout: "full",
        surface: "page",
        previewHeight: 900,
        providesH1: true,
        note: SHOP_NOTA,
        fields: SHOP_FIELDS,
        defaults: { ...SHOP_DEFAULTS, coloane: "4" },
      },
      compact: {
        label: "Compact, pentru cataloage mari",
        tags: ["compact", "indraznet"],
        layout: "full",
        surface: "page",
        previewHeight: 900,
        providesH1: true,
        note: SHOP_NOTA,
        fields: SHOP_FIELDS,
        defaults: { ...SHOP_DEFAULTS, coloane: "5" },
      },
    },
  },

  // --- Comert -------------------------------------------------------------
  product_card: {
    label: "Card de produs",
    icon: "Square",
    scope: "commerce",
    singleton: true,
    removable: false,
    variants: { classic: { label: "Clasic", tags: ["clasic"], layout: "contained", fields: [] } },
  },
  cart_drawer: {
    label: "Cos",
    icon: "ShoppingBag",
    scope: "commerce",
    singleton: true,
    removable: false,
    inCatalog: true,
    // ATENTIE: `classic` trebuie sa ramana PRIMA cheie. Parserul cade pe prima
    // varianta declarata cand cea salvata nu se recunoaste, iar o varianta de
    // tip pagina pusa aici ar muta pe pagina, in tacere, orice magazin cu o
    // configuratie incompleta.
    variants: {
      classic: {
        label: "Sertar lateral",
        tags: ["clasic", "compact"],
        layout: "full",
        previewHeight: 620,
        // Sertarul e un panou ingust (max-w-sm): randat pe panza de desktop ar
        // fi o fasie intr-un camp gol. La latime de telefon umple cadrul, adica
        // exact cum il vad clientii care cumpara de pe telefon.
        previewWidth: 390,
        fields: [],
      },
      page_split: {
        label: "Pagina pe doua coloane",
        tags: ["clasic"],
        layout: "full",
        surface: "page",
        previewHeight: 900,
        fields: CART_PAGE_FIELDS,
        defaults: CART_PAGE_DEFAULTS,
      },
      page_wide: {
        // Cheia e veche, eticheta spune ce face: o singura coloana centrata, cea
        // mai ingusta dintre cele trei pagini de cos. „Pe toata latimea" trimitea
        // comerciantul exact in partea cealalta.
        label: "Pagina centrata, o coloana",
        tags: ["simplu", "elegant"],
        layout: "full",
        surface: "page",
        previewHeight: 900,
        fields: CART_PAGE_FIELDS,
        defaults: CART_PAGE_DEFAULTS,
      },
      page_compact: {
        label: "Pagina compacta, cu bara de comanda mereu vizibila",
        tags: ["compact", "indraznet"],
        layout: "full",
        surface: "page",
        previewHeight: 820,
        fields: CART_PAGE_FIELDS,
        defaults: CART_PAGE_DEFAULTS,
      },
    },
  },
  checkout: {
    label: "Finalizare comanda",
    icon: "ClipboardList",
    scope: "commerce",
    singleton: true,
    removable: false,
    inCatalog: true,
    // La fel ca la cos: `classic` ramane prima cheie declarata.
    variants: {
      classic: {
        label: "Formular in fereastra",
        tags: ["clasic", "compact"],
        layout: "full",
        // Cat inaltimea data panoului in miniatura: formularul intreg trece de
        // 1800 px si ar face din fiecare card un perete.
        previewHeight: 900,
        previewWidth: 390,
        fields: [],
      },
      page_two_col: {
        label: "Pagina separata, cu rezumat lateral",
        tags: ["clasic", "elegant"],
        layout: "full",
        surface: "page",
        previewHeight: 1000,
        fields: [],
      },
    },
  },
};

export function sectionMeta(kind: SectionKind): SectionMeta | undefined {
  return SECTION_REGISTRY[kind];
}

export function variantMeta(kind: SectionKind, variant: string): VariantMeta | undefined {
  return SECTION_REGISTRY[kind]?.variants[variant];
}

/** Prima varianta declarata a unei sectiuni — refugiul cand cea salvata dispare. */
export function firstVariant(kind: SectionKind): string | undefined {
  const meta = SECTION_REGISTRY[kind];
  if (!meta) return undefined;
  return Object.keys(meta.variants)[0];
}
