import { createAdminClient } from "@/lib/supabase/admin";
import { variantMeta } from "@/lib/storefront/design/registry";
import type { CartMode, StoreChromeValue } from "@/components/storefront/StorefrontProvider";
import type {
  StoreFeatures,
  StorePageContent,
  StoreSocial,
} from "@/lib/storefront/store-content.types";
import type { StoreDesign } from "@/lib/storefront/design/types";
import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];

/**
 * Partea serializabila a identitatii magazinului.
 *
 * Callback-urile (`openCart`, `openLightbox`) lipsesc deliberat: valoarea asta e
 * construita in componente de server si trimisa ca prop unei componente de
 * client, iar functiile nu pot traversa granita. Le adauga invelisul de pagina,
 * care ruleaza pe client.
 */
export type StoreChromeData = Omit<StoreChromeValue, "openCart" | "openLightbox">;

/**
 * Construieste identitatea magazinului pentru paginile publice fara catalog.
 *
 * Aceleasi derivari erau facute, usor diferit, in fiecare pagina: meniul,
 * culoarea, marimile de logo. Acum sunt intr-un loc, ca header-ul si footer-ul
 * sa primeasca exact aceleasi date indiferent pe ce pagina se afla.
 */
export function buildChromeData({
  business,
  pageContent,
  basePath,
  cartMode = "link",
  currentPageSlug = null,
  hasStickyBottomBar = false,
  searchCategories,
}: {
  business: Business;
  pageContent: StorePageContent;
  basePath: string;
  cartMode?: CartMode;
  currentPageSlug?: string | null;
  hasStickyBottomBar?: boolean;
  searchCategories?: string[];
}): StoreChromeData {
  return {
    business,
    basePath,
    color: business.primary_color ?? "#1AB554",
    pageContent,
    features: (business.features as StoreFeatures) ?? {},
    social: (business.social as StoreSocial) ?? {},
    gallery: Array.isArray(business.gallery) ? (business.gallery as string[]) : [],
    menu: pageContent.menu ?? [],
    hasAnnouncementBar:
      pageContent.show_announcement_on_store !== false && pageContent.announcement_bar?.enabled === true,
    cartMode,
    currentPageSlug,
    hasStickyBottomBar,
    searchCategories,
  };
}

/**
 * Categoriile de nivel intai, dar numai daca varianta de header aleasa le
 * foloseste. Un header fara selector de categorie n-are de ce sa produca o
 * interogare in plus pe fiecare pagina de produs.
 */
export async function loadSearchCategories(
  businessId: string,
  design: StoreDesign,
): Promise<string[] | undefined> {
  const cerute =
    variantMeta("header", design.chrome.header.variant)?.needsCategories === true ||
    variantMeta("footer", design.chrome.footer.variant)?.needsCategories === true;
  if (!cerute) return undefined;
  const { data } = await createAdminClient()
    .from("categories")
    .select("name")
    .eq("business_id", businessId)
    .is("parent_id", null)
    .order("sort_order")
    .limit(50);
  return (data ?? []).map((c) => c.name);
}
