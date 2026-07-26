import type { ProductSection } from "@/lib/store-sections";
import type { MenuItem } from "@/lib/pages/menu";

/**
 * Forma lui `store_settings.page_content` asa cum o citeste storefrontul.
 *
 * Pana acum tipul era declarat de trei ori, independent si divergent:
 * `MiniStoreRenderer`, `ProductPage` si `StoreEditor`. Aici e mutata versiunea
 * citita de magazin, verbatim, ca sectiunile extrase sa aiba de unde sa o
 * importe. Editorul isi pastreaza deocamdata copia lui (un superset), pana cand
 * setarile migreaza sectiune cu sectiune in configuratia de design.
 *
 * Toate campurile sunt optionale pentru ca jsonb-ul poate fi gol sau scris de o
 * versiune veche a aplicatiei; consumatorii au fallback per cheie.
 */
export interface StorePageContent {
  announcement_bar?: { enabled: boolean; text: string; bg_color: string; speed?: number };
  trust_badges_enabled?: boolean;
  trust_badges?: Array<{ icon: string; title: string; desc: string }>;
  show_trust_strip_on_store?: boolean;
  store_trust_badges?: Array<{ icon: string; title: string; desc: string }>;
  show_featured_section?: boolean;
  featured_section_title?: string;
  show_shipping_progress?: boolean;
  store_benefits_section?: { enabled: boolean; title: string; items: Array<{ title: string; desc: string }> };
  reviews_section?: {
    enabled: boolean;
    title: string;
    items: Array<{ name: string; rating: number; text: string; date: string; image?: string }>;
  };
  checkout_config?: {
    custom_fields?: Array<{
      id: string;
      label: string;
      type: "text" | "textarea" | "select" | "checkbox";
      options?: string;
      required: boolean;
      placeholder?: string;
    }>;
    extras?: Array<{ id: string; label: string; price: number; description?: string }>;
    hidden_fields?: string[];
    email_field?: { enabled: boolean; required: boolean };
  };
  show_announcement_on_store?: boolean;
  sort_options?: { enabled: boolean; default_sort?: "newest" | "price_asc" | "price_desc" | "popular" | "name_asc" };
  sticky_cart_bar?: { enabled: boolean };
  new_badge?: { enabled: boolean; days: number };
  price_range_display?: { enabled: boolean };
  store_bg_color?: string;
  logo_size?: number;
  footer_logo_size?: number;
  hero_show_content?: boolean;
  hero_banners?: string[];
  hero_banner_links?: string[];
  show_category_badges?: boolean;
  hide_products_without_images?: boolean;
  hide_out_of_stock_products?: boolean;
  product_sections?: ProductSection[];
  menu?: MenuItem[];
}

/** `businesses.social` */
export interface StoreSocial {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
}

/** `businesses.features` — sectiuni si butoane flotante pornite/oprite. */
export interface StoreFeatures {
  show_gallery?: boolean;
  show_about?: boolean;
  show_contact?: boolean;
  floating_whatsapp?: boolean;
  floating_call?: boolean;
}

/** O politica poate fi text simplu (format vechi) sau obiect cu comutator. */
export interface StorePolicyValue {
  content?: string;
  enabled?: boolean;
}

export interface StorePolicies {
  terms?: string | StorePolicyValue;
  delivery?: string | StorePolicyValue;
  return?: string | StorePolicyValue;
  privacy?: string | StorePolicyValue;
  gdpr?: string | StorePolicyValue;
  cancellation?: string | StorePolicyValue;
}

/** Un rand din `categories`, cat foloseste storefrontul. */
export interface StoreCategoryNode {
  id: string;
  name: string;
  parent_id: string | null;
  image_url: string | null;
  sort_order: number;
}
