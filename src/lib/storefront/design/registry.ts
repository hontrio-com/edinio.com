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
  /**
   * Campul nu mai apare in editor, fiindca alt control il inlocuieste (motivul
   * sta aici). Ramane insa citit si curatat la parsare: valorile salvate de el
   * dau mai departe vizibilitatea implicita a blocurilor (`blocuri.ts`), iar
   * scos de tot, parserul le-ar fi aruncat si paginile s-ar fi schimbat.
   */
  retras?: string;
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
  { value: "cautare", label: "Căutare" },
  { value: "telefon", label: "Telefon" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "cos", label: "Coș" },
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
/**
 * Randul de produse pe un panou gri, cu titlul mare si sagetile pe margini (tema Jupiter, etapa 16.3; panou rotunjit in
 * locul benzii pe tot ecranul de la etapa 23). Reglaj, nu varianta: varianta randului oglindeste asezarea din
 * `page_content` (grila sau carusel), deci panoul merge pe amandoua. Cheia ramane `banda`: e salvata in design.
 */
const CAMP_BANDA_RAND: Field = { key: "banda", type: "toggle", label: "Pe panou gri, cu titlu mare" };

export const HEADER_VARIANT_ACTIONS: Record<string, HeaderAction[]> = {
  search: ["telefon", "whatsapp", "cos"],
  centered: ["cautare", "whatsapp", "cos"],
  editorial: ["cautare", "whatsapp", "cos"],
  wedge: ["cautare", "telefon", "whatsapp", "cos"],
  market: ["whatsapp", "cos"],
  hipermarket: ["whatsapp", "cos"],
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
      label: "Iconițe",
      help: "Ordinea și care se văd. Cele fără date completate lipsesc oricum.",
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
        { value: "normal", label: "Normală" },
        { value: "majuscule", label: "Majuscule spațiate" },
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
  { key: "showBreadcrumb", type: "toggle", label: "Arată firimiturile de navigare" },
  {
    key: "showAddToCart", type: "toggle", label: "Arată butonul „Adaugă în coș”",
    help: "Stins, rămâne doar comanda directă. În magazinul cu un singur produs butonul nu apare oricum, fiindcă acolo nu există coș.",
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
    label: "Arată progresul către livrarea gratuită",
    help: "Se vede doar dacă ai setat un prag de livrare gratuită.",
  },
  {
    key: "showRecommendations",
    type: "toggle",
    label: "Arată produse recomandate",
    help: "Sub lista de produse, ca în sertarul de coș.",
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
  { value: "pret", label: "Preț, reduceri și stoc" },
  { value: "atribute", label: "Atribute (mărime, culoare)" },
  { value: "brand", label: "Brand" },
  { value: "etichete", label: "Etichete" },
  { value: "specificatii", label: "Specificații" },
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
    key: "pastreazaGrilaAcasa", type: "toggle", label: "Păstrează produsele și pe pagina principală",
    help: "Pornit, pagina principală rămâne cu grila ei, iar pagina Magazin e locul cu toate filtrele. Stins, grila se mută aici; dacă pagina principală n-are niciun rând de produse, grila rămâne și acolo, ca să nu fie fără produse.",
  },

  // --- Antet ---------------------------------------------------------------
  { key: "titlu", type: "text", label: "Titlul paginii", placeholder: "Toate produsele", maxLength: 60 },
  {
    key: "arataTitlu", type: "toggle", label: "Arată titlul",
    help: "Stins, titlul rămâne doar pentru cititoarele de ecran și pentru Google.",
  },
  {
    key: "subtitlu", type: "textarea", label: "Text sub titlu",
    placeholder: "Echipamente de protectie pentru santier, birou si atelier.",
    maxLength: 300,
    help: "Un rând-două despre ce găsește vizitatorul aici. Ajută și la căutări.",
  },
  {
    key: "imagineAntet", type: "image", label: "Imagine de antet",
    help: "Se întinde pe toată lățimea, deasupra titlului. Fără ea, pagina începe direct cu titlul.",
  },
  { key: "arataFirimituri", type: "toggle", label: "Arată firimiturile de navigare" },
  { key: "arataNumarul", type: "toggle", label: "Arată câte produse s-au găsit" },

  // --- Grila ---------------------------------------------------------------
  {
    key: "coloane", type: "select", label: "Produse pe rând, pe calculator",
    options: [
      { value: "2", label: "2" },
      { value: "3", label: "3" },
      { value: "4", label: "4" },
      { value: "5", label: "5" },
      { value: "6", label: "6" },
    ],
  },
  {
    key: "coloaneMobil", type: "select", label: "Produse pe rând, pe telefon",
    options: [
      { value: "1", label: "1, cu carduri mari" },
      { value: "2", label: "2" },
    ],
  },
  {
    key: "perPage", type: "range", label: "Produse pe pagină",
    min: 8, max: 96, step: 4, unit: " produse",
    help: "Mai multe înseamnă mai puține apăsări, dar o pagină mai grea pe telefon.",
  },
  {
    key: "modPaginare", type: "select", label: "Cum se văd următoarele produse",
    options: [
      { value: "pagini", label: "Pagini numerotate" },
      { value: "buton", label: "Buton „Încarcă mai multe”" },
      { value: "infinit", label: "Se încarcă la derulare" },
    ],
    help: "Paginile numerotate rămân scrise în adresă la toate trei, deci Google le găsește oricum.",
  },

  // --- Filtre --------------------------------------------------------------
  {
    key: "grupuriFiltre", type: "actions", label: "Filtre",
    help: "Ordinea și care se văd. Cele fără date în produse lipsesc oricum.",
    options: GRUPURI_FILTRE,
  },
  {
    key: "valoriVizibile", type: "range", label: "Câte valori se văd per filtru",
    min: 3, max: 20, step: 1, unit: " valori",
    help: "Restul se deschid cu o apăsare. Valorile bifate rămân mereu la vedere.",
  },
  { key: "arataNumaratori", type: "toggle", label: "Arată câte produse are fiecare valoare" },
  {
    key: "filtreDesfasurate", type: "toggle", label: "Filtrele pornesc desfășurate",
    help: "Implicit sunt pliate, ca vizitatorul să vadă toată lista de filtre dintr-o privire și să deschidă doar ce îl interesează. Pornește-l dacă ai puține atribute și vrei totul la vedere.",
  },

  // --- Sortare -------------------------------------------------------------
  {
    key: "sortareImplicita", type: "select", label: "Sortarea implicită a paginii",
    options: [
      { value: "", label: "Ca în Editează magazinul" },
      ...SORTARI_CATALOG,
    ],
    help: "Gol = rămâne sortarea aleasă pentru tot magazinul. Aici o poți schimba doar pentru pagina asta.",
  },
  {
    key: "sortariOferite", type: "actions", label: "Sortări oferite vizitatorului",
    options: SORTARI_CATALOG,
  },

  // --- Sub grila -----------------------------------------------------------
  {
    key: "textSubGrila", type: "textarea", label: "Text sub produse",
    maxLength: 2000,
    help: "Apare sub grilă, după paginare. Locul obișnuit pentru un text de prezentare a gamei.",
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

/**
 * Reglajele intregului subsol, aceleasi pe toate designurile lui (etapa 11). Coloanele au reglajele lor, in blocuri
 * (`blocuri.ts`); aici ce tine de tot subsolul. Partea legala si randul de copyright nu au reglaje de ascundere.
 */
function campuriSubsol(): Field[] {
  return [
    {
      key: "showTagline",
      type: "toggle",
      label: "Arată sloganul sub logo",
      retras: "Sloganul se arata din coloana „Logo și text”; valoarea veche da doar coloana ei implicita (etapa 11).",
    },
    {
      key: "inapoiSus",
      type: "toggle",
      label: "Butonul „Înapoi sus”",
      help: "Un buton mic la capătul coloanelor, care duce în capul paginii.",
    },
    {
      key: "copyright",
      type: "text",
      label: "Textul de lângă ©",
      placeholder: "Numele magazinului",
      maxLength: 120,
      help: "Gol, apare numele magazinului. Anul se pune singur.",
    },
    { key: "fundal", type: "color", label: "Culoarea de fundal", allowEmpty: true, help: "Implicită: culoarea designului ales." },
    {
      key: "culoareText",
      type: "color",
      label: "Culoarea textului",
      allowEmpty: true,
      help: "Implicită: a designului, iar pe un fundal ales de tine, albă sau neagră, după cum se citește mai bine.",
    },
  ];
}

export const SECTION_REGISTRY: Partial<Record<SectionKind, SectionMeta>> = {
  // --- Chrome -------------------------------------------------------------
  announcement: {
    label: "Bara de anunț",
    icon: "Megaphone",
    scope: "chrome",
    singleton: true,
    removable: true,
    variants: {
      marquee: { label: "Text derulant", tags: ["clasic"], layout: "full", previewHeight: 40, fields: [] },
    },
  },
  header: {
    label: "Antet",
    icon: "PanelTop",
    scope: "chrome",
    singleton: true,
    removable: false,
    inCatalog: true,
    variants: {
      classic: { label: "Simplu", tags: ["clasic"], layout: "full", previewHeight: 70, fields: [] },
      search: {
        label: "Cu bara mare de căutare",
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
          { key: "showContact", type: "toggle", label: "Arată contactul lângă logo" },
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
        note: "Mesajul derulant se scrie la „Bara de anunț”, sus în lista de secțiuni, și se pornește din ochiul ei. Aici îl vezi ca exemplu.",
        fields: [
          ...headerFields(HEADER_VARIANT_ACTIONS.editorial),
          { key: "showTopBar", type: "toggle", label: "Arată bara de contact" },
        ],
        defaults: { ...HEADER_DEFAULTS, showTopBar: true },
      },
      wedge: {
        label: "Fundal închis, colț colorat",
        tags: ["indraznet", "simplu"],
        layout: "full",
        previewHeight: 88,
        fields: [
          ...headerFields(HEADER_VARIANT_ACTIONS.wedge),
          {
            key: "menuAlign",
            type: "select",
            label: "Poziția meniului",
            options: [
              { value: "centru", label: "La mijloc" },
              { value: "stanga", label: "Lângă logo" },
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
          { key: "showTopBar", type: "toggle", label: "Arată bara de sus" },
          {
            key: "topText",
            type: "text",
            label: "Mesaj în bara de sus",
            placeholder: "Livrare gratuita peste 300 lei",
            maxLength: 90,
            showIf: { key: "showTopBar", equals: true },
          },
          { key: "showHotline", type: "toggle", label: "Arată telefonul în bara de categorii" },
        ],
        defaults: { ...HEADER_DEFAULTS, showTopBar: true, showHotline: true },
      },
      hipermarket: {
        label: "Hipermarket, cu meniu de categorii",
        tags: ["indraznet"],
        layout: "full",
        // Tema Jupiter (etapa 16.2, randul de sus refacut la 21): bara in culoarea principala, cautarea pe tot randul,
        // telefonul, contul si cosul, apoi butonul „Categorii produse”, cu meniul pe doua niveluri.
        previewHeight: 172,
        needsCategories: true,
        replacesCatalogSearch: true,
        fields: [
          ...headerFields(HEADER_VARIANT_ACTIONS.hipermarket),
          { key: "showTopBar", type: "toggle", label: "Arată bara de sus" },
          {
            key: "topText",
            type: "text",
            label: "Mesaj în bara de sus",
            placeholder: "Livrare in toata tara",
            maxLength: 90,
            showIf: { key: "showTopBar", equals: true },
          },
          { key: "showHotline", type: "toggle", label: "Arată telefonul lângă căutare" },
          // Etapa 24 (temele 2-30): acelasi antet, cu alt ton. Implicitele sunt aspectul de azi, deci Jupiter nu se schimba.
          {
            key: "baraNavigare",
            type: "select",
            label: "Bara de navigare",
            options: [
              { value: "alba", label: "Albă" },
              { value: "principala", label: "În culoarea principală" },
              { value: "accent", label: "În culoarea de accent" },
              { value: "deschisa", label: "Nuanță deschisă" },
            ],
          },
          {
            key: "cautareForma",
            type: "select",
            label: "Căutarea",
            options: [
              { value: "pastila", label: "Rotunjită, cu buton" },
              { value: "dreptunghi", label: "Dreptunghi, cu lupă" },
            ],
          },
          { key: "etichetaCategorii", type: "text", label: "Textul butonului de categorii", placeholder: "Toate categoriile", maxLength: 30 },
        ],
        defaults: { ...HEADER_DEFAULTS, showTopBar: true, showHotline: true, baraNavigare: "alba", cautareForma: "pastila", etichetaCategorii: "" },
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
            label: "Arată butonul de acțiune",
            help: "Stins, antetul rămâne cu categoriile, căutarea și iconițele.",
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
            help: "Gol = produsele cu reducere din magazin. Poți pune o pagină proprie sau o adresă externă.",
            showIf: { key: "showAction", equals: true },
          },
        ],
        // Stins implicit: vezi comentariul din `HeaderPills`. Eticheta ramane
        // completata, ca aprinderea butonului sa dea imediat ceva cu sens.
        defaults: { ...HEADER_DEFAULTS, showAction: false, actionLabel: "Reduceri" },
      },
      nav: {
        label: "Meniu lângă logo",
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
  // Categoriile pentru subsol le cere o coloana „Linkuri” cu categorii (`subsolCereCategorii`, etapa 11), nu designul.
  footer: {
    label: "Subsol",
    icon: "PanelBottom",
    scope: "chrome",
    singleton: true,
    removable: false,
    inCatalog: true,
    variants: {
      dark: {
        label: "Închis, pe coloane",
        tags: ["clasic", "indraznet"],
        layout: "full",
        previewHeight: 560,
        fields: campuriSubsol(),
        defaults: { showTagline: false, inapoiSus: false },
      },
      columns: {
        label: "Deschis, pe coloane",
        tags: ["simplu", "cu imagine"],
        layout: "full",
        previewHeight: 560,
        fields: campuriSubsol(),
        defaults: { showTagline: false, inapoiSus: false },
      },
      centered: {
        label: "Centrat, aerisit",
        tags: ["elegant", "simplu"],
        layout: "full",
        previewHeight: 620,
        fields: campuriSubsol(),
        defaults: { showTagline: false, inapoiSus: true },
      },
      hipermarket: {
        label: "Hipermarket, închis, cu beneficii",
        tags: ["indraznet"],
        layout: "full",
        // Tema Jupiter (refacut la etapa 21): fundal inchis scos din culoarea principala, beneficiile, coloanele, partea legala.
        previewHeight: 600,
        fields: [
          ...campuriSubsol(),
          { key: "beneficii", type: "toggle", label: "Arată beneficiile deasupra coloanelor", help: "Aceleași carduri ca la secțiunea „Beneficii pe scurt”. Le schimbi din panoul ei." },
        ],
        defaults: { showTagline: false, inapoiSus: true, beneficii: true },
      },
    },
  },

  // --- Pagina magazin -----------------------------------------------------
  hero: {
    label: "Banner principal",
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
        label: "Categorii la stânga, bannere la dreapta",
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
            label: "Câte categorii se văd",
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
        // Etapa 25.22 (11.11.2026): bannerele demo ale unor teme au textul scris in poza; peste ele, titlul s-ar suprapune.
        note: "Titlul și textul magazinului se scriu peste primul banner. Dacă bannerul are deja text în poză (cum au bannerele demo ale unor teme), cele două se suprapun: pune o poză fără text sau alege altă variantă.",
      },
      carduri: {
        // Tema Jupiter (etapa 16.3): caruselul in doua treimi, doua carduri in dreapta (in degrade de la etapa 23).
        label: "Bannere cu două carduri alăturate",
        tags: ["cu imagine", "indraznet"],
        layout: "full",
        previewHeight: 560,
        providesH1: true,
        fields: [
          {
            key: "carduri", type: "repeater", label: "Cardurile din dreapta", itemLabel: "Card", max: 2,
            help: "Lângă bannere, unul sub altul; pe telefon, sub ele. Un card fără titlu nu apare.",
            fields: [
              { key: "titlu", type: "text", label: "Titlul", maxLength: 40 },
              { key: "text", type: "textarea", label: "Textul", maxLength: 120 },
              { key: "imagine", type: "image", label: "Imaginea" },
              { key: "link", type: "link", label: "Linkul" },
            ],
          },
        ],
        defaults: { carduri: [] },
      },
      // Tema Mercur (etapa 24): o jumatate in culoare cu titlul, textul si butonul, cealalta o fotografie.
      impartit: {
        label: "Jumătate culoare, jumătate imagine",
        tags: ["indraznet", "cu imagine"],
        layout: "full",
        previewHeight: 520,
        providesH1: true,
        fields: [
          { key: "titlu", type: "text", label: "Titlul", maxLength: 60 },
          { key: "text", type: "textarea", label: "Textul", maxLength: 220 },
          { key: "buton", type: "text", label: "Textul butonului", placeholder: "Vezi produsele", maxLength: 30 },
          { key: "link", type: "link", label: "Linkul butonului" },
          { key: "imagine", type: "image", label: "Imaginea", help: "Fără imagine aleasă, prima imagine din „Bannere”." },
          {
            key: "fond", type: "select", label: "Culoarea jumătății cu text",
            options: [
              { value: "principala", label: "Culoarea principală" },
              { value: "accent", label: "Culoarea de accent" },
              { value: "inchis", label: "Negru" },
              { value: "deschis", label: "Nuanță deschisă" },
            ],
          },
        ],
        defaults: { titlu: "", text: "", buton: "", link: "", imagine: "", fond: "principala" },
      },
      // Tema Terra (etapa 24): patru placi in mozaic, una mare, una inalta si doua mici, fiecare cu titlu, text si link.
      mozaic: {
        label: "Mozaic de plăci cu text",
        tags: ["cu imagine", "detaliat"],
        layout: "full",
        previewHeight: 560,
        providesH1: true,
        fields: [
          {
            key: "placi", type: "repeater", label: "Plăcile", itemLabel: "Placă", max: 4,
            help: "Prima e cea mare, a doua cea înaltă, ultimele două cele mici. Pe telefon vin una sub alta.",
            fields: [
              { key: "titlu", type: "text", label: "Titlul", maxLength: 40 },
              { key: "text", type: "text", label: "Textul", maxLength: 80 },
              { key: "imagine", type: "image", label: "Imaginea" },
              { key: "link", type: "link", label: "Linkul" },
              {
                key: "fond", type: "select", label: "Fondul",
                options: [
                  { value: "inchis", label: "Închis" },
                  { value: "principala", label: "Culoarea principală" },
                  { value: "deschis", label: "Deschis" },
                ],
              },
            ],
          },
        ],
        defaults: { placi: [] },
      },
      // Tema Marte (etapa 24): o fotografie pe toata latimea, titlul mare si butonul peste ea.
      panoramic: {
        label: "Imagine panoramică cu titlu mare",
        tags: ["elegant", "cu imagine"],
        layout: "full",
        previewHeight: 560,
        providesH1: true,
        fields: [
          { key: "titlu", type: "text", label: "Titlul", maxLength: 50 },
          { key: "text", type: "textarea", label: "Textul", maxLength: 160 },
          { key: "buton", type: "text", label: "Textul butonului", placeholder: "Vezi colecția", maxLength: 30 },
          { key: "link", type: "link", label: "Linkul butonului" },
          { key: "imagine", type: "image", label: "Imaginea", help: "Fără imagine aleasă, prima imagine din „Bannere”." },
          {
            key: "aliniere", type: "select", label: "Textul",
            options: [{ value: "centru", label: "La mijloc" }, { value: "stanga", label: "În stânga" }],
          },
        ],
        defaults: { titlu: "", text: "", buton: "", link: "", imagine: "", aliniere: "centru" },
      },
      // Temele Procyon si Canopus (etapa 24, lotul 5): un rand de carduri inalte, fiecare o fotografie cu titlu.
      vitrina: {
        label: "Rând de carduri înalte cu fotografie",
        tags: ["cu imagine", "indraznet"],
        layout: "full",
        previewHeight: 560,
        providesH1: true,
        fields: [
          {
            key: "carduri", type: "repeater", label: "Cardurile", itemLabel: "Card", max: 5,
            help: "Pe desktop se văd patru, al cincilea se derulează. Un card fără titlu sau fără imagine nu apare.",
            fields: [
              { key: "eticheta", type: "text", label: "Eticheta de sus", placeholder: "-20%", maxLength: 16 },
              { key: "titlu", type: "text", label: "Titlul", maxLength: 50 },
              { key: "text", type: "text", label: "Textul", maxLength: 90 },
              { key: "imagine", type: "image", label: "Imaginea" },
              { key: "link", type: "link", label: "Linkul" },
            ],
          },
        ],
        defaults: { carduri: [] },
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
      icons: { label: "Iconițe", tags: ["detaliat"], layout: "full", fields: [] },
    },
  },
  catalog_toolbar: {
    label: "Căutare și filtre",
    icon: "Search",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      classic: { label: "Căutare, sortare și filtre", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  category_nav: {
    label: "Categorii",
    icon: "LayoutGrid",
    scope: "home",
    singleton: true,
    removable: true,
    // Doua design-uri de la etapa 16.6 (placile temei Jupiter): alegerea e in galerie, ca la orice sectiune.
    inCatalog: true,
    variants: {
      classic: { label: "Butoane rotunde", tags: ["clasic"], layout: "contained", previewHeight: 220, fields: [] },
      // Tema Jupiter (etapa 16.3): placi cu imaginea si numarul de produse (verticale, pana la sase pe rand, de la etapa 23).
      placi: {
        label: "Plăci cu imagine și număr de produse",
        tags: ["cu imagine", "detaliat"],
        layout: "contained",
        previewHeight: 400,
        fields: [
          { key: "titlu", type: "text", label: "Titlul", placeholder: "Categorii", maxLength: 60 },
          { key: "arataNumarul", type: "toggle", label: "Arată câte produse are fiecare categorie", help: "Pornit, apar și categoriile fără produse, cu „0 produse”." },
        ],
        defaults: { titlu: "Categorii", arataNumarul: true },
      },
      // Tema Mercur (etapa 24): placi colorate, numele si numarul sus, poza mare jos in dreapta.
      colorate: {
        label: "Plăci colorate cu imagine mare",
        tags: ["cu imagine", "indraznet"],
        layout: "contained",
        previewHeight: 400,
        fields: [
          { key: "titlu", type: "text", label: "Titlul", placeholder: "Categorii", maxLength: 60 },
          { key: "arataNumarul", type: "toggle", label: "Arată câte produse are fiecare categorie", help: "Pornit, apar și categoriile fără produse, cu „0 produse”." },
          {
            key: "fond", type: "select", label: "Culoarea plăcilor",
            options: [
              { value: "accent", label: "Culoarea de accent" },
              { value: "principala", label: "Culoarea principală" },
              { value: "deschis", label: "Nuanță deschisă" },
            ],
          },
        ],
        defaults: { titlu: "Categorii", arataNumarul: true, fond: "accent" },
      },
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
    label: "Rând de produse",
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
      grid: { label: "Grilă", tags: ["clasic"], layout: "contained", fields: [CAMP_BANDA_RAND] },
      carousel: { label: "Carusel", tags: ["clasic"], layout: "contained", fields: [CAMP_BANDA_RAND] },
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
      list: { label: "Listă", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  reviews: {
    label: "Recenzii",
    icon: "Star",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      grid: { label: "Grilă", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  gallery: {
    label: "Galerie",
    icon: "Images",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      grid: { label: "Grilă", tags: ["clasic", "cu imagine"], layout: "contained", fields: [] },
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
  /**
   * „Conținut liber” (etapa 9 din `docs/editor-magazin/PLAN.md`): blocurile paginilor proprii pe
   * pagina principala, in `settings.blocuri` (curatate de `parseBlocuriLibere`, nu de `fields`). Se
   * poate pune de mai multe ori. `full`: blocurile isi aleg singure latimea, ca pe o pagina proprie.
   */
  placi_promo: {
    label: "Plăci de recomandare",
    icon: "LayoutGrid",
    scope: "home",
    singleton: false,
    removable: true,
    // In galeria „Schimbă designul” de la etapa 24 (doua design-uri). Se adauga ca orice sectiune (`addableKinds`).
    inCatalog: true,
    variants: {
      // Tema Jupiter (etapa 16.3), dupa sectiunea „Recomandări” de pe modelul ei.
      rotunde: {
        // Etapa 23: placa inalta in degrade, cu poza mare jos (inainte, poza pe cerc). Cheia `rotunde` ramane: e salvata.
        label: "Placă înaltă cu imagine mare, titlu și link",
        tags: ["cu imagine"],
        layout: "contained",
        previewHeight: 420,
        fields: [
          { key: "titlu", type: "text", label: "Titlul secțiunii", placeholder: "Recomandari", maxLength: 60 },
          {
            key: "placi", type: "repeater", label: "Plăcile", itemLabel: "Placă", max: 8,
            help: "Patru pe rând pe calculator, două pe telefon. Textul linkului apare doar când placa are link.",
            fields: [
              { key: "titlu", type: "text", label: "Titlul", maxLength: 50 },
              { key: "imagine", type: "image", label: "Imaginea" },
              { key: "link", type: "link", label: "Linkul" },
              { key: "eticheta", type: "text", label: "Textul linkului", placeholder: "Descopera ofertele", maxLength: 30 },
            ],
          },
        ],
        defaults: { titlu: "Recomandari", placi: [] },
      },
      // Tema Venus (etapa 24): fotografia pe toata placa, titlul alb peste ea, pe o umbra de jos.
      imagine: {
        label: "Fotografie cu titlul peste",
        tags: ["cu imagine", "indraznet"],
        layout: "contained",
        previewHeight: 320,
        fields: [
          { key: "titlu", type: "text", label: "Titlul secțiunii", placeholder: "Descopera", maxLength: 60 },
          {
            key: "placi", type: "repeater", label: "Plăcile", itemLabel: "Placă", max: 8,
            help: "Cinci pe rând pe calculator, două pe telefon (restul se derulează). Fotografiile cu oameni sau camere arată cel mai bine.",
            fields: [
              { key: "titlu", type: "text", label: "Titlul", maxLength: 50 },
              { key: "imagine", type: "image", label: "Imaginea" },
              { key: "link", type: "link", label: "Linkul" },
            ],
          },
        ],
        defaults: { titlu: "", placi: [] },
      },
    },
  },
  continut_liber: {
    label: "Conținut liber",
    icon: "PenTool",
    scope: "home",
    singleton: false,
    removable: true,
    variants: {
      blocuri: { label: "Blocuri", tags: ["simplu"], layout: "full", previewHeight: 420, fields: [], defaults: { blocuri: [] } },
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
              { value: "left", label: "În stânga imaginii" },
              { value: "bottom", label: "Sub imagine" },
            ],
          },
          {
            key: "galleryHeight", type: "select", label: "Înălțimea galeriei",
            help: "„Cât ecranul” ține fotografia întreagă în fereastră pe paginile late.",
            options: [
              { value: "square", label: "Pătrată" },
              { value: "compact", label: "Cât ecranul" },
            ],
          },
          { key: "showDetails", type: "toggle", label: "Arată caseta „Detalii produs”", retras: "ochiul blocului „Caseta Detalii produs”" },
          { key: "showSpecsSummary", type: "toggle", label: "Arată un rezumat al specificațiilor", retras: "ochiul blocului „Rezumatul specificațiilor”" },
          // Fara `showIf` pe rezumat: comutatorul lui a iesit din editor, iar
          // rezumatul il aprinde acum ochiul blocului, nu el.
          {
            key: "specsCount", type: "range", label: "Câte specificații în rezumat",
            min: 3, max: 12, step: 1, unit: " randuri",
          },
          { key: "showTiers", type: "toggle", label: "Arată reducerile de cantitate", help: "Se completează din fișa produsului. Prețurile de treaptă se aplică la comanda directă.", retras: "ochiul blocului „Reducerile de cantitate”" },
          { key: "showContact", type: "toggle", label: "Arată telefonul și WhatsApp sub produs", retras: "ochiul blocului „Telefon și WhatsApp”" },
        ],
        defaults: {
          ...PDP_DEFAULTS_COMUNE,
          galleryThumbs: "left",
          galleryHeight: "square",
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
        label: "Produsele stau pe pagina principală",
        tags: ["clasic"],
        layout: "contained",
        previewHeight: 420,
        fields: [],
      },
      sidebar: {
        label: "Filtre în bara laterală",
        tags: ["clasic", "detaliat"],
        layout: "full",
        surface: "page",
        previewHeight: 900,
        providesH1: true,
        note: SHOP_NOTA,
        // `placiSubcategorii` (tema Jupiter, etapa 16.4): subcategoriile categoriei alese, pe placi, sub titlu.
        fields: [...SHOP_FIELDS, { key: "placiSubcategorii", type: "toggle", label: "Arată subcategoriile pe plăci, sub titlu" }],
        defaults: { ...SHOP_DEFAULTS, coloane: "4" },
      },
      toolbar: {
        label: "Filtre în capul paginii",
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
    // Alegerea designului cardului sta in fila „Stil”, la „Cardul de produs” (etapa 16.6): cardul n-are rand in arbore.
    inCatalog: true,
    variants: {
      classic: { label: "Clasic", tags: ["clasic"], layout: "contained", previewHeight: 500, fields: [] },
      // Tema Jupiter (etapa 16.3): insigna „Super pret”, pretul mare, butonul cu patratul cosului.
      jupiter: { label: "Hipermarket, cu prețul mare", tags: ["indraznet"], layout: "contained", previewHeight: 570, fields: [] },
      // Temele Terra si Marte (etapa 24): fara chenar, poza pe placa, numele si pretul dedesubt, cosul ca un cerc pe poza.
      minimal: { label: "Minimal, cu coșul pe imagine", tags: ["elegant", "simplu"], layout: "contained", previewHeight: 520, fields: [] },
    },
  },
  cart_drawer: {
    label: "Coș",
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
        label: "Pagină pe două coloane",
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
        label: "Pagină centrată, o coloană",
        tags: ["simplu", "elegant"],
        layout: "full",
        surface: "page",
        previewHeight: 900,
        fields: CART_PAGE_FIELDS,
        defaults: CART_PAGE_DEFAULTS,
      },
      page_compact: {
        label: "Pagină compactă, cu bara de comandă mereu vizibilă",
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
    label: "Finalizarea comenzii",
    icon: "ClipboardList",
    scope: "commerce",
    singleton: true,
    removable: false,
    inCatalog: true,
    // La fel ca la cos: `classic` ramane prima cheie declarata.
    variants: {
      classic: {
        label: "Formular în fereastră",
        tags: ["clasic", "compact"],
        layout: "full",
        // Cat inaltimea data panoului in miniatura: formularul intreg trece de
        // 1800 px si ar face din fiecare card un perete.
        previewHeight: 900,
        previewWidth: 390,
        fields: [],
      },
      page_two_col: {
        label: "Pagină separată, cu rezumat lateral",
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
