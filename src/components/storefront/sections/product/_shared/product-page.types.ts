import type { MenuItem } from "@/lib/pages/menu";
import type { Database } from "@/types/database.types";

/**
 * Formele de date pe care le citeste orice varianta de pagina de produs.
 *
 * Erau declarate in ProductPageClassic; au iesit aici cand a aparut a doua
 * varianta. `page_sections` e o coloana Json fara schema in baza, iar tipul ei
 * e redeclarat in cinci locuri (formular, actiuni, export, import, randare) -
 * cel putin randarea are acum o singura copie.
 */

export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type StoreSettings = Database["public"]["Tables"]["store_settings"]["Row"];

export interface TrustBadge { icon: string; title: string; desc: string; }
export interface BenefitItem { title: string; desc: string; }
export interface HowItWorksStep { title: string; desc: string; }
export interface FaqItem { q: string; a: string; }
export interface SpecItem { label: string; value: string; }

export interface PageContent {
  announcement_bar?: { enabled: boolean; text: string; bg_color: string; speed?: number; };
  menu?: MenuItem[];
  logo_size?: number;
  trust_badges_enabled?: boolean;
  trust_badges?: TrustBadge[];
  benefits_section?: { enabled: boolean; title: string; items: BenefitItem[]; };
  how_it_works_section?: { enabled: boolean; title: string; steps: HowItWorksStep[]; };
  faq_section?: { enabled: boolean; title: string; items: FaqItem[]; };
  image_zoom?: { enabled: boolean };
  delivery_estimate?: { enabled: boolean; min_days: number; max_days: number; text?: string };
  price_range_display?: { enabled: boolean };
  button_effect?: string;
  show_social_proof?: boolean;
  show_quality_badge?: boolean;
  footer_logo_size?: number;
  checkout_config?: {
    custom_fields?: Array<{ id: string; label: string; type: "text" | "textarea" | "select" | "checkbox"; options?: string; required: boolean; placeholder?: string; }>;
    extras?: Array<{ id: string; label: string; price: number; description?: string; }>;
  };
}

export interface VariantCombo {
  id: string;
  title: string;
  price: string;
  compare_at_price: string;
  sku: string;
  stock_quantity: string;
  image: string;
  enabled: boolean;
}

export interface CustomizationFieldDef {
  id: string;
  type: "text" | "textarea" | "image" | "select" | "color";
  label: string;
  placeholder?: string;
  required: boolean;
  max_length?: number;
  max_files?: number;
  max_file_size_mb?: number;
  options?: string[];
  default_color?: string;
  helper_text?: string;
}

export interface PageSections {
  short_description?: string;
  specifications?: SpecItem[];
  quantity_tiers?: {
    enabled: boolean;
    mode?: "fixed" | "percent";
    tier2_price: number;
    tier2_percent?: number;
    tier2_badge: string;
    tier3_price: number;
    tier3_percent?: number;
    tier3_badge: string;
  };
  stock_status?: "in_stock" | "out_of_stock" | "preorder";
  dimensions?: { length: number; width: number; height: number };
  variants?: {
    enabled: boolean;
    options: { id: string; name: string; values: string[] }[];
    combinations: VariantCombo[];
  };
  customization?: {
    enabled: boolean;
    fields: CustomizationFieldDef[];
  };
  /** Atribute pentru feed-urile de marketplace. Brandul si EAN-ul stau aici, nu in coloane. */
  google?: {
    gtin?: string;
    brand?: string;
    mpn?: string;
    condition?: string;
    color?: string;
    size?: string;
    material?: string;
  };
}
