/**
 * Sistemul de design pe sectiuni al storefrontului.
 *
 * Un magazin nu mai are un layout hardcodat, ci o CONFIGURATIE: o lista ordonata
 * de instante de sectiuni, fiecare cu o varianta de design aleasa dintr-o galerie
 * si cu propriile setari. Configuratia sta in `store_settings.storefront_design`
 * (publicata) si `store_settings.storefront_design_draft` (ciorna din editor).
 *
 * Trei reguli care tin sistemul simplu:
 *
 *  1. `{}` inseamna „designul classic". Un magazin care n-a atins niciodata
 *     editorul nu are nimic in baza, iar `parseStoreDesign` ii deriva la citire
 *     layout-ul de azi din flag-urile din `page_content`. Zero migrare de date,
 *     zero schimbare vizuala la lansare.
 *
 *  2. Tot ce tine de culoare/font/rotunjire traieste in `StoreStyle`, nu in
 *     setarile fiecarei sectiuni. Altfel fiecare din cele ~160 de variante ar
 *     trebui sa isi expuna propriile campuri de culoare. Variantele consuma
 *     variabilele CSS `--st-*` produse din stilul rezolvat.
 *
 *  3. Toate campurile din `StoreStyle` sunt optionale: lipsa unei chei inseamna
 *     „foloseste implicitul", deci butonul „Reseteaza la implicit" din editor e
 *     doar o stergere de cheie, iar magazinele care nu ating stilul raman legate
 *     de `businesses.primary_color` daca acesta se schimba ulterior.
 */

// ---------------------------------------------------------------------------
// Sectiuni
// ---------------------------------------------------------------------------

/** Sectiuni fixe, prezente pe toate paginile publice. */
export const CHROME_KINDS = ["announcement", "header", "footer"] as const;

/** Sectiuni ale paginii principale a magazinului, reordonabile. */
export const HOME_KINDS = [
  "hero",
  "usp_strip",
  "catalog_toolbar",
  "category_nav",
  "shipping_progress",
  "product_row",
  "product_grid",
  "benefits",
  "reviews",
  "faq",
  "gallery",
  "about",
  "contact",
  "newsletter",
  "banner_cta",
  "brands",
  "rich_blocks",
] as const;

/** Sectiuni ale paginii de produs. */
export const PRODUCT_KINDS = ["pdp_gallery", "pdp_buybox", "pdp_details", "pdp_related"] as const;

/** „Sectiuni" care sunt de fapt componente reutilizate peste tot in comert. */
export const COMMERCE_KINDS = ["product_card", "cart_drawer", "checkout"] as const;

export type ChromeKind = (typeof CHROME_KINDS)[number];
export type HomeKind = (typeof HOME_KINDS)[number];
export type ProductKind = (typeof PRODUCT_KINDS)[number];
export type CommerceKind = (typeof COMMERCE_KINDS)[number];
export type SectionKind = ChromeKind | HomeKind | ProductKind | CommerceKind;

export const ALL_SECTION_KINDS: readonly SectionKind[] = [
  ...CHROME_KINDS,
  ...HOME_KINDS,
  ...PRODUCT_KINDS,
  ...COMMERCE_KINDS,
];

/**
 * O sectiune plasata in magazin: ce fel de sectiune e, ce design are si cu ce
 * setari. `settings` e deliberat neinterpretat aici — forma lui depinde de
 * perechea (kind, variant) si e validata de registry la parsare.
 */
export interface SectionInstance {
  id: string;
  kind: SectionKind;
  variant: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stil global
// ---------------------------------------------------------------------------

export const STYLE_COLOR_KEYS = [
  "primary",
  "accent",
  "background",
  "surface",
  "text",
  "muted",
  "border",
  "footerBg",
  "footerText",
] as const;
export type StyleColorKey = (typeof STYLE_COLOR_KEYS)[number];

export const FONT_KEYS = [
  "geist",
  "inter",
  "manrope",
  "jakarta",
  "dmsans",
  "sora",
  "playfair",
  "instrument",
] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export const RADIUS_KEYS = ["none", "sm", "md", "lg", "full"] as const;
export type RadiusKey = (typeof RADIUS_KEYS)[number];

export const CONTAINER_KEYS = ["narrow", "normal", "wide", "full"] as const;
export type ContainerKey = (typeof CONTAINER_KEYS)[number];

export const FONT_SCALE_KEYS = ["sm", "md", "lg"] as const;
export type FontScaleKey = (typeof FONT_SCALE_KEYS)[number];

export const BUTTON_STYLE_KEYS = ["solid", "outline", "soft"] as const;
export type ButtonStyleKey = (typeof BUTTON_STYLE_KEYS)[number];

export const BUTTON_RADIUS_KEYS = ["inherit", "full", "none"] as const;
export type ButtonRadiusKey = (typeof BUTTON_RADIUS_KEYS)[number];

export const CARD_STYLE_KEYS = ["plain", "bordered", "elevated"] as const;
export type CardStyleKey = (typeof CARD_STYLE_KEYS)[number];

export const CARD_RATIO_KEYS = ["square", "portrait", "landscape"] as const;
export type CardRatioKey = (typeof CARD_RATIO_KEYS)[number];

export const DENSITY_KEYS = ["compact", "normal", "airy"] as const;
export type DensityKey = (typeof DENSITY_KEYS)[number];

/**
 * Stilul global al magazinului. Structura plata (o cheie per control din editor),
 * ca „Reseteaza la implicit" sa insemne exact „sterge cheia".
 */
export interface StoreStyle {
  colors?: Partial<Record<StyleColorKey, string>>;
  fontHeading?: FontKey;
  fontBody?: FontKey;
  fontScale?: FontScaleKey;
  radius?: RadiusKey;
  container?: ContainerKey;
  buttonStyle?: ButtonStyleKey;
  buttonRadius?: ButtonRadiusKey;
  cardStyle?: CardStyleKey;
  cardRatio?: CardRatioKey;
  density?: DensityKey;
}

/** Stilul dupa aplicarea implicitelor — ce consuma generatorul de variabile CSS. */
export interface ResolvedStyle {
  colors: Record<StyleColorKey, string>;
  fontHeading: FontKey;
  fontBody: FontKey;
  fontScale: FontScaleKey;
  radius: RadiusKey;
  container: ContainerKey;
  buttonStyle: ButtonStyleKey;
  buttonRadius: ButtonRadiusKey;
  cardStyle: CardStyleKey;
  cardRatio: CardRatioKey;
  density: DensityKey;
}

// ---------------------------------------------------------------------------
// Designul complet
// ---------------------------------------------------------------------------

export const DESIGN_VERSION = 1;

export interface StoreDesign {
  version: typeof DESIGN_VERSION;
  style: StoreStyle;
  chrome: {
    /** null = magazinul nu are bara de anunt. */
    announcement: SectionInstance | null;
    header: SectionInstance;
    footer: SectionInstance;
  };
  home: SectionInstance[];
  product: {
    gallery: SectionInstance;
    buybox: SectionInstance;
    sections: SectionInstance[];
  };
  commerce: {
    productCard: SectionInstance;
    cartDrawer: SectionInstance;
    checkout: SectionInstance;
  };
}

/**
 * Contextul de care are nevoie parserul ca sa derive designul classic al unui
 * magazin care n-a salvat inca nimic: flag-urile vechi din `page_content` si
 * campurile de identitate de pe `businesses`.
 */
export interface DesignContext {
  primaryColor: string;
  pageContent: Record<string, unknown>;
  features: Record<string, unknown>;
  /** Bannerul vechi, folosit ca hero cand nu exista `hero_banners`. */
  coverUrl?: string | null;
  /** Sloganul magazinului: singur, e suficient ca hero-ul sa aiba ce afisa. */
  tagline?: string | null;
}
