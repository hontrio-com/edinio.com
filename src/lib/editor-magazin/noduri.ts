import type { SectionInstance } from "@/lib/storefront/design/types";

/**
 * Ce continut regleaza fiecare nod din arborele editorului unic.
 *
 * Designul unei sectiuni (varianta si setarile ei) sta in `storefront_design`;
 * continutul ei (texte, liste, imagini) sta inca in `page_content`, unde l-a pus
 * editorul vechi. Panourile vechi grupau continutul dupa PAGINA („Pagina
 * principala", „Pagina produs”), asa ca recenziile se cautau intr-un acordeon de
 * douazeci de comutatoare. Aici fiecare bucata sta sub sectiunea pe care o
 * deseneaza: dai clic pe „Recenzii” si ai recenziile.
 *
 * Harta e si o promisiune: `CHEI_CONTINUT` + `CHEI_RETRASE` acopera tot ce putea
 * scrie editorul vechi. O cheie care nu e in niciuna s-ar fi pierdut la mutare,
 * fara ca nimic sa se planga (proba: `noduri.test.ts`).
 */

export type FelContinut =
  | "anunt"
  | "header"
  | "footer"
  | "hero"
  | "usp"
  | "cautare"
  | "categorii"
  | "prag"
  | "recomandate"
  | "rand"
  | "catalog"
  | "beneficii"
  | "recenzii"
  | "galerie"
  | "despre"
  | "contact"
  | "produs"
  | "magazin"
  | "card"
  | "cos"
  | "comanda";

/** Nodul fara sectiune: stilul si identitatea magazinului, comune tuturor paginilor. */
export const NOD_STIL = "stil";

/** Ce continut are o sectiune, dupa tipul ei; randurile de produse se despart dupa sursa. */
export function felContinut(s: Pick<SectionInstance, "kind" | "settings">): FelContinut | null {
  switch (s.kind) {
    case "announcement": return "anunt";
    case "header": return "header";
    case "footer": return "footer";
    case "hero": return "hero";
    case "usp_strip": return "usp";
    case "catalog_toolbar": return "cautare";
    case "category_nav": return "categorii";
    case "shipping_progress": return "prag";
    case "product_row": return s.settings.mode === "featured" ? "recomandate" : "rand";
    case "product_grid": return "catalog";
    case "benefits": return "beneficii";
    case "reviews": return "recenzii";
    case "gallery": return "galerie";
    case "about": return "despre";
    case "contact": return "contact";
    case "product_page": return "produs";
    case "shop_page": return "magazin";
    case "product_card": return "card";
    case "cart_drawer": return "cos";
    case "checkout": return "comanda";
    default: return null;
  }
}

/**
 * Cheile din `page_content` pe care le scrie fiecare nod.
 *
 * Fiecare nod isi salveaza DOAR cheile lui (`chei-atinse.ts`): un comutator
 * atins din curiozitate in alt nod nu pleaca in magazin odata cu el.
 */
export const CHEI_CONTINUT: Record<FelContinut | typeof NOD_STIL, readonly string[]> = {
  stil: ["favicon_url", "store_bg_color", "font_titluri", "font_text"],
  anunt: ["announcement_bar", "show_announcement_on_store"],
  header: ["logo_size"],
  footer: ["footer_logo_size", "hide_edinio_badge", "footer_badges", "footer_badges_title", "footer_badges_title_enabled"],
  hero: ["hero_banners", "hero_banner_links"],
  usp: ["store_trust_badges"],
  cautare: ["sort_options", "filter_options"],
  categorii: [],
  prag: [],
  recomandate: ["featured_section_title"],
  rand: ["product_sections"],
  catalog: ["home_order"],
  beneficii: ["store_benefits_section"],
  recenzii: ["reviews_section"],
  galerie: [],
  despre: [],
  contact: [],
  produs: [
    "trust_badges_enabled", "trust_badges", "benefits_section", "how_it_works_section", "faq_section",
    "image_zoom", "delivery_estimate", "show_social_proof", "show_quality_badge", "button_effect",
  ],
  magazin: [],
  card: ["show_category_badges", "new_badge", "price_range_display"],
  cos: ["sticky_cart_bar"],
  comanda: [],
};

/**
 * Cheile editorului vechi care NU mai au control in editorul unic, cu motivul.
 *
 * Nu se sterg din baza: raman citite acolo unde erau, doar ca nu le mai scrie
 * nimeni de aici.
 */
export const CHEI_RETRASE: Readonly<Record<string, string>> = {
  show_trust_strip_on_store: "vizibilitatea benzii de incredere o da ochiul din arbore",
  show_featured_section: "vizibilitatea randului Recomandate o da ochiul din arbore",
  show_shipping_progress: "vizibilitatea pragului de transport o da ochiul din arbore",
  hero_show_content: "varianta hero-ului se alege din galerie („Doar imagini” / „Imagine cu text peste”)",
  delivery_time: "se completeaza in Setari > Livrare; editorul doar o citea",
};

/** Nodul caruia ii apartine o cheie, sau `null` cand nu e a niciunuia. */
export function nodulCheii(cheie: string): FelContinut | typeof NOD_STIL | null {
  for (const [nod, chei] of Object.entries(CHEI_CONTINUT)) {
    if (chei.includes(cheie)) return nod as FelContinut | typeof NOD_STIL;
  }
  return null;
}
