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
  | "html";

/** Wrapper styling applied by the renderer shell to most content blocks. */
export interface BlockStyle {
  padding?: "none" | "sm" | "md" | "lg" | "xl" | "custom";
  paddingCustom?: number; // px, used when padding === "custom"
  bg?: string | null;     // background color (CSS color)
  width?: "narrow" | "container" | "full";
  align?: "left" | "center" | "right";
  textColor?: string | null; // optional text color for the block content
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
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  text?: string;
  level?: 1 | 2 | 3;           // semantic heading tag
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "custom";
  sizeCustom?: number;         // px, used when size === "custom"
  color?: string | null;       // text color
}

export interface TextBlock extends BaseBlock {
  type: "text";
  html?: string; // rich text — sanitized server-side via sanitizeHtml()
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
}

export interface GalleryItem {
  src: string;
  title?: string;
  desc?: string;
}

export interface GalleryBlock extends BaseBlock {
  type: "gallery";
  images?: string[];            // legacy (plain URLs)
  items?: GalleryItem[];        // new (with optional captions)
  columns?: 2 | 3 | 4;
  gap?: "sm" | "md" | "lg";
  captionMode?: "none" | "title" | "desc" | "both";
}

export interface ButtonBlock extends BaseBlock {
  type: "button";
  label?: string;
  href?: string;
  variant?: "solid" | "outline" | "soft" | "ghost";
  effect?: "none" | "pulse" | "shake" | "bounce" | "glow" | "heartbeat";
  size?: "sm" | "md" | "lg";
  rounded?: "sm" | "md" | "lg" | "full";
  color?: string | null;       // override button color
  textColor?: string | null;
  fullWidth?: boolean;
  newTab?: boolean;
}

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
  gap?: "sm" | "md" | "lg";
  verticalAlign?: "top" | "center";
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
}

export interface FaqBlock extends BaseBlock {
  type: "faq";
  title?: string;
  items?: { q: string; a: string }[];
}

export interface TrustBlock extends BaseBlock {
  type: "trust";
  items?: { icon: string; title: string; desc: string }[];
  columns?: 2 | 3 | 4;
  align?: "left" | "center";
  card?: boolean;              // card-style items
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
  | MapBlock | FaqBlock | TrustBlock | ProductsBlock | SocialBlock | ContactBlock | HtmlBlock;

/** SEO stored on the page row (custom_pages.seo jsonb). */
export interface PageSeo {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string | null;
  noindex?: boolean;
}

/* ─── Editor palette metadata ──────────────────────────────────────────────── */

export type BlockCategory = "layout" | "content" | "media" | "store" | "advanced";

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
  "trust", "products", "social", "contact", "html",
];

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
      return { id, type, title: "Produsele noastre", mode: "featured", limit: 8, columns: 4, layout: "grid", showAddToCart: false, style: { padding: "lg" } };
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
