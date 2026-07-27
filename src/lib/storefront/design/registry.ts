import type { SectionKind } from "./types";

/**
 * Catalogul de sectiuni si variante.
 *
 * Registry-ul e DATE PURE: nicio componenta React, niciun import de client.
 * Parserul (server), editorul (client) si randarea il citesc pe toate trei, iar
 * maparea catre componente traieste separat, in
 * `src/components/storefront/section-components.ts`, ca sa nu tarasca tot
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

export type VariantTag = "clasic" | "simplu" | "indraznet" | "cu imagine" | "compact" | "elegant";

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
  /** Varianta afiseaza deja un H1 vizibil (conteaza doar la hero). */
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
   * Conditii pe care magazinul trebuie sa le indeplineasca pentru ca varianta sa
   * poata fi aleasa. Catalogul o arata stinsa, cu motivul scris, in loc sa lase
   * comerciantul sa aleaga un design care la el ar arata prost.
   */
  requires?: { minCategories?: number };
  fields: Field[];
  defaults?: Record<string, unknown>;
}

export interface SectionMeta {
  label: string;
  /** Nume de iconita Lucide, rezolvat in editor. */
  icon: string;
  scope: "chrome" | "home" | "product" | "commerce";
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

const PRODUCT_ROW_FIELDS: Field[] = [
  { key: "title", type: "text", label: "Titlu", placeholder: "Recomandate", maxLength: 80 },
];

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
 * Setarile pe care le au toate variantele de header.
 *
 * Fontul nu e o familie libera, ci alegerea intre cele doua deja incarcate de
 * magazin (titluri sau text). O a treia familie doar pentru meniu ar insemna un
 * fisier de font in plus descarcat de fiecare vizitator, pentru cateva cuvinte.
 */
const HEADER_FIELDS: Field[] = [
  {
    key: "actions",
    type: "actions",
    label: "Iconite",
    help: "Ordinea si care se vad. Cele fara date completate lipsesc oricum.",
    options: HEADER_ACTIONS,
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

/**
 * Variantele cu bara de cautare permanenta n-au si o lupa printre iconite, deci
 * nici optiunea de a o ordona.
 */
const HEADER_FIELDS_BARA: Field[] = HEADER_FIELDS.map((f) =>
  f.key === "actions" && f.type === "actions"
    ? { ...f, options: HEADER_ACTIONS.filter((o) => o.value !== "cautare") }
    : f,
);

const HEADER_DEFAULTS = { menuFont: "body", menuCase: "normal" };

/**
 * Cate categorii de nivel intai cere hero-ul cu bara laterala.
 *
 * Aceeasi valoare e folosita si de catalog (ca sa stinga varianta) si de
 * componenta (ca sa cada inapoi pe bannere daca magazinul scade sub prag dupa
 * ce a fost aleasa). Doua numere scrise separat s-ar fi despartit la prima
 * ajustare.
 */
export const MIN_CATEGORII_HERO_SIDEBAR = 6;

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
        fields: HEADER_FIELDS_BARA,
        defaults: HEADER_DEFAULTS,
      },
      centered: {
        label: "Logo la mijloc",
        tags: ["elegant", "clasic"],
        layout: "full",
        // Randul cu contact, logo si iconite, plus randul de meniu.
        previewHeight: 148,
        fields: [
          ...HEADER_FIELDS,
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
        fields: [
          ...HEADER_FIELDS,
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
          ...HEADER_FIELDS,
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
          ...HEADER_FIELDS_BARA,
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
          ...HEADER_FIELDS_BARA,
          { key: "showAction", type: "toggle", label: "Arata butonul de actiune" },
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
            help: "Gol = produsele cu reducere din magazin",
            showIf: { key: "showAction", equals: true },
          },
        ],
        defaults: { ...HEADER_DEFAULTS, showAction: true, actionLabel: "Reduceri" },
      },
      nav: {
        label: "Meniu langa logo",
        tags: ["simplu", "elegant"],
        layout: "full",
        // Meniul sta langa logo, cautarea deschide un panou in loc sa ocupe
        // spatiu permanent, iar cosul e o pastila inchisa cu totalul in ea.
        previewHeight: 72,
        needsCategories: true,
        fields: HEADER_FIELDS,
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
      dark: { label: "Fundal inchis", tags: ["clasic", "indraznet"], layout: "full", previewHeight: 460, fields: [] },
      columns: {
        label: "Deschis, pe coloane",
        tags: ["simplu", "cu imagine"],
        layout: "full",
        previewHeight: 560,
        fields: [],
      },
      centered: {
        label: "Centrat, aerisit",
        tags: ["elegant", "simplu"],
        layout: "full",
        previewHeight: 620,
        fields: [],
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
      banners: { label: "Doar imagini", tags: ["clasic", "cu imagine"], layout: "full", previewHeight: 655, fields: [] },
      categories: {
        label: "Categorii la stanga, bannere la dreapta",
        tags: ["cu imagine", "compact"],
        layout: "full",
        previewHeight: 515,
        // Cu doua-trei categorii bara ar fi un ciot langa o imagine mare.
        requires: { minCategories: MIN_CATEGORII_HERO_SIDEBAR },
        fields: [
          {
            key: "maxCategories",
            type: "range",
            label: "Cate categorii se vad",
            min: 6,
            max: 14,
            step: 1,
          },
        ],
        defaults: { maxCategories: 10 },
      },
      overlay: {
        label: "Imagine cu text peste",
        // Titlul magazinului e vizibil in aceasta varianta, deci ea e H1-ul
        // paginii si nu se mai adauga unul ascuns.
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
      icons: { label: "Iconite", tags: ["clasic", "compact"], layout: "full", fields: [] },
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
  product_row: {
    label: "Rand de produse",
    icon: "Rows3",
    scope: "home",
    singleton: false,
    removable: true,
    inCatalog: true,
    variants: {
      grid: { label: "Grila", tags: ["clasic"], layout: "contained", fields: PRODUCT_ROW_FIELDS },
      carousel: { label: "Carusel", tags: ["clasic"], layout: "contained", fields: PRODUCT_ROW_FIELDS },
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
  pdp_gallery: {
    label: "Galerie produs",
    icon: "Image",
    scope: "product",
    singleton: true,
    removable: false,
        variants: { classic: { label: "Clasic", tags: ["clasic"], layout: "contained", fields: [] } },
  },
  pdp_buybox: {
    label: "Zona de cumparare",
    icon: "ShoppingCart",
    scope: "product",
    singleton: true,
    removable: false,
        variants: { classic: { label: "Clasic", tags: ["clasic"], layout: "contained", fields: [] } },
  },
  pdp_details: {
    label: "Detalii produs",
    icon: "List",
    scope: "product",
    singleton: true,
    removable: true,
        variants: { classic: { label: "Clasic", tags: ["clasic"], layout: "contained", fields: [] } },
  },
  pdp_related: {
    label: "Produse similare",
    icon: "Rows3",
    scope: "product",
    singleton: true,
    removable: true,
        variants: { carousel: { label: "Carusel", tags: ["clasic"], layout: "contained", fields: [] } },
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
    variants: { classic: { label: "Clasic", tags: ["clasic"], layout: "full", fields: [] } },
  },
  checkout: {
    label: "Formular de comanda",
    icon: "ClipboardList",
    scope: "commerce",
    singleton: true,
    removable: false,
    variants: { classic: { label: "Clasic", tags: ["clasic"], layout: "full", fields: [] } },
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
