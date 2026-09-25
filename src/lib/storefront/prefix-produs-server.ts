import { createAdminClient } from "@/lib/supabase/admin";
import { PERMALINKURI_IMPLICITE, permalinkuriDin, type Permalinkuri } from "@/lib/storefront/permalinkuri";

/**
 * Prefixele unui magazin (Setari > Permalink-uri), pentru codul care lucreaza in
 * afara vitrinei: cronuri, santinela, sincronizarile cu Brevo, Mailchimp, Klaviyo.
 *
 * ⚠ Se citeste DOAR cheia `permalinks` din `page_content`, nu coloana intreaga.
 * ⚠ La orice eroare, prefixele implicite: o adresa veche ia oricum redirectionare
 * permanenta spre cea curenta, deci nu se trimite niciodata o adresa moarta.
 */
export async function permalinkuriMagazinDupaId(businessId: string): Promise<Permalinkuri> {
  try {
    const { data } = await createAdminClient()
      .from("store_settings")
      .select("permalinks:page_content->permalinks")
      .eq("business_id", businessId)
      .maybeSingle();
    return permalinkuriDin({ permalinks: (data as { permalinks?: unknown } | null)?.permalinks });
  } catch {
    return { ...PERMALINKURI_IMPLICITE };
  }
}

/** Doar prefixul produselor. */
export async function prefixProdusMagazin(businessId: string): Promise<string> {
  return (await permalinkuriMagazinDupaId(businessId)).produs;
}
