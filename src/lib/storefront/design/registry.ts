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
  | (FieldBase & { type: "repeater"; itemLabel: string; fields: Field[]; max?: number });

export type VariantTag = "clasic" | "minimal" | "bold" | "cu imagine" | "compact" | "editorial";

export interface VariantMeta {
  label: string;
  tags: VariantTag[];
  /**
   * `contained` primeste containerul si spatiul vertical standard de la shell;
   * `full` se intinde pe toata latimea si isi gestioneaza singura spatierea.
   */
  layout: "contained" | "full";
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
  variants: Record<string, VariantMeta>;
}

// ---------------------------------------------------------------------------
// Catalogul
// ---------------------------------------------------------------------------

const PRODUCT_ROW_FIELDS: Field[] = [
  { key: "title", type: "text", label: "Titlu", placeholder: "Recomandate", maxLength: 80 },
];

export const SECTION_REGISTRY: Partial<Record<SectionKind, SectionMeta>> = {
  // --- Chrome -------------------------------------------------------------
  announcement: {
    label: "Bara de anunt",
    icon: "Megaphone",
    scope: "chrome",
    singleton: true,
    removable: true,
    variants: {
      marquee: { label: "Text derulant", tags: ["clasic"], layout: "full", fields: [] },
    },
  },
  header: {
    label: "Header",
    icon: "PanelTop",
    scope: "chrome",
    singleton: true,
    removable: false,
    variants: {
      classic: { label: "Clasic", tags: ["clasic"], layout: "full", fields: [] },
      search: {
        label: "Cu bara de cautare",
        tags: ["bold"],
        layout: "full",
        // Cauta in catalog direct din header, cu selector de categorie. Pe pagina
        // de magazin filtreaza pe loc; de pe alte pagini duce acolo cu `?q=`.
        needsCategories: true,
        replacesCatalogSearch: true,
        fields: [],
      },
    },
  },
  footer: {
    label: "Footer",
    icon: "PanelBottom",
    scope: "chrome",
    singleton: true,
    removable: false,
    variants: {
      dark: { label: "Placa neagra", tags: ["clasic", "bold"], layout: "full", fields: [] },
    },
  },

  // --- Pagina magazin -----------------------------------------------------
  hero: {
    label: "Hero",
    icon: "Image",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      banners: { label: "Bannere", tags: ["clasic", "cu imagine"], layout: "full", fields: [] },
      overlay: {
        label: "Overlay cu gradient",
        tags: ["clasic", "cu imagine", "bold"],
        layout: "full",
        providesH1: true,
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
      classic: { label: "Bara completa", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  category_nav: {
    label: "Categorii",
    icon: "LayoutGrid",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      classic: { label: "Pastile si cercuri", tags: ["clasic"], layout: "contained", fields: [] },
    },
  },
  shipping_progress: {
    label: "Prag transport gratuit",
    icon: "Truck",
    scope: "home",
    singleton: true,
    removable: true,
    variants: {
      banner: { label: "Banner", tags: ["clasic", "compact"], layout: "contained", fields: [] },
    },
  },
  product_row: {
    label: "Rand de produse",
    icon: "Rows3",
    scope: "home",
    singleton: false,
    removable: true,
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
