import { parseStoreDesign } from "@/lib/storefront/design/parse";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";

/**
 * Designul derivat din continutul magazinului, recalculat in browser.
 *
 * ⚠ CUSATURA DINTRE CELE DOUA FELURI DE SALVARE.
 *
 * O parte din design se deriva din continut (`defaults.ts`): randurile de produse
 * din `product_sections`, varianta hero-ului din bannere, sectiunile pornite din
 * comutatoarele vechi. Pe doua ecrane separate, derivarea se refacea singura la
 * deschiderea editorului de design. In editorul unic, continutul se salveaza pe
 * acelasi ecran pe care sta ciorna, deci fara pasul asta ciorna din ecran ar
 * ramane cea derivata din continutul VECHI: un rand nou n-ar aparea in arbore,
 * un banner nou n-ar schimba hero-ul, iar previzualizarea ar arata altceva decat
 * magazinul.
 *
 * Se refoloseste parserul: e functie pura, deci da exact ce ar da serverul la
 * urmatoarea citire, cu tot cu alegerile omului (ochiul, varianta aleasa,
 * stergerile, ordinea aranjata), pe care le pastreaza.
 */

export interface MagazinPentruDerivare {
  primaryColor: string | null;
  pageContent: Record<string, unknown>;
  features: unknown;
  coverUrl: string | null;
  tagline: string | null;
}

/** Contextul parserului, construit ca pe paginile de server (`editor/page.tsx`, rutele publice). */
export function contextDesign(m: MagazinPentruDerivare): DesignContext {
  const features = m.features && typeof m.features === "object" && !Array.isArray(m.features)
    ? (m.features as Record<string, unknown>)
    : {};
  return {
    primaryColor: m.primaryColor ?? "#07c527",
    pageContent: m.pageContent,
    features,
    coverUrl: m.coverUrl,
    tagline: m.tagline,
  };
}

/** Acelasi design, cu partea derivata recalculata din contextul nou. */
export function rederiva(design: StoreDesign, ctx: DesignContext): StoreDesign {
  return parseStoreDesign(design, ctx);
}
