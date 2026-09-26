/**
 * Block contract for the custom-page builder. The page `blocks` column stores a
 * `Block[]` JSON array. Both the public renderer (`BlockRenderer`) and the
 * dashboard editor (`PageBuilder`) are driven by these types.
 *
 * Design rule: a page is a VERTICAL STACK of full-width blocks (no absolute /
 * free positioning). That keeps it far simpler than Elementor and responsive by
 * default. Multi-column layout is only available via the `columns` block, which
 * collapses on mobile. A columns block is the one place nesting is allowed: each
 * column can hold its own list of blocks (one level deep, no columns-in-columns).
 * All new fields are optional for backward compatibility.
 */

import type { CheieFont } from "./fonturi";

export type BlockType =
  | "hero"
  | "heading"
  | "text"
  | "image"
  | "gallery"
  | "button"
  | "columns"
  | "spacer"
  | "divider"
  | "video"
  | "map"
  | "faq"
  | "trust"
  | "products"
  | "social"
  | "contact"
  | "html"
  /* 25.09.2026 */
  | "bundles"
  | "newsletter"
  | "payments"
  | "couriers";

/**
 * Animatia la aparitie (25.09.2026). Se aplica pe orice bloc, prin `BlockShell`,
 * si porneste cand blocul intra in ecran. Vezi `components/pages/Animatii.tsx`.
 */
export type AnimatieIntrare =
  | "none" | "fade" | "fade-up" | "fade-down" | "fade-left" | "fade-right"
  | "zoom-in" | "zoom-out" | "blur-in" | "flip-up" | "slide-up" | "rotate-in" | "bounce-in";

export type RazaColturi = "none" | "sm" | "md" | "lg" | "xl";
export type Umbra = "none" | "sm" | "md" | "lg";

/** Wrapper styling applied by the renderer shell to most content blocks. */
export interface BlockStyle {
  padding?: "none" | "sm" | "md" | "lg" | "xl" | "custom";
  paddingCustom?: number; // px, used when padding === "custom"
  bg?: string | null;     // background color (CSS color)
  width?: "narrow" | "container" | "wide" | "full" | "custom";
  /** px, used when width === "custom" (320-1600). */
  widthCustom?: number;
  align?: "left" | "center" | "right";
  textColor?: string | null; // optional text color for the block content

  /* Adaugate pe 25.09.2026 (asezare si efecte). Toate optionale: lipsa = aspectul de azi. */

  /** Fundal cu imagine (din Biblioteca Media), cu strat intunecat 0-80%. */
  bgImage?: string | null;
  bgOverlay?: number;
  /** Imaginea sta pe loc la derulare (efect de paralaxa). */
  bgFixed?: boolean;
  /** Fundal in degrade; bate culoarea simpla, e batut de imagine. */
  bgGradient?: { from: string; to: string; angle?: number } | null;
  /** Continutul intr-o cutie (card) cu margini si fundal propriu. */
  boxed?: boolean;
  boxBg?: string | null;
  radius?: RazaColturi;
  shadow?: Umbra;
  borderColor?: string | null;
  /** Blocul se ascunde pe telefon sau pe desktop. */
  hideOn?: "mobile" | "desktop" | null;
  anim?: AnimatieIntrare;
  /** ms, 0-1500 */
  animDelay?: number;
  animSpeed?: "fast" | "normal" | "slow";
}

interface BaseBlock {
  id: string;
  type: BlockType;
  style?: BlockStyle;
}

export interface HeroBlock extends BaseBlock {
  type: "hero";
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  buttonHref?: string;
  bgImage?: string | null;
  bgColor?: string | null;
  textColor?: string | null;
  overlay?: boolean;
  align?: "left" | "center";
  height?: "sm" | "md" | "lg" | "custom";
  heightCustom?: number;       // px, used when height === "custom"
  buttonColor?: string | null;
  buttonTextColor?: string | null;
  /* 25.09.2026 */
  /** Asezarea: text peste imagine (implicit) sau imaginea alaturi, stanga/dreapta. */
  layout?: "overlay" | "split-left" | "split-right";
  secondLabel?: string;
  secondHref?: string;
  /** Tipografia titlului, ca la blocul de titlu. */
  titleFont?: CheieFont | null;
  subtitleFont?: CheieFont | null;
  titleWeight?: GreutateFont;
  titleTransform?: "none" | "uppercase";
  /** Imaginea de fundal se apropie lent (Ken Burns). */
  kenBurns?: boolean;
  /** Intensitatea stratului intunecat, 0-80 (%). Lipsa = 45, ca pana acum. */
  overlayOpacity?: number;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  text?: string;
  level?: 1 | 2 | 3;           // semantic heading tag
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "custom";
  sizeCustom?: number;         // px, used when size === "custom"
  color?: string | null;       // text color
  /* 25.09.2026 (tipografie) */
  font?: CheieFont | null;
  weight?: GreutateFont;
  spacing?: "tight" | "normal" | "wide" | "wider";
  transform?: "none" | "uppercase" | "capitalize";
  italic?: boolean;
  /** Text in degrade (doua culori). Bate `color`. */
  gradient?: { from: string; to: string } | null;
  /** Un rand mic deasupra titlului („NOU”, „DESPRE NOI”). */
  eyebrow?: string;
  /** Un rand de text sub titlu. */
  subtitle?: string;
}

export interface TextBlock extends BaseBlock {
  type: "text";
  html?: string; // rich text — sanitized server-side via sanitizeHtml()
  /* 25.09.2026: tipografia textului, pe bloc. Lipsa = cea a magazinului. */
  font?: CheieFont | null;
  /** px, 12-32 */
  fontSize?: number;
  weight?: GreutateFont;
  lineHeight?: "tight" | "normal" | "relaxed" | "loose";
  spacing?: "tight" | "normal" | "wide" | "wider";
}

export interface ImageBlock extends BaseBlock {
  type: "image";
  src?: string | null;
  alt?: string;
  href?: string;
  caption?: string;
  rounded?: boolean;
  widthPct?: number;           // 10-100, max width as % of container
  align?: "left" | "center" | "right";
  /* 25.09.2026 */
  /** Taierea imaginii la un raport fix. Lipsa = forma originala. */
  aspect?: "original" | "1:1" | "4:3" | "3:4" | "16:9" | "21:9";
  hover?: EfectImagine;
  shadow?: Umbra;
  newTab?: boolean;
}

/** Ce face o imagine sub cursor. */
export type EfectImagine = "none" | "zoom" | "lift" | "grayscale" | "brighten" | "tilt";

export interface GalleryItem {
  src: string;
  title?: string;
  desc?: string;
}

export interface GalleryBlock extends BaseBlock {
  type: "gallery";
  images?: string[];            // legacy (plain URLs)
  items?: GalleryItem[];        // new (with optional captions)
  columns?: 2 | 3 | 4 | 5 | 6;
  gap?: "sm" | "md" | "lg";
  captionMode?: "none" | "title" | "desc" | "both";
  /* 25.09.2026 */
  layout?: "grid" | "masonry";
  aspect?: "1:1" | "4:3" | "3:4" | "16:9";
  mobileColumns?: 1 | 2;
  hover?: EfectImagine;
  rounded?: RazaColturi;
}

export interface ButtonBlock extends BaseBlock {
  type: "button";
  label?: string;
  href?: string;
  variant?: "solid" | "outline" | "soft" | "ghost";
  effect?: EfectButon;
  size?: "sm" | "md" | "lg";
  rounded?: "sm" | "md" | "lg" | "full";
  color?: string | null;       // override button color
  textColor?: string | null;
  fullWidth?: boolean;
  newTab?: boolean;
  /* 25.09.2026 */
  font?: CheieFont | null;
  weight?: GreutateFont;
  transform?: "none" | "uppercase";
  /** Pictograma langa text (din `icon-registry`), stanga sau dreapta. */
  icon?: string | null;
  iconPos?: "left" | "right";
  /** Al doilea buton, alaturi. */
  secondLabel?: string;
  secondHref?: string;
  secondVariant?: "solid" | "outline" | "soft" | "ghost";
}

/** Efectele butonului. Primele sase sunt de dinainte; restul, din 25.09.2026. */
export type EfectButon =
  | "none" | "pulse" | "shake" | "bounce" | "glow" | "heartbeat"
  | "shine" | "float" | "wobble" | "ring" | "lift" | "fill";

/**
 * A single column cell. Two modes, chosen per block:
 *  - classic (legacy): the flat heading/html/image/button fields below.
 *  - flexible: `blocks` holds nested blocks the merchant composes freely
 *    (text, form, products, button, image, …). When `blocks` is present it wins.
 */
export interface ColumnItem {
  heading?: string;
  html?: string;     // rich text, sanitized
  image?: string | null;
  buttonLabel?: string;
  buttonHref?: string;
  blocks?: Block[];  // flexible mode: nested blocks (one level of nesting)
}

export interface ColumnsBlock extends BaseBlock {
  type: "columns";
  count?: number;              // total number of cells (>= 2)
  perRow?: number;             // cells per row (grid tracks); cells wrap to new rows.
                               // Defaults to the track count of `template`, else `count`.
  template?: string;           // width-ratio preset for a single row, e.g. "1-1", "1-2", "2-1", "1-1-1", "2-1-1"
  items?: ColumnItem[];
  bordered?: boolean;
  gap?: "none" | "sm" | "md" | "lg" | "xl";
  verticalAlign?: "top" | "center" | "bottom" | "stretch";
  /* 25.09.2026 */
  /** Pe telefon coloanele se aseaza in ordine inversa (ex. imaginea sub text). */
  reverseMobile?: boolean;
  /** Cate coloane raman alaturi pe telefon. Lipsa = una sub alta. */
  mobileColumns?: 1 | 2;
  /** Fiecare coloana ca un card (fundal + colturi + spatiu interior). */
  cellCard?: boolean;
  cellBg?: string | null;
}

export interface SpacerBlock extends BaseBlock {
  type: "spacer";
  size?: "sm" | "md" | "lg" | "xl" | "custom";
  sizeCustom?: number;         // px, used when size === "custom"
}

export interface DividerBlock extends BaseBlock {
  type: "divider";
  lineStyle?: "solid" | "dashed" | "dotted";
  color?: string | null;
  thickness?: number;          // px
  widthPct?: number;           // 10-100
}

export interface VideoBlock extends BaseBlock {
  type: "video";
  /** Embed mode: a YouTube / Vimeo URL, converted to a safe iframe embed. */
  url?: string;
  /** Upload mode: a self-hosted video file (R2/CDN URL) played in a native <video>. */
  src?: string | null;
  /** Optional poster image shown before an uploaded video plays. */
  poster?: string | null;
  /** Playback options (apply to both uploaded video and embeds). */
  autoplay?: boolean;          // forces muted — browsers block autoplay with sound
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;          // default true (undefined => show controls)
  aspect?: "16:9" | "9:16" | "1:1"; // frame ratio; default 16:9
  widthPct?: number;           // 10-100, max width as % of container (like image)
  align?: "left" | "center" | "right";
}

export interface MapBlock extends BaseBlock {
  type: "map";
  query?: string; // address or "lat,lng" — embedded via Google Maps (no API key)
  height?: number;
  /* 25.09.2026 */
  /** 3-20. Lipsa = zoom-ul ales de Google. */
  zoom?: number;
  /** Harta sau satelit. */
  mapType?: "roadmap" | "satellite";
  wazeButton?: boolean;
  googleButton?: boolean;
  buttonsStyle?: "solid" | "outline";
  buttonsPos?: "below" | "overlay";
  /** Un card cu adresa, sub harta. */
  showAddress?: boolean;
  label?: string;
}

export interface FaqBlock extends BaseBlock {
  type: "faq";
  title?: string;
  items?: { q: string; a: string }[];
  /* 25.09.2026 */
  subtitle?: string;
  /** Cum arata lista. Lipsa = `classic` (o cutie cu linii intre intrebari). */
  variant?: "classic" | "cards" | "minimal" | "bordered" | "filled";
  /** Intrebarile pe doua coloane, pe ecrane late. */
  columns?: 1 | 2;
  icon?: "plus" | "chevron" | "arrow" | "none";
  iconPos?: "left" | "right";
  /** Lipsa = prima intrebare deschisa, ca pana acum. */
  openFirst?: boolean;
  /** Se pot deschide mai multe deodata. */
  multiOpen?: boolean;
  numbered?: boolean;
  titleAlign?: "left" | "center";
  accent?: string | null;
  questionColor?: string | null;
  answerColor?: string | null;
  cardBg?: string | null;
  /** Titlul si subtitlul in stanga, intrebarile in dreapta. */
  sideTitle?: boolean;
  titleFont?: CheieFont | null;
  questionFont?: CheieFont | null;
  answerFont?: CheieFont | null;
}

export interface TrustItem {
  icon: string;
  title: string;
  desc: string;
  /** 25.09.2026: iconita proprie (din Biblioteca Media). Bate `icon`. */
  image?: string | null;
  /** Legatura optionala a intregului beneficiu. */
  href?: string;
}

export interface TrustBlock extends BaseBlock {
  type: "trust";
  items?: TrustItem[];
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  align?: "left" | "center";
  card?: boolean;              // card-style items
  /* 25.09.2026: asezare, iconite, efecte */
  title?: string;
  subtitle?: string;
  /** `stack` = iconita deasupra (implicit); `row` = iconita in stanga; `strip` = banda compacta, pe un rand. */
  layout?: "stack" | "row" | "strip";
  mobileColumns?: 1 | 2;
  iconStyle?: "circle" | "square" | "plain" | "outline";
  iconSize?: "sm" | "md" | "lg";
  iconColor?: string | null;
  iconBg?: string | null;
  cardBg?: string | null;
  cardRadius?: RazaColturi;
  cardShadow?: Umbra;
  /** Linii subtiri intre beneficii (mai ales pentru `strip`). */
  dividers?: boolean;
  hover?: "none" | "lift" | "glow" | "scale";
  /** Beneficiile apar pe rand, unul dupa altul. */
  itemAnim?: AnimatieIntrare;
  titleColor?: string | null;
  descColor?: string | null;
}

export interface ProductsBlock extends BaseBlock {
  type: "products";
  title?: string;
  mode?: "featured" | "category" | "selected" | "all";
  category?: string;
  productIds?: string[];
  limit?: number;
  columns?: 2 | 3 | 4;
  layout?: "grid" | "carousel";
  showAddToCart?: boolean;
}

/**
 * Pachetele magazinului (produse cu `is_bundle`), cu ce contin si cat se
 * economiseste. 25.09.2026.
 */
export interface BundlesBlock extends BaseBlock {
  type: "bundles";
  title?: string;
  subtitle?: string;
  mode?: "all" | "selected";
  productIds?: string[];
  limit?: number;
  /** `cards` = grila; `wide` = cate un pachet pe rand, cu produsele in el alaturate. */
  layout?: "cards" | "wide";
  columns?: 2 | 3;
  showItems?: boolean;
  showSavings?: boolean;
  showAddToCart?: boolean;
  accent?: string | null;
  /* 26.09.2026: descriere si elemente FOMO */
  /** Descrierea scurta a pachetului (din produs); `descrieri` o inlocuieste pe pachet. */
  showDescription?: boolean;
  descrieri?: Record<string, string>;
  /** O eticheta pe toate pachetele („Oferta limitata”). */
  badgeText?: string;
  badgeColor?: string | null;
  /** Pachetele scoase in fata, cu eticheta lor („Cel mai popular”). */
  evidentiate?: string[];
  evidentiatText?: string;
  /** Numaratoare pana la o data (sfarsitul ofertei). `AAAA-LL-ZZTHH:MM`, ora Romaniei. */
  countdownEnd?: string | null;
  countdownText?: string;
  /** „Doar N pachete ramase”, din stocul REAL al componentelor, sub prag. */
  showLowStock?: boolean;
  lowStockThreshold?: number;
  /** „Cumparat de N ori in ultimele 7 zile”, din comenzile REALE, de la un minim. */
  showRecentSales?: boolean;
  recentSalesMin?: number;
}

/**
 * Abonarea la newsletter, catre Mailchimp / Brevo / Klaviyo (cele conectate).
 * Se poate adauga numai cand magazinul are macar una conectata.
 */
export interface NewsletterBlock extends BaseBlock {
  type: "newsletter";
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  successMessage?: string;
  askName?: boolean;
  askPhone?: boolean;
  /** Textul bifei de acord (GDPR). Bifa e mereu obligatorie. */
  consentText?: string;
  layout?: "inline" | "stacked" | "card" | "split";
  image?: string | null;
  buttonColor?: string | null;
  /** Eticheta trimisa la furnizor, pe langa „Formular”. */
  tag?: string;
}

/** Metodele de plata active (procesatorii conectati + ramburs). */
export interface PaymentsBlock extends BaseBlock {
  type: "payments";
  title?: string;
  layout?: "logos" | "cards";
  grayscale?: boolean;
}

/** Curierii cu care livreaza magazinul (cei activi in setari). */
export interface CouriersBlock extends BaseBlock {
  type: "couriers";
  title?: string;
  subtitle?: string;
  layout?: "logos" | "cards";
  grayscale?: boolean;
}

export interface SocialBlock extends BaseBlock {
  type: "social";
  title?: string;
}

export interface ContactBlock extends BaseBlock {
  type: "contact";
  title?: string;
  buttonLabel?: string;
  successMessage?: string;
  showPhone?: boolean;
  showMessage?: boolean;
  /** When set, render this merchant-built form instead of the built-in contact fields. */
  formId?: string | null;
  /** Built-in contact only: opt in to receive submissions by email (to the store email). */
  emailEnabled?: boolean;
  /* 25.09.2026: stiluri si optiuni */
  subtitle?: string;
  /** Cum arata campurile. Lipsa = `classic`. */
  variant?: "classic" | "filled" | "underline" | "rounded" | "minimal";
  /** Formularul intr-un card cu umbra. */
  card?: boolean;
  cardBg?: string | null;
  /** Etichetele deasupra (implicit), in camp (doar ca text ajutator) sau ascunse. */
  labels?: "above" | "inside" | "hidden";
  size?: "sm" | "md" | "lg";
  /** Doua coloane pe ecrane late (campurile marcate „jumatate” stau alaturi). */
  twoColumns?: boolean;
  buttonColor?: string | null;
  buttonTextColor?: string | null;
  buttonFull?: boolean;
  buttonAlign?: "left" | "center" | "right";
  buttonRadius?: "sm" | "md" | "lg" | "full";
  accent?: string | null;
  /** Dupa trimitere: mesajul (implicit) sau alta pagina. */
  afterSubmit?: "message" | "redirect";
  redirectHref?: string;
  /** Formularul simplu: bifa de acord cu prelucrarea datelor. */
  consent?: boolean;
  consentText?: string;
}

/**
 * Custom code block.
 *  - no `js`            -> HTML/CSS rendered inline, allowlist-sanitized (safe).
 *  - `js` present       -> rendered inside a sandboxed <iframe> (no store access).
 *  - `raw` (admin only) -> injected directly into the page DOM. The flag can only
 *                          be SET by an admin; the server action strips it otherwise.
 */
export interface HtmlBlock extends BaseBlock {
  type: "html";
  html?: string;
  css?: string;
  js?: string;
  raw?: boolean;
  rawApprovedBy?: string | null;
}

export type Block =
  | HeroBlock | HeadingBlock | TextBlock | ImageBlock | GalleryBlock
  | ButtonBlock | ColumnsBlock | SpacerBlock | DividerBlock | VideoBlock
  | MapBlock | FaqBlock | TrustBlock | ProductsBlock | SocialBlock | ContactBlock | HtmlBlock
  | BundlesBlock | NewsletterBlock | PaymentsBlock | CouriersBlock;

/**
 * Ce fel de pagina e, pentru datele structurate.
 *
 * Se DECLARA, nu se ghiceste. „Cum alegi prosoapele pentru hotel" si „Prosoape
 * Hotel" arata la fel din cod — una e un articol, cealalta un raft — iar un
 * `BlogPosting` pus pe o pagina de vitrina e o afirmatie falsa despre ce se afla
 * la acea adresa. Lipsa valorii inseamna `"pagina"`, deci nicio pagina existenta
 * nu isi schimba intelesul cand campul apare.
 */
export type TipPaginaProprie = "pagina" | "articol" | "lista-articole" | "colectie" | "contact";

export const TIPURI_PAGINA_PROPRIE: { valoare: TipPaginaProprie; eticheta: string; ajutor: string }[] = [
  { valoare: "pagina", eticheta: "Pagina obisnuita", ajutor: "Orice pagina de continut: Despre noi, Termeni, o prezentare." },
  { valoare: "articol", eticheta: "Articol de blog", ajutor: "Google o poate arata ca articol, cu titlu, imagine si data publicarii." },
  { valoare: "lista-articole", eticheta: "Lista de articole (blog)", ajutor: "Pagina care aduna articolele. Le listeaza automat pe cele marcate ca articol." },
  { valoare: "colectie", eticheta: "Colectie / categorie de produse", ajutor: "Pagina care prezinta o familie de produse (ex. Prosoape Hotel)." },
  { valoare: "contact", eticheta: "Pagina de contact", ajutor: "Pagina cu datele de contact sau formularul de contact." },
];

/** SEO stored on the page row (custom_pages.seo jsonb). */
export interface PageSeo {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string | null;
  noindex?: boolean;
  /** Vezi `TipPaginaProprie`. Lipsa = „pagina". */
  tip?: TipPaginaProprie;
  /** Doar pentru articole: cine semneaza. Gol = semneaza magazinul. */
  autor?: string;
  /**
   * Doar pentru articole: data publicarii, `AAAA-LL-ZZ`.
   *
   * Rezerva e `custom_pages.created_at` — data la care s-a creat pagina, adica
   * cel mai apropiat fapt de care dispunem. Campul exista fiindca articolele
   * mutate de pe un site vechi au o data reala, alta decat cea de creare aici.
   */
  dataPublicarii?: string;
  /* 25.09.2026: optiuni SEO in plus */
  /** Cuvantul cheie principal: nu ajunge in pagina, doar ghideaza sugestiile. */
  focusKeyword?: string;
  /** Adresa canonica, cand pagina e o copie a alteia. Gol = adresa paginii. */
  canonical?: string;
  /** Titlul si descrierea la distribuire (Facebook, WhatsApp), daca difera de cele pentru Google. */
  ogTitle?: string;
  ogDescription?: string;
  /** Google sa nu urmeze legaturile de pe pagina. */
  nofollow?: boolean;
}

/** Greutatea unui font. */
export type GreutateFont = "400" | "500" | "600" | "700" | "800" | "900";

/* ─── Editor palette metadata ──────────────────────────────────────────────── */

export type BlockCategory = "layout" | "content" | "media" | "store" | "advanced" | "integrations";

export interface BlockMeta {
  type: BlockType;
  label: string;          // Romanian label for the palette
  icon: string;           // lucide-react icon name
  category: BlockCategory;
  /** Advanced blocks can be hidden behind a "more" section in the palette. */
  advanced?: boolean;
}

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  hero:     { type: "hero",     label: "Hero",            icon: "Sparkles",     category: "layout" },
  bundles:  { type: "bundles",  label: "Pachete",         icon: "Boxes",        category: "store" },
  newsletter: { type: "newsletter", label: "Newsletter",  icon: "MailPlus",     category: "integrations" },
  payments: { type: "payments", label: "Metode de plată", icon: "CreditCard",   category: "integrations" },
  couriers: { type: "couriers", label: "Curierii noștri", icon: "Truck",        category: "integrations" },
  heading:  { type: "heading",  label: "Titlu",           icon: "Heading",      category: "content" },
  text:     { type: "text",     label: "Text",            icon: "Type",         category: "content" },
  image:    { type: "image",    label: "Imagine",         icon: "Image",        category: "media" },
  gallery:  { type: "gallery",  label: "Galerie",         icon: "Images",       category: "media" },
  button:   { type: "button",   label: "Buton",           icon: "MousePointerClick", category: "content" },
  columns:  { type: "columns",  label: "Coloane",         icon: "Columns3",     category: "layout" },
  spacer:   { type: "spacer",   label: "Spatiu",          icon: "MoveVertical", category: "layout" },
  divider:  { type: "divider",  label: "Linie",           icon: "Minus",        category: "layout" },
  video:    { type: "video",    label: "Video",           icon: "Video",        category: "media" },
  map:      { type: "map",      label: "Harta",           icon: "MapPin",       category: "media" },
  faq:      { type: "faq",      label: "Intrebari (FAQ)", icon: "MessageCircleQuestion", category: "content" },
  trust:    { type: "trust",    label: "Beneficii",       icon: "ShieldCheck",  category: "content" },
  products: { type: "products", label: "Produse",         icon: "Package",      category: "store" },
  social:   { type: "social",   label: "Social",          icon: "Share2",       category: "content" },
  contact:  { type: "contact",  label: "Formular contact", icon: "Mail",        category: "content" },
  html:     { type: "html",     label: "Cod personalizat", icon: "Code",        category: "advanced", advanced: true },
};

/** Order shown in the "add block" palette. */
export const BLOCK_PALETTE_ORDER: BlockType[] = [
  "hero", "heading", "text", "image", "gallery", "button",
  "columns", "spacer", "divider", "video", "map", "faq",
  "trust", "products", "bundles", "social", "contact", "html",
];

/**
 * Blocurile care depind de o integrare activa. Apar in paleta intr-un grup al lor,
 * si numai cand integrarea e conectata (vezi `integrariPentruPagini`).
 */
export const BLOCURI_INTEGRARI: BlockType[] = ["newsletter", "payments", "couriers"];

const DEFAULT_TRUST = [
  { icon: "Truck", title: "Livrare rapida", desc: "Livrare in toata Romania prin curier." },
  { icon: "ShieldCheck", title: "Plata la livrare", desc: "Platesti cash curierului. Zero riscuri." },
  { icon: "RotateCcw", title: "Retur 14 zile", desc: "Returnezi fara intrebari in 14 zile." },
];

let counter = 0;
/** Stable-ish id for a new block (client + server safe, no crypto dependency). */
export function newBlockId(): string {
  counter += 1;
  return `b_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/**
 * Factory for a freshly added block with sensible defaults.
 * `inColumn` tightens spacing and lets the block fill its column cell.
 */
export function createBlock(type: BlockType, opts?: { inColumn?: boolean }): Block {
  const block = buildBlock(newBlockId(), type);
  if (opts?.inColumn) {
    block.style = { ...(block.style ?? {}), padding: "sm", width: "full" };
  }
  return block;
}

function buildBlock(id: string, type: BlockType): Block {
  switch (type) {
    case "hero":
      return { id, type, title: "Titlul tau aici", subtitle: "Un subtitlu scurt si convingator.", buttonLabel: "Vezi produsele", buttonHref: "", align: "center", height: "md", overlay: true };
    case "heading":
      return { id, type, text: "Un titlu de sectiune", level: 2, size: "lg", style: { align: "center", padding: "md" } };
    case "text":
      return { id, type, html: "<p>Scrie aici textul tau. Poti folosi <strong>bold</strong>, liste si linkuri.</p>", style: { padding: "md", width: "narrow" } };
    case "image":
      return { id, type, src: null, alt: "", rounded: true, widthPct: 100, align: "center", style: { padding: "md", width: "container" } };
    case "gallery":
      return { id, type, items: [], columns: 3, gap: "md", captionMode: "none", style: { padding: "md" } };
    case "button":
      return { id, type, label: "Apasa aici", href: "", variant: "solid", effect: "none", size: "md", rounded: "lg", style: { align: "center", padding: "md" } };
    case "columns":
      // Flexible by default: two empty columns, each ready to receive any block.
      return { id, type, count: 2, template: "1-1", gap: "md", items: [{ blocks: [] }, { blocks: [] }], style: { padding: "md" } };
    case "spacer":
      return { id, type, size: "md" };
    case "divider":
      return { id, type, lineStyle: "solid", thickness: 1, widthPct: 100, style: { padding: "sm" } };
    case "video":
      return { id, type, url: "", style: { padding: "md", width: "container" } };
    case "map":
      return { id, type, query: "", height: 320, style: { padding: "md", width: "container" } };
    case "faq":
      return { id, type, title: "Intrebari frecvente", items: [{ q: "O intrebare?", a: "Raspunsul tau." }], style: { padding: "lg" } };
    case "trust":
      return { id, type, items: DEFAULT_TRUST, columns: 3, align: "center", card: true, style: { padding: "lg" } };
    case "products":
      // „Adauga in cos” pornit din start (cerut pe 25.09.2026). Blocurile vechi isi pastreaza alegerea.
      return { id, type, title: "Produsele noastre", mode: "featured", limit: 8, columns: 4, layout: "grid", showAddToCart: true, style: { padding: "lg" } };
    case "bundles":
      return { id, type, title: "Pachete avantajoase", mode: "all", limit: 6, layout: "cards", columns: 3, showItems: true, showSavings: true, showAddToCart: true, style: { padding: "lg" } };
    case "newsletter":
      return { id, type, title: "Abonează-te la newsletter", subtitle: "Află primul de noutăți și oferte.", buttonLabel: "Mă abonez", successMessage: "Mulțumim! Te-ai abonat.", consentText: "Sunt de acord să primesc emailuri cu noutăți și oferte.", layout: "card", style: { padding: "lg", width: "narrow" } };
    case "payments":
      return { id, type, title: "Metode de plată acceptate", layout: "logos", style: { padding: "md", align: "center" } };
    case "couriers":
      return { id, type, title: "Livrăm cu", layout: "logos", style: { padding: "md", align: "center" } };
    case "social":
      return { id, type, title: "Urmareste-ne", style: { padding: "md", align: "center" } };
    case "contact":
      return { id, type, title: "Contacteaza-ne", buttonLabel: "Trimite mesajul", successMessage: "Multumim! Mesajul tau a fost trimis.", showPhone: true, showMessage: true, style: { padding: "lg", width: "narrow" } };
    case "html":
      return { id, type, html: "<!-- Scrie codul tau aici -->", css: "", js: "", style: { padding: "md" } };
    default:
      return { id, type: "text", html: "" } as Block;
  }
}
