import { resolveHeroBanners } from "./hero-banners";
import {
  DESIGN_VERSION,
  type DesignContext,
  type ResolvedStyle,
  type SectionInstance,
  type SectionKind,
  type StoreDesign,
  type StoreStyle,
  type StyleColorKey,
} from "./types";

/**
 * Implicitele sistemului de design si derivarea layout-ului „classic".
 *
 * Tot ce e aici raspunde la o singura intrebare: cum arata un magazin care n-a
 * atins niciodata editorul nou? Raspunsul trebuie sa fie „exact ca inainte",
 * altfel cele ~9 magazine active s-ar schimba peste noapte. Culorile implicite
 * trimit catre token-ii globali existenti (`--color-surface` etc.) si catre
 * `businesses.primary_color`, iar sectiunile se deriva din flag-urile deja
 * salvate in `page_content`.
 */

// ---------------------------------------------------------------------------
// Stil
// ---------------------------------------------------------------------------

/**
 * Culorile implicite. Valorile care arata ca `var(--color-x)` sunt token-ii
 * globali din globals.css — asa storefrontul ramane pixel-identic cat timp
 * comerciantul nu schimba nimic, si se rupe de ei abia cand alege o culoare.
 */
export function defaultColors(ctx: DesignContext): Record<StyleColorKey, string> {
  const storeBg = typeof ctx.pageContent.store_bg_color === "string" ? ctx.pageContent.store_bg_color : "";
  return {
    primary: ctx.primaryColor,
    // Accentul porneste identic cu primara: un singur buton de culoare pentru
    // comerciantii care nu vor sa se gandeasca la o a doua nuanta.
    accent: ctx.primaryColor,
    background: storeBg || "var(--color-background)",
    surface: "var(--color-surface)",
    text: "var(--color-text-primary)",
    muted: "var(--color-text-secondary)",
    border: "var(--color-border)",
    // Footerul classic e o placa neagra hardcodata azi in cele trei copii.
    footerBg: "#0A0A0A",
    footerText: "#FFFFFF",
  };
}

/** Raza de baza in px pentru fiecare treapta. `md` = ce foloseste storefrontul azi. */
export const RADIUS_PX = { none: 0, sm: 6, md: 12, lg: 20, full: 9999 } as const;

/** Latimea containerului. `normal` = `max-w-6xl` (72rem), cat are storefrontul azi. */
export const CONTAINER_REM = { narrow: 56, normal: 72, wide: 80, full: 0 } as const;

/** Spatiul vertical dintre sectiuni. `normal` = `py-10` (2.5rem), cat e azi. */
export const DENSITY_REM = { compact: 1.75, normal: 2.5, airy: 4 } as const;

/** Multiplicator pe marimea textului de baza. */
export const FONT_SCALE = { sm: 0.9375, md: 1, lg: 1.0625 } as const;

export function resolveStyle(style: StoreStyle | undefined, ctx: DesignContext): ResolvedStyle {
  const fallback = defaultColors(ctx);
  const chosen = style?.colors ?? {};
  const colors = {} as Record<StyleColorKey, string>;
  for (const key of Object.keys(fallback) as StyleColorKey[]) {
    const value = chosen[key];
    colors[key] = typeof value === "string" && value.trim() ? value : fallback[key];
  }
  return {
    colors,
    fontHeading: style?.fontHeading ?? "geist",
    fontBody: style?.fontBody ?? "geist",
    fontScale: style?.fontScale ?? "md",
    radius: style?.radius ?? "md",
    container: style?.container ?? "normal",
    buttonStyle: style?.buttonStyle ?? "solid",
    buttonRadius: style?.buttonRadius ?? "inherit",
    // Cardul de produs de azi e `bg-surface border border-border rounded-2xl`,
    // deci implicitul care pastreaza aspectul actual e „bordered", nu „plain".
    cardStyle: style?.cardStyle ?? "bordered",
    cardRatio: style?.cardRatio ?? "square",
    density: style?.density ?? "normal",
  };
}

// ---------------------------------------------------------------------------
// Sectiuni
// ---------------------------------------------------------------------------

let sectionCounter = 0;
/** Id pentru sectiunile adaugate din editor. Cele derivate primesc id-uri stabile. */
export function newSectionId(): string {
  sectionCounter += 1;
  return `sec_${Date.now().toString(36)}_${sectionCounter.toString(36)}`;
}

export function section(
  id: string,
  kind: SectionKind,
  variant: string,
  enabled = true,
  settings: Record<string, unknown> = {},
): SectionInstance {
  return { id, kind, variant, enabled, settings };
}

function bool(value: unknown): boolean {
  return value === true;
}

/** Flag-urile vechi de tip „ascuns doar daca e explicit false". */
function notFalse(value: unknown): boolean {
  return value !== false;
}

/**
 * Deriva designul classic din configuratia existenta a magazinului.
 *
 * Id-urile sunt DETERMINISTE, nu generate: designul se re-deriva la fiecare
 * cerere pentru magazinele care n-au salvat nimic, iar id-uri instabile ar rupe
 * cheile React si selectia din editor. Randurile de produse isi pastreaza
 * id-ul deja salvat in `page_content.product_sections`.
 *
 * `enabled` reflecta INTENTIA salvata de comerciant, nu disponibilitatea
 * datelor: o sectiune activata dar fara continut se ascunde singura la randare
 * (hero fara bannere, categorii fara categorii), exact ca azi.
 */
export function buildClassicDesign(ctx: DesignContext): StoreDesign {
  const pc = ctx.pageContent;
  const features = ctx.features;

  const home: SectionInstance[] = [];

  // Hero. Varianta depinde si de date, nu doar de flag: azi bannerul se afiseaza
  // singur (fara overlay) doar cand EXISTA bannere si comerciantul n-a cerut
  // continut peste ele. Un magazin cu slogan dar fara nicio imagine primeste
  // hero-ul cu overlay, iar unul fara nimic nu primeste hero deloc.
  const { banners } = resolveHeroBanners(pc, ctx.coverUrl);
  const heroImageOnly = banners.length > 0 && !bool(pc.hero_show_content);
  home.push(section("hero", "hero", heroImageOnly ? "banners" : "overlay", banners.length > 0 || !!ctx.tagline));

  home.push(section("usp", "usp_strip", "icons", bool(pc.show_trust_strip_on_store)));

  // Bara de cautare/sortare/filtre e prima in zona cu container, exact ca azi.
  home.push(section("toolbar", "catalog_toolbar", "classic"));

  // Pastilele de categorii si cercurile cu imagini sunt, in layout-ul de azi,
  // doua zone lipite una de alta — o singura sectiune cu varianta „classic".
  home.push(section("categories", "category_nav", "classic"));

  home.push(section("shipping", "shipping_progress", "banner", bool(pc.show_shipping_progress)));

  // „Recomandate" e, structural, un rand de produse cu sursa `featured`.
  home.push(
    section("featured", "product_row", "grid", bool(pc.show_featured_section), {
      mode: "featured",
      title: typeof pc.featured_section_title === "string" && pc.featured_section_title
        ? pc.featured_section_title
        : "Recomandate",
    }),
  );

  // Randurile custom pastreaza id-ul si layout-ul deja salvate.
  const rows = Array.isArray(pc.product_sections) ? pc.product_sections : [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id ? r.id : newSectionId();
    home.push(
      section(id, "product_row", r.layout === "carousel" ? "carousel" : "grid", r.enabled !== false, {
        mode: "custom",
        sectionRef: id,
      }),
    );
  }

  home.push(section("catalog", "product_grid", "classic"));

  const benefits = pc.store_benefits_section as { enabled?: boolean } | undefined;
  home.push(section("benefits", "benefits", "list", bool(benefits?.enabled)));

  const reviews = pc.reviews_section as { enabled?: boolean } | undefined;
  home.push(section("reviews", "reviews", "grid", bool(reviews?.enabled)));

  home.push(section("gallery", "gallery", "grid", notFalse(features.show_gallery)));
  home.push(section("about", "about", "classic", notFalse(features.show_about)));
  home.push(section("contact", "contact", "classic", notFalse(features.show_contact)));

  // Sectiunea poarta comutatorul REAL al barei. „Arata pe pagina magazinului"
  // ramane o regula de PAGINA, aplicata la randare: bagata aici, ar fi stins
  // bara si pe paginile de produs, unde in productie apare doar pe `enabled`.
  const announcement = pc.announcement_bar as { enabled?: boolean } | undefined;
  const announcementOn = bool(announcement?.enabled);

  return {
    version: DESIGN_VERSION,
    style: {},
    chrome: {
      announcement: section("announcement", "announcement", "marquee", announcementOn),
      header: section("header", "header", "classic"),
      footer: section("footer", "footer", "dark"),
    },
    home,
    product: {
      page: section("product_page", "product_page", "classic"),
    },
    commerce: {
      productCard: section("product_card", "product_card", "classic"),
      cartDrawer: section("cart_drawer", "cart_drawer", "classic"),
      checkout: section("checkout", "checkout", "classic"),
    },
  };
}
