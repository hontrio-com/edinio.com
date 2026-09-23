import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { resolveDesign } from "@/lib/storefront/design/parse";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { originaEsteNumaiAMagazinului, conturilePornite } from "./origine";
import { magazinulEOprit, type MagazinDeCont } from "./magazinul-cererii";
import { sesiuneCurenta, type SesiuneCont } from "./sesiune";

/**
 * Tot ce-i trebuie unei pagini din zona de cont, intr-un singur loc.
 *
 * ⚠⚠ DE CE EXISTA. Pe vitrina, layoutul NU randeaza antetul si subsolul: fiecare
 * pagina isi construieste singura invelisul, si sunt deja ZECE locuri care cheama
 * `resolveDesign` si citesc `store_settings` cu liste de coloane deosebite. O
 * pagina noua care uita un pas (`loadSearchCategories`, `comert`) arata subtil
 * altfel decat restul magazinului, si nimeni nu vede de ce.
 *
 * Zona de cont are cel putin opt pagini. Scrise fiecare pe cont propriu, ar fi
 * fost opt copii noi. Aici e una.
 *
 * ⚠ SI TOT AICI STAU CELE PATRU PORTI, in ordine:
 *   1. magazinul exista si e publicat;
 *   2. ORIGINEA e numai a lui (vezi `origine.ts`: pe `www.edinio.com` toate
 *      vitrinele impart o origine, si acolo contul nu se poate apara);
 *   3. comutatorul din Setari e aprins (H2), si stins inseamna 404, nu link ascuns;
 *   4. magazinul nu e oprit (suspendat sau abonament expirat), aceeasi regula ca
 *      la `/cos` si `/checkout`.
 *
 * Toate patru raspund la fel: `notFound()`. Un mesaj deosebit pentru fiecare ar
 * fi spus din afara in ce stare e magazinul altcuiva.
 */
export type PaginaDeCont = {
  magazin: MagazinDeCont;
  basePath: string;
  color: string;
  storeName: string;
  chrome: ReturnType<typeof buildChromeData>;
  resolved: ReturnType<typeof resolveDesign>;
  sesiune: SesiuneCont | null;
};

export async function incarcaPaginaDeCont(slug: string): Promise<PaginaDeCont> {
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, custom_domain, custom_domain_healthy, suspended_until, social, gallery, features")
    .eq("slug", slug)
    .single();
  if (!business || business.is_published !== true) notFound();

  const host = (await headers()).get("host");
  if (!originaEsteNumaiAMagazinului(host, business)) notFound();

  const { data: storeSettings } = await createAdminClient()
    .from("store_settings")
    .select("page_content, storefront_design, cont_client_config, default_shipping_cost, free_shipping_threshold, min_order_amount, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown")
    .eq("business_id", business.id)
    .single();

  if (!conturilePornite(storeSettings?.cont_client_config)) notFound();

  const magazin: MagazinDeCont = {
    id: business.id,
    slug: business.slug,
    store_name: business.store_name,
    business_name: business.business_name,
    custom_domain: business.custom_domain,
    custom_domain_healthy: business.custom_domain_healthy,
    suspended_until: business.suspended_until,
    user_id: business.user_id,
  };
  if (await magazinulEOprit(magazin)) notFound();

  const color = business.primary_color ?? "#07c527";
  const storeName = business.store_name ?? business.business_name ?? "magazin";

  /*
    ⚠ Pe domeniul propriu calea vazuta de om e `/cont`, nu `/{slug}/cont`, si
    zona de cont TRAIESTE numai acolo. `basePath` ramane totusi calculat la fel
    ca pe restul vitrinei, fiindca antetul si subsolul il folosesc pentru toate
    celelalte linkuri ale magazinului.
  */
  const basePath = "";

  const pageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: color,
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });
  const searchCategories = await loadSearchCategories(business.id, resolved.design);
  const chrome = buildChromeData({
    searchCategories,
    business: business as never,
    pageContent,
    basePath,
    design: resolved.design,
    comert: {
      shippingCost: Number(storeSettings?.default_shipping_cost ?? 0),
      freeShippingThreshold: storeSettings?.free_shipping_threshold ?? null,
      minOrderAmount: storeSettings?.min_order_amount ?? null,
      vat: {
        vat_enabled: storeSettings?.vat_enabled ?? false,
        vat_rate: Number(storeSettings?.vat_rate ?? 19),
        prices_include_vat: storeSettings?.prices_include_vat ?? true,
        show_vat_breakdown: storeSettings?.show_vat_breakdown ?? true,
      },
    },
  });

  const sesiune = await sesiuneCurenta(business.id);

  return { magazin, basePath, color, storeName, chrome, resolved, sesiune };
}
