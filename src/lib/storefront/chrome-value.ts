import { createAdminClient } from "@/lib/supabase/admin";
import { radacinaMagazin } from "@/lib/storefront/category-href";
import { meniuCuAcasa } from "@/lib/pages/menu";
import { standaloneAnnouncement } from "@/lib/storefront/design/chrome";
import { cartHref, cartOnPage, radacinaCatalog, shopOnPage } from "@/lib/storefront/design/commerce";
import { variantMeta } from "@/lib/storefront/design/registry";
import type { CartMode, StoreChromeValue } from "@/components/storefront/StorefrontProvider";
import type {
  StoreCategoryNode,
  StoreFeatures,
  StorePageContent,
  StoreSocial,
} from "@/lib/storefront/store-content.types";
import type { StoreDesign } from "@/lib/storefront/design/types";
import { pentruBrowser, type BusinessCitit } from "@/lib/storefront/business-public";
import type { Database } from "@/types/database.types";

/**
 * Intrarea e randul INTREG (apelantii sunt componente de server, care au nevoie
 * de `user_id` si `suspended_until` pentru propriile lor verificari), dar ce iese
 * de aici pleaca la componente de CLIENT — deci se taie, o singura data, in
 * `pentruBrowser`. Vezi ./business-public.ts pentru ce se taie si de ce.
 */
type Business = BusinessCitit;

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
  design,
  cartMode = "link",
  currentPageSlug = null,
  hasStickyBottomBar = false,
  isHome = false,
  searchCategories,
  comert,
}: {
  business: Business;
  pageContent: StorePageContent;
  basePath: string;
  /**
   * Configuratia de design a magazinului. Din ea se afla daca cosul e o pagina
   * de sine statatoare — singurul lucru din chrome care depinde de design.
   *
   * Optional ca sa nu forteze o schimbare in toate rutele deodata; unde
   * lipseste, cosul se comporta ca inainte.
   */
  design?: StoreDesign;
  cartMode?: CartMode;
  currentPageSlug?: string | null;
  hasStickyBottomBar?: boolean;
  /**
   * Pagina randata e chiar pagina principala a magazinului.
   *
   * Implicit `false`: functia asta serveste tocmai paginile care NU sunt pagina
   * principala. Pagina principala isi construieste singura contextul, in
   * `MiniStoreRenderer`.
   */
  isHome?: boolean;
  searchCategories?: StoreCategoryNode[];
  /**
   * Transportul, pragul de livrare gratuita si comanda minima, din
   * `store_settings`. Fara ele sertarul nu poate arata un total, deci butonul de
   * cos ramane link catre magazin.
   */
  comert?: {
    shippingCost: number;
    freeShippingThreshold: number | null;
    minOrderAmount: number | null;
    /**
     * Regimul de TVA. Fara el sertarul arata marfa plus transport, atat: la
     * magazinele cu preturi FARA TVA totalul iesea mai mic decat cel cerut la
     * finalizare.
     */
    vat?: import("@/lib/storefront/cart/pricing").CartPricingInput["vat"];
  };
}): StoreChromeData {
  // Un magazin cu cosul pe pagina il are pe pagina PESTE TOT: si in header-ul
  // paginii de produs, si in cel al paginilor custom. Modul „hidden" (magazinul
  // cu un singur produs) ramane insa deasupra: acolo nu exista catalog, deci
  // nici cos.
  const cosPePagina = !!design && cartMode !== "hidden" && cartOnPage(design);
  /*
   * Sertarul se deschide ACUM si pe paginile fara catalog.
   *
   * Pana acum, butonul de cos de pe pagina de produs sau de pe o pagina proprie
   * era un link catre magazin: clientul care adauga in cos si apasa pe cos era
   * dus pe prima pagina, si abia acolo se deschidea sertarul. Panoul cerea date
   * pe care paginile astea nu le aveau; acum le au, prin `comert`.
   *
   * Fara `comert` ramane linkul de dinainte: un sertar cu transportul zero ar
   * arata alt total decat pagina de magazin, pentru acelasi cos.
   */
  const cosSertar = !!design && cartMode === "link" && !cosPePagina && !!comert;

  return {
    business: pentruBrowser(business),
    basePath,
    // Se calculeaza aici, o singura data, ca cele ~12 componente care leaga o
    // categorie sau o pagina de catalog sa nu il mai deduca fiecare din
    // `basePath`. Fara design — doar miniaturile din editor — ramane radacina
    // magazinului, adica exact ce era inainte.
    catalogRoot: design ? radacinaCatalog(basePath, design) : radacinaMagazin(basePath),
    // Pe paginile fara catalog, cele doua coincid: nu exista o grila locala
    // catre care sa arate.
    categoriiRoot: design ? radacinaCatalog(basePath, design) : radacinaMagazin(basePath),
    // Categoriile devin pagini exact odata cu catalogul. Fara design — miniaturile
    // din editor — ramane forma cu interogare, adica exact ce era inainte.
    categoriiPePagina: !!design && shopOnPage(design),
    isHome,
    color: business.primary_color ?? "#1AB554",
    pageContent,
    features: (business.features as StoreFeatures) ?? {},
    social: (business.social as StoreSocial) ?? {},
    gallery: Array.isArray(business.gallery) ? (business.gallery as string[]) : [],
    // Cu „Acasa" in fata, cand comerciantul n-a scos-o. Vezi `meniuCuAcasa`.
    menu: meniuCuAcasa(pageContent.menu ?? [], pageContent.menu_fara_acasa),
    // Offsetul de sub bara de anunt trebuie sa vina din sectiunea care CHIAR se
    // randeaza: stinsa sau stearsa din editor, `page_content` ramane pe „enabled"
    // si header-ul lipit la `top-9` ar lasa o fasie goala in capul ecranului.
    // Unde designul nu e dat, calculul ramane cel de dinainte si il completeaza
    // invelisul de pagina, care il are mereu.
    hasAnnouncementBar:
      pageContent.show_announcement_on_store !== false
      && pageContent.announcement_bar?.enabled === true
      && (!design || standaloneAnnouncement(design)?.enabled === true),
    cartMode: cosPePagina ? "page" : cosSertar ? "drawer" : cartMode,
    cartHref: cosPePagina ? cartHref(basePath) : undefined,
    comert,
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
): Promise<StoreCategoryNode[] | undefined> {
  const cerute =
    variantMeta("header", design.chrome.header.variant)?.needsCategories === true ||
    variantMeta("footer", design.chrome.footer.variant)?.needsCategories === true;
  if (!cerute) return undefined;
  /*
   * ARBORELE intreg, nu doar radacinile.
   *
   * Radacinile ajungeau pentru un selector de langa cautare, dar meniul de pe
   * telefon si panourile din header trebuie sa arate si subcategoriile —
   * altfel, la un magazin cu opt categorii si douazeci si doua de subcategorii,
   * vizitatorul de pe telefon vede opt nume si n-are cum sa ajunga la restul.
   *
   * Costul e acelasi: o interogare, tot gated pe `needsCategories`. Plafonul
   * urca la 300 fiindca acum se numara si copiii.
   */
  const { data } = await createAdminClient()
    .from("categories")
    .select("id, name, parent_id, image_url, sort_order")
    .eq("business_id", businessId)
    .order("sort_order")
    .order("id")
    .limit(300);
  return data ?? [];
}
