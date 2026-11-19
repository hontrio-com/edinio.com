import { resolveHeroBanners } from "./hero-banners";
import { completeazaBlocuri, schemaBlocurilor } from "./blocuri";
import { CHEIE_FONT_TEXT, CHEIE_FONT_TITLURI, fontDinPageContent } from "./fonturi-magazin";
import { culoareAleasa, culoareMagazin } from "@/lib/storefront/culoare-magazin";
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
  /*
   * ⚠ Amandoua trec prin poarta culorilor (19.11.2026, `culoare-magazin.ts`): culoarea magazinului e `text` fara
   * constrangere in baza, iar fundalul din „Stil” e o valoare libera din `page_content`. Ajung in `style`, ca variabile
   * `--st-*`, unde un `;` din valoare adauga proprietati intregi la randarea pe server. Culorile din `design.style`
   * treceau deja prin `sanitizeColor`, la parsare; astea doua, nu.
   */
  const principala = culoareMagazin(ctx.primaryColor);
  const storeBg = culoareAleasa(ctx.pageContent?.store_bg_color);
  return {
    primary: principala,
    // Accentul porneste identic cu primara: un singur buton de culoare pentru
    // comerciantii care nu vor sa se gandeasca la o a doua nuanta.
    accent: principala,
    background: storeBg ?? "var(--color-background)",
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
export const CONTAINER_REM = { narrow: 56, normal: 72, wide: 80, xwide: 100, full: 0 } as const;

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
    // Designul castiga; altfel alegerea din „Editeaza magazinul" (vezi `fonturi-magazin.ts`).
    fontHeading: style?.fontHeading ?? fontDinPageContent(ctx.pageContent?.[CHEIE_FONT_TITLURI]) ?? "geist",
    fontBody: style?.fontBody ?? fontDinPageContent(ctx.pageContent?.[CHEIE_FONT_TEXT]) ?? "geist",
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
  /*
   * ⚠ Amandoua sunt `jsonb` din baza: un `null` sau orice altceva decat un obiect (o coloana scrisa de mana) se citeste
   * ca obiect gol, nu darama derivarea. Apelantii de azi pun deja `?? {}`; aici e plasa pentru cel care uita (proba
   * `intrari-ostile.test.ts`, 19.11.2026).
   */
  const obiect = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const pc = obiect(ctx.pageContent);
  const features = obiect(ctx.features);

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
  /*
   * ⚠ Fara `title` in reglaje (19.11.2026). Il purta de la prima versiune a designului, dar nu-l citea nimeni: titlul
   * randului vine din `page_content.featured_section_title`. Iar parserul NU-l recunoaste (nu e un camp al randului),
   * deci il taia la a doua citire: un design in care randul fusese readus din clasic iesea altfel la a doua parsare
   * decat la prima (gasit de proba `intrari-ostile.test.ts`). Garda ciornei se sprijina pe o parsare stabila.
   */
  home.push(section("featured", "product_row", "grid", bool(pc.show_featured_section), { mode: "featured" }));

  // Randurile custom pastreaza id-ul si layout-ul deja salvate.
  const rows = Array.isArray(pc.product_sections) ? pc.product_sections : [];
  for (const [pozitie, raw] of rows.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    /*
     * ⚠ Un rand FARA id primeste unul dupa pozitie, nu unul nou la fiecare citire (19.11.2026). Cu `newSectionId()`,
     * designul derivat iesea altul la fiecare parsare: garda ciornei compara doua parsari, deci un magazin cu un
     * asemenea rand n-ar mai fi putut salva nimic („modificat in alta fila”, la nesfarsit), iar sectiunea se remonta
     * la fiecare randare. Gasit de proba cu continut stricat (`intrari-ostile.test.ts`); randurile facute din editor
     * au mereu id.
     */
    // Curatat ca in parser (`parseSection`: fara spatii la capete, cel mult 64 de caractere), altfel a doua parsare l-ar fi schimbat.
    const idCurat = typeof r.id === "string" ? r.id.trim().slice(0, 64) : "";
    const id = idCurat || `rand_fara_id_${pozitie}`;
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

  /*
   * Contactul e OPRIT implicit, singurul dintre cele trei care e asa.
   *
   * Nu se pierde nimic: footerul are deja o coloana Contact cu telefon, WhatsApp,
   * email si oras, iar blocul legal de sub el arata identitatea firmei cu tot cu
   * sediile — si acela nu se poate ascunde. Repetat si in corpul paginii
   * principale, doar lungea pagina cu date pe care clientul le are oricum jos.
   *
   * `bool`, nu `notFalse`: apare doar cand comerciantul o cere explicit, din
   * Integrari → „Informatii de contact".
   */
  home.push(section("contact", "contact", "classic", bool(features.show_contact)));

  // Sectiunea poarta comutatorul REAL al barei. „Arata pe pagina magazinului"
  // ramane o regula de PAGINA, aplicata la randare: bagata aici, ar fi stins
  // bara si pe paginile de produs, unde in productie apare doar pe `enabled`.
  const announcement = pc.announcement_bar as { enabled?: boolean } | undefined;
  const announcementOn = bool(announcement?.enabled);

  return {
    version: DESIGN_VERSION,
    style: {},
    /*
     * Goala, dar PREZENTA, si asta conteaza.
     *
     * Prezenta cheii e semnul dupa care parserul stie ca designul a trecut prin
     * versiunea care noteaza intentiile comerciantului (ce a sters, ce varianta a
     * ales, ce ordine a aranjat). Designul derivat aici n-are nicio intentie de
     * notat — totul e derivat din `page_content` — deci lista lui e goala, dar
     * lipsa cheii ar fi insemnat „design vechi", iar parserul ar fi incercat sa-i
     * reconstituie intentii care nu exista. Vezi `parse.ts`.
     */
    sterse: [],
    chrome: {
      announcement: section("announcement", "announcement", "marquee", announcementOn),
      header: section("header", "header", "classic"),
      // Cu coloanele de azi (etapa 11), ca pagina de produs cu blocurile ei: un magazin fara design salvat nu trece
      // prin parser, iar editorul le are nevoie in arbore.
      footer: {
        ...section("footer", "footer", "dark"),
        blocks: completeazaBlocuri(undefined, schemaBlocurilor("footer", "dark")!, { pageContent: pc, setari: {} }),
      },
    },
    home,
    product: {
      // Cu blocurile in ordinea de azi; vizibilitatea lor, din comutatoarele vechi.
      page: {
        ...section("product_page", "product_page", "classic"),
        blocks: completeazaBlocuri(undefined, schemaBlocurilor("product_page", "classic")!, { pageContent: pc, setari: {} }),
      },
    },
    // Implicitul e „fara pagina separata": produsele raman pe pagina principala,
    // exact ca pana acum. Aprins din start, ca alegerea unui design de pagina sa
    // fie o singura apasare, nu doua.
    shop: {
      page: section("shop_page", "shop_page", "none"),
    },
    commerce: {
      productCard: section("product_card", "product_card", "classic"),
      cartDrawer: section("cart_drawer", "cart_drawer", "classic"),
      checkout: section("checkout", "checkout", "classic"),
    },
  };
}
