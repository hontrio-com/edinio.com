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
import type { SetariTvaMagazin } from "@/lib/orders/totals-box";

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
  /**
   * Regimul de TVA de AZI al magazinului. ⚠ Pentru banii unei comenzi castiga
   * regimul inghetat pe ea; asta e doar rezerva, pentru comenzile de dinainte.
   */
  setariTva: SetariTvaMagazin;
  /** Cum se ajunge la magazin, pentru cardul „Ai nevoie de ajutor?". */
  contact: { telefon: string | null; email: string | null; whatsapp: string | null };
  /** Adresa magazinului de AZI, pentru ridicarea personala. */
  adresaMagazin: string | null;
  /** Etichetele campurilor proprii de la checkout, dupa id. */
  campuriCheckout: { id: string; label: string }[];
  /**
   * ⚠ Greutatea titlurilor, aleasa pe server: Instrument Serif exista NUMAI in
   * greutatea 400, iar un `font-semibold` peste el face browserul sa deseneze un
   * aldin fals.
   */
  greutateTitlu: "font-normal" | "font-semibold";
  sesiune: SesiuneCont | null;
};

export async function incarcaPaginaDeCont(slug: string): Promise<PaginaDeCont> {
  const supabase = await createClient();
  /*
    ⚠⚠ O PANA DE BAZA NU E UN 404. Prima scriere lua doar `data` si arunca
    `error`, deci o clipa in care baza nu raspunde se prefacea in „magazinul nu
    exista", adica intr-un raspuns pe care si omul, si Google il cred. Restul
    casei raspunde 503 la acelasi lucru (vezi `serviciuIndisponibil()` din
    `src/proxy.ts`). Aruncam, si `error.tsx` al vitrinei spune „reveniti".
  */
  const { data: business, error: eBusiness } = await supabase
    .from("businesses")
    .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, custom_domain, custom_domain_healthy, suspended_until, social, gallery, features")
    .eq("slug", slug)
    .single();
  if (eBusiness && eBusiness.code !== "PGRST116") throw eBusiness;
  if (!business || business.is_published !== true) notFound();

  const host = (await headers()).get("host");
  if (!originaEsteNumaiAMagazinului(host, business)) notFound();

  const { data: storeSettings, error: eSetari } = await createAdminClient()
    .from("store_settings")
    .select("page_content, storefront_design, cont_client_config, default_shipping_cost, free_shipping_threshold, min_order_amount, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown")
    .eq("business_id", business.id)
    .single();

  if (eSetari && eSetari.code !== "PGRST116") throw eSetari;
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
    ⚠ SIRUL GOL, si nu e o scurtatura: zona de cont traieste NUMAI pe domeniul
    propriu (poarta de origine de mai sus), iar acolo proxy-ul rescrie totul sub
    `/{slug}`, deci calea pe care o vede omul e `/cont`, nu `/{slug}/cont`.
    Antetul si subsolul compun restul linkurilor magazinului din chiar valoarea
    asta, si tot fara slug trebuie sa iasa.
    ⚠ Cand va aparea `<slug>.edinio.com` (valul 3), tot asa ramane: si acolo
    originea e numai a magazinului, deci calea e fara slug.
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
  /* Doua citiri independente, dupa ce toate portile au trecut: in paralel. */
  const [searchCategories, sesiune] = await Promise.all([
    loadSearchCategories(business.id, resolved.design),
    sesiuneCurenta(business.id),
  ]);
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

  /* Aceleasi implicite ca pagina de comanda din panou: un magazin fara rand de
     setari nu incepe sa adune TVA peste total. */
  const setariTva: SetariTvaMagazin = {
    vat_enabled: storeSettings?.vat_enabled ?? false,
    prices_include_vat: storeSettings?.prices_include_vat ?? true,
  };

  const curat = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const adresaMagazin = [curat(business.store_address), curat(business.store_city), curat(business.store_county)]
    .filter(Boolean).join(", ") || null;
  const campuriCheckout = (pageContent.checkout_config?.custom_fields ?? [])
    .filter((c) => c && typeof c.id === "string" && typeof c.label === "string")
    .map((c) => ({ id: c.id, label: c.label }));

  return {
    magazin, basePath, color, storeName, chrome, resolved, setariTva,
    contact: { telefon: curat(business.phone), email: curat(business.email), whatsapp: curat(business.whatsapp) },
    adresaMagazin,
    campuriCheckout,
    greutateTitlu: resolved.style.fontHeading === "instrument" ? "font-normal" : "font-semibold",
    sesiune,
  };
}
