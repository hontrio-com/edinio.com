import { fontDinPageContent } from "@/lib/storefront/design/fonturi-magazin";
import type { FontKey } from "@/lib/storefront/design/types";
import type { ModAsezare, ModRest } from "@/lib/storefront/asezare";
import type { ProductSection } from "@/lib/store-sections";
import { TITLU_INSIGNE_IMPLICIT, type InsignaFooterStocata } from "@/lib/storefront/footer-badges";

/**
 * Continutul magazinului pe care il editeaza editorul unic: o parte din
 * `page_content`, cu valorile de pornire.
 *
 * Mutat aici din `StoreEditor.tsx` (editorul vechi), NESCHIMBAT: aceleasi chei si
 * aceleasi implicite. Implicitele nu se scriu singure in baza: fiecare nod trimite
 * doar ce a atins omul (`chei-atinse.ts`), deci un magazin care nu deschide un
 * nod ramane exact cum era.
 */

export interface ContinutPagina {
  announcement_bar?: { enabled: boolean; text: string; bg_color: string; speed?: number };
  trust_badges_enabled?: boolean;
  trust_badges?: Array<{ icon: string; title: string; desc: string }>;
  show_trust_strip_on_store?: boolean;
  store_trust_badges?: Array<{ icon: string; title: string; desc: string }>;
  show_featured_section?: boolean;
  featured_section_title?: string;
  show_shipping_progress?: boolean;
  store_benefits_section?: { enabled: boolean; title: string; items: Array<{ title: string; desc: string }> };
  benefits_section?: { enabled: boolean; title: string; items: Array<{ title: string; desc: string }> };
  reviews_section?: { enabled: boolean; title: string; items: Array<{ name: string; rating: number; text: string; date: string; image?: string }> };
  how_it_works_section?: { enabled: boolean; title: string; steps: Array<{ title: string; desc: string }> };
  faq_section?: { enabled: boolean; title: string; items: Array<{ q: string; a: string }> };
  button_effect?: string;
  show_announcement_on_store?: boolean;
  sort_options?: { enabled: boolean; default_sort?: string };
  home_order?: { mod?: ModAsezare; ids?: string[]; rest?: ModRest };
  filter_options?: { enabled: boolean };
  sticky_cart_bar?: { enabled: boolean };
  new_badge?: { enabled: boolean; days: number };
  price_range_display?: { enabled: boolean };
  image_zoom?: { enabled: boolean };
  delivery_estimate?: { enabled: boolean; min_days: number; max_days: number; text?: string };
  /* Zilele reale de livrare, din Setari > Livrare. Cand exista, ele bat
     `min_days`/`max_days` si pe pagina, si in datele structurate. Doar de citit
     aici. Vezi `@/lib/shipping/delivery-time`. */
  delivery_time?: { enabled: boolean; handling_min: number; handling_max: number; transit_min: number; transit_max: number };
  show_social_proof?: boolean;
  /** Ce numara contorul de vizitatori (etapa 12): „acum” (15 minute) sau ultimele 24 de ore. */
  social_proof_window?: "now" | "day";
  show_quality_badge?: boolean;
  show_category_badges?: boolean;
  footer_badges?: InsignaFooterStocata[];
  footer_badges_title?: string;
  footer_badges_title_enabled?: boolean;
  product_sections?: ProductSection[];
  hide_edinio_badge?: boolean;
  store_bg_color?: string;
  logo_size?: number;
  footer_logo_size?: number;
  favicon_url?: string | null;
  hero_show_content?: boolean;
  hero_banners?: string[];
  hero_banner_links?: string[];
  /** Fonturile magazinului (01.10.2026). Lipsa = Geist. Vezi `fonturi-magazin.ts`. */
  font_titluri?: FontKey;
  font_text?: FontKey;
}

const GARANTII_IMPLICITE = [
  { icon: "truck", title: "Livrare 24-48h", desc: "Livrare rapida in toata Romania." },
  { icon: "shield", title: "Plata la livrare", desc: "Platesti cash curierului. Zero riscuri." },
  { icon: "rotate-ccw", title: "Retur 14 zile", desc: "Returneaza fara intrebari in 14 zile." },
  { icon: "phone", title: "Suport", desc: "Disponibil pentru orice intrebare." },
];

/** Starea de pornire a editorului, din `page_content` si culoarea magazinului. */
export function continutInitial(pc: ContinutPagina, culoare: string): ContinutPagina {
  return {
    announcement_bar: pc.announcement_bar ?? { enabled: false, text: "PLATA LA LIVRARE   ✦   LIVRARE RAPIDA 24-48H IN TOATA ROMANIA   ✦   RETUR 14 ZILE", bg_color: culoare },
    trust_badges_enabled: pc.trust_badges_enabled ?? true,
    trust_badges: pc.trust_badges ?? GARANTII_IMPLICITE,
    show_trust_strip_on_store: pc.show_trust_strip_on_store ?? false,
    store_trust_badges: pc.store_trust_badges ?? GARANTII_IMPLICITE,
    show_featured_section: pc.show_featured_section ?? false,
    featured_section_title: pc.featured_section_title ?? "Recomandate",
    show_shipping_progress: pc.show_shipping_progress ?? false,
    store_benefits_section: pc.store_benefits_section ?? { enabled: false, title: "De ce sa alegi produsele noastre", items: [] },
    benefits_section: pc.benefits_section ?? { enabled: false, title: "De ce sa alegi acest produs", items: [] },
    how_it_works_section: pc.how_it_works_section ?? { enabled: false, title: "Cum functioneaza", steps: [] },
    faq_section: pc.faq_section ?? { enabled: false, title: "Intrebari frecvente", items: [] },
    button_effect: pc.button_effect ?? "none",
    reviews_section: pc.reviews_section ?? { enabled: false, title: "Ce spun clientii nostri", items: [] },
    show_announcement_on_store: pc.show_announcement_on_store ?? true,
    // `enabled` chiar se citeste (bara de cautare si filtre). Pana la 05.08.2026
    // era scris mereu `true` si ignorat de randare.
    sort_options: {
      enabled: pc.sort_options?.enabled ?? true,
      default_sort: pc.sort_options?.default_sort ?? "newest",
    },
    /*
     * Asezarea grilei de pe prima pagina. Implicitul e „” — adica „nu s-a ales
     * nimic", nu „cele mai noi”: asa un magazin care n-a deschis nodul ramane pe
     * `sort_options.default_sort`, exact ca inainte sa existe reglajul.
     */
    home_order: {
      mod: pc.home_order?.mod ?? "",
      ids: pc.home_order?.ids ?? [],
      rest: pc.home_order?.rest ?? "newest",
    },
    filter_options: pc.filter_options ?? { enabled: true },
    sticky_cart_bar: pc.sticky_cart_bar ?? { enabled: true },
    new_badge: pc.new_badge ?? { enabled: true, days: 7 },
    price_range_display: pc.price_range_display ?? { enabled: true },
    image_zoom: pc.image_zoom ?? { enabled: true },
    delivery_estimate: pc.delivery_estimate ?? { enabled: false, min_days: 2, max_days: 4, text: "Estimare livrare" },
    delivery_time: pc.delivery_time,
    show_social_proof: pc.show_social_proof ?? false,
    social_proof_window: pc.social_proof_window === "now" ? "now" : "day",
    show_quality_badge: pc.show_quality_badge ?? false,
    show_category_badges: pc.show_category_badges ?? true,
    footer_badges: pc.footer_badges ?? [],
    // Titlul se scrie in stare cu implicitul, ca sa se vada in caseta din prima
    // clipa: golit de om inseamna „fara titlu”, o alegere vizibila.
    footer_badges_title: pc.footer_badges_title ?? TITLU_INSIGNE_IMPLICIT,
    footer_badges_title_enabled: pc.footer_badges_title_enabled ?? true,
    product_sections: pc.product_sections ?? [],
    hide_edinio_badge: pc.hide_edinio_badge ?? false,
    store_bg_color: pc.store_bg_color ?? "#FFFFFF",
    logo_size: pc.logo_size ?? 36,
    footer_logo_size: pc.footer_logo_size ?? 36,
    favicon_url: pc.favicon_url ?? null,
    hero_show_content: pc.hero_show_content ?? false,
    hero_banners: pc.hero_banners,
    hero_banner_links: pc.hero_banner_links,
    font_titluri: fontDinPageContent(pc.font_titluri),
    font_text: fontDinPageContent(pc.font_text),
  };
}
