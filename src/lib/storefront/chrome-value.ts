import type { CartMode, StoreChromeValue } from "@/components/storefront/StorefrontProvider";
import type {
  StoreFeatures,
  StorePageContent,
  StoreSocial,
} from "@/lib/storefront/store-content.types";
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
}: {
  business: Business;
  pageContent: StorePageContent;
  basePath: string;
  cartMode?: CartMode;
  currentPageSlug?: string | null;
  hasStickyBottomBar?: boolean;
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
  };
}
