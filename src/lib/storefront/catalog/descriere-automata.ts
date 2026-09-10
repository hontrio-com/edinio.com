import { createAdminClient } from "@/lib/supabase/admin";
import { parseStoreSeo, storeBaseUrl } from "@/lib/seo";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { shopOnPage } from "@/lib/storefront/design/commerce";
import { citesteSetariMagazin } from "@/lib/storefront/catalog/shop-settings";
import { canonicalCatalog } from "@/lib/storefront/catalog/url";
import { canonicalPagina, titluSiDescriere } from "@/lib/storefront/catalog/date-catalog";
import { categoriiMagazin } from "@/lib/storefront/catalog/context-descriere";
import { preturiFaraTva } from "@/lib/storefront/catalog/descriere-generata";
import { descrierePaginiiCatalog, randulPaginiiCategoriei } from "@/lib/storefront/catalog/metadata-magazin";
import { contextPaginiiFaraCatalog } from "@/lib/storefront/catalog/metadata-acasa";

/** Ce afla editorul de descriere din panou (Produse > Categorii) despre pagina unei categorii. */
export interface DescriereAutomataCategorie {
  /**
   * Textul AUTOMAT al paginii, exact cel pe care il pune magazinul cand comerciantul n-a scris
   * nimic. `null` cand categoria n-are pagina ei (`ascunsa` sau `umbritaDe`).
   */
  text: string | null;
  /**
   * Titlul paginii, cel din `<title>`, pentru previzualizarea Google din panou. Tot din
   * `titluSiDescriere`, ca sa nu existe o a doua regula in client. `null` exact cand `text` e.
   */
  titlu: string | null;
  /** Adresa pe care o descrie textul: `/magazin/<categorie>` sau, fara pagina de catalog, `?cat=<nume>`. */
  adresa: string;
  /** Ea sau o categorie de deasupra e ascunsa: pagina da 404, deci descrierea nu apare nicaieri. */
  ascunsa: boolean;
  /**
   * Alta categorie VIZIBILA, mai sus in panou, da aceeasi adresa: pagina e a ei, deci si textul
   * (`randulPaginiiCategoriei`). Ce se scrie pe categoria de fata nu se foloseste nicaieri.
   */
  umbritaDe: { id: string; nume: string } | null;
  /** Magazinul are domeniu propriu. Fara el, paginile de pe www.edinio.com sunt `noindex`. */
  areDomeniu: boolean;
}

/** Coloanele din `store_settings` pe care le citeste functia. */
type SetariCitite = {
  page_content: unknown;
  storefront_design: unknown;
  vat_enabled: boolean | null;
  prices_include_vat: boolean | null;
};

/** Contextul minim al designului, ca in metadata: `shop.page` nu depinde de culori sau de bannere. */
const CONTEXT_DESIGN = { primaryColor: "#1AB554", pageContent: {}, features: {} };

/**
 * Textul automat al paginii unei categorii, pentru placeholderul editorului din panou.
 *
 * ═══ ⚠ EXACT TEXTUL DIN MAGAZIN, PRIN ACELEASI FUNCTII ═══
 *
 * Placeholderul promite „asta apare in Google daca nu scrii nimic". Compus aici a doua oara,
 * prima nepotrivire (o sortare, un comutator, TVA-ul) ar fi aratat comerciantului un text pe care
 * nu-l vede nimeni. Deci:
 *
 *   - magazin CU pagina de catalog: `descrierePaginiiCatalog`, cu adresa curata (fara `sale`,
 *     fara `page`), ca `metadataMagazin` pe `/magazin/<categorie>`;
 *   - magazin FARA pagina de catalog: `contextPaginiiFaraCatalog`, ca ramura 5 din
 *     `metadataAcasaFiltrata` pe `/?cat=<nume>` (acolo `/magazin/<categorie>` redirecteaza);
 *   - amandoua prin `titluSiDescriere(..., null)`: fara textul propriu, adica exact ce ramane
 *     cand comerciantul alege textul automat.
 *
 * Randul care ia pagina e cel din vitrina: `randulPaginiiCategoriei` pe lista ordonata a lui
 * `categoriiMagazin`. Citirile se fac cu cheia de serviciu, dar numai pe `businessId` primit de la
 * actiune, care l-a legat deja de utilizatorul autentificat.
 *
 * `null` = magazinul sau categoria nu exista (ori n-au putut fi citite).
 */
export async function descriereAutomataCategoriei(
  businessId: string,
  categorieId: string,
): Promise<DescriereAutomataCategorie | null> {
  const { data: business, error } = await createAdminClient()
    .from("businesses")
    .select("id, slug, business_name, store_name, tagline, description, custom_domain, store_settings(page_content, storefront_design, vat_enabled, prices_include_vat)")
    .eq("id", businessId)
    .maybeSingle();
  if (error) {
    console.error(`[descriere] magazinul ${businessId} n-a putut fi citit:`, error.message);
    return null;
  }
  if (!business) return null;

  const { toate, vizibile } = await categoriiMagazin(businessId);
  const cat = toate.find((c) => c.id === categorieId);
  if (!cat) return null;

  const brut = (business as unknown as { store_settings: SetariCitite | SetariCitite[] | null }).store_settings;
  const settings = Array.isArray(brut) ? brut[0] : brut;
  const pageContent = settings?.page_content ?? null;
  const design = parseStoreDesign(settings?.storefront_design ?? null, CONTEXT_DESIGN);
  const areCatalog = shopOnPage(design);
  const radacina = storeBaseUrl(business);
  const displayName = business.store_name ?? business.business_name;

  const baza = {
    // Canonicalul fiecarei forme, prin aceleasi functii ca metadata: pe el il vede Google.
    adresa: areCatalog
      ? canonicalPagina(radacina, cat.name, {}).url
      : canonicalCatalog(radacina, { cat: cat.name }).url,
    areDomeniu: !!business.custom_domain,
  };

  // Ascunsa (ea sau un parinte): ruta da 404, deci nu exista niciun text de aratat.
  if (!vizibile.some((c) => c.id === cat.id)) return { ...baza, text: null, titlu: null, ascunsa: true, umbritaDe: null };
  const castigatoare = randulPaginiiCategoriei(vizibile, cat.name);
  if (castigatoare && castigatoare.id !== cat.id) {
    return { ...baza, text: null, titlu: null, ascunsa: false, umbritaDe: { id: castigatoare.id, nume: castigatoare.name } };
  }

  const faraTva = preturiFaraTva(settings);
  const context = areCatalog
    ? (await descrierePaginiiCatalog({
        businessId,
        numeCategorie: cat.name,
        pageContent,
        sp: {},
        setari: citesteSetariMagazin(design),
        faraTva,
        seo: parseStoreSeo(pageContent),
        business,
        displayName,
      })).context
    : await contextPaginiiFaraCatalog(businessId, cat.name, pageContent, false, faraTva);
  const { titlu, descriere } = titluSiDescriere(cat.name, displayName, context, null);
  return { ...baza, text: descriere, titlu, ascunsa: false, umbritaDe: null };
}
