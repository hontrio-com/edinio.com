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

/**
 * Pagina de produs. O singura sectiune, nu una per bloc.
 *
 * Galeria si zona de cumparare impart aproape toata starea paginii (imaginea
 * curenta, combinatia de varianta aleasa, pretul rezultat), deci taiate in doua
 * sectiuni n-ar putea exista una fara alta. Un design de pagina de produs le
 * schimba oricum impreuna.
 */
export const PRODUCT_KINDS = ["product_page"] as const;

/**
 * Pagina de catalog, cand magazinul si-o alege separata de pagina principala.
 *
 * O singura sectiune, ca la pagina de produs si din acelasi motiv: bara de
 * filtre, arborele de categorii si grila impart toata starea paginii — ce s-a
 * cautat, ce fatete sunt bifate, la ce pagina s-a ajuns — deci taiate in trei
 * n-ar putea exista una fara alta. Un design de pagina de magazin le schimba
 * oricum impreuna.
 */
export const SHOP_KINDS = ["shop_page"] as const;

/** „Sectiuni" care sunt de fapt componente reutilizate peste tot in comert. */
export const COMMERCE_KINDS = ["product_card", "cart_drawer", "checkout"] as const;

export type ChromeKind = (typeof CHROME_KINDS)[number];
export type HomeKind = (typeof HOME_KINDS)[number];
export type ProductKind = (typeof PRODUCT_KINDS)[number];
export type ShopKind = (typeof SHOP_KINDS)[number];
export type CommerceKind = (typeof COMMERCE_KINDS)[number];
export type SectionKind = ChromeKind | HomeKind | ProductKind | ShopKind | CommerceKind;

export const ALL_SECTION_KINDS: readonly SectionKind[] = [
  ...CHROME_KINDS,
  ...HOME_KINDS,
  ...PRODUCT_KINDS,
  ...SHOP_KINDS,
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
  /** Starea EFECTIVA, cea pe care o citeste randarea. */
  enabled: boolean;
  /**
   * Ce a cerut anume comerciantul din editorul de DESIGN. Lipseste cand n-a
   * atins niciodata ochiul sectiunii.
   *
   * ⚠ Trei stari, nu doua, si asta e esenta. Sectiunile derivate isi iau starea
   * din `page_content` — acolo o pun comutatoarele din „Editeaza magazinul" — iar
   * parserul o rescrie la fiecare citire. Cat timp exista un singur camp, cele
   * doua editoare se calcau in picioare: ochiul din editorul de design stingea o
   * sectiune, ea disparea instant din previzualizare, iar la prima citire de dupa
   * salvare `page_content` o reaprindea. „Cautare si filtre", „Categorii" si
   * „Catalog produse" nici nu puteau fi stinse vreodata, fiindca designul classic
   * le construieste cu `enabled` scris in cod.
   *
   * Cu semnul asta prezent, alegerea din editorul de design castiga; fara el,
   * comanda ramane la comutatorul din editorul magazinului. Vezi `parse.ts`.
   */
  enabledOverride?: boolean;
  /**
   * Varianta pe care a ales-o anume comerciantul din galeria de design-uri.
   *
   * ⚠ Simetric cu `enabledOverride`, si din acelasi motiv. Varianta hero-ului se
   * re-deriva din „Afiseaza continutul peste banner" — un comutator care alege
   * intre `banners` si `overlay`. Numai ca astea DOUA sunt si design-uri oferite
   * in catalog, cu nume proprii („Doar imagini", „Imagine cu text peste"): fara
   * semnul asta, comerciantul alegea unul din galerie, il vedea in
   * previzualizare, publica — si magazinul randa celalalt, la nesfarsit.
   */
  variantOverride?: string;
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
  /**
   * Id-urile sectiunilor SCOASE anume din editorul de design.
   *
   * ⚠ Fara lista asta, stergerea se anuleaza singura. Parserul readuce din
   * designul „classic" sectiunile aprinse care lipsesc — regula exista pentru
   * magazinele cu un design salvat de o versiune mai veche a aplicatiei, care
   * altfel n-ar mai vedea niciodata o sectiune noua. Numai ca „lipseste" nu
   * spune de ce lipseste: o sectiune stearsa deliberat arata identic cu una care
   * n-a existat vreodata, deci se intorcea la prima citire, iar cosul de gunoi
   * parea ca nu face nimic.
   *
   * Aici scrie DE CE. Ce e in lista nu se mai readuce.
   */
  sterse?: string[];
  /**
   * Cineva a aranjat ordinea sectiunilor in editorul de design.
   *
   * Ordinea randurilor de produse se deriva din `page_content.product_sections`,
   * unde o pune editorul magazinului cu sagetile lui — asta face ca sagetile
   * acelea sa functioneze si dupa ce designul a fost salvat. Din clipa in care
   * comerciantul a mutat ceva in lista de sectiuni insa, ordinea e a lui, si
   * derivarea nu mai are voie s-o rescrie: altfel randul tras in capul paginii
   * sarea inapoi la prima reincarcare, iar in locul lui aparea altul.
   */
  ordineAtinsa?: boolean;
  chrome: {
    /** null = magazinul nu are bara de anunt. */
    announcement: SectionInstance | null;
    header: SectionInstance;
    footer: SectionInstance;
  };
  home: SectionInstance[];
  product: {
    page: SectionInstance;
  };
  /**
   * Pagina de catalog. Slot propriu, nu o intrare in `home`.
   *
   * In `home` ar fi schimbat ordinea paginii principale pentru toate magazinele
   * si ar fi aparut in paleta „Adauga sectiune", desi nu e o sectiune a paginii
   * principale. Aici e o alegere ca oricare alta din catalogul de design-uri, cu
   * un implicit care nu face nimic.
   */
  shop: {
    page: SectionInstance;
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
