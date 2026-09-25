import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { storeBaseUrl } from "@/lib/seo";
import { BranduriClient } from "@/components/dashboard/BranduriClient";
import { permalinkuriDin } from "@/lib/storefront/permalinkuri";
import { setarileDin } from "@/lib/storefront/antet-magazin";

/**
 * Produse > Branduri: toate brandurile magazinului, cu cate produse are fiecare,
 * plus logo-ul si descrierea pentru pagina brandului din magazin.
 *
 * ⚠ Magazinul se alege EXACT ca in lista de produse (cel mai nou al utilizatorului),
 * ca numerele de aici si filtrul de brand din lista sa vorbeasca despre acelasi magazin.
 */
export default async function BranduriPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_settings(permalinks:page_content->permalinks)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  const [{ data: branduri }, { count: totalProduse }, { data: lista }] = await Promise.all([
    supabase.rpc("produse_branduri", { p_business: business.id }),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id),
    supabase.from("brands").select("name, logo_url, description").eq("business_id", business.id),
  ]);

  /* Detaliile se leaga de brand dupa nume, fara diferenta de majuscule (ca indexul unic din baza). */
  const detalii = new Map((lista ?? []).map((l) => [l.name.toLocaleLowerCase("ro"), l]));

  return (
    <BranduriClient
      businessId={business.id}
      adresaMagazin={storeBaseUrl(business)}
      prefixBrand={permalinkuriDin({ permalinks: setarileDin<{ permalinks: unknown }>(business as never)?.permalinks }).brand}
      branduri={(branduri ?? []).map((b) => {
        const d = detalii.get(b.brand.toLocaleLowerCase("ro"));
        return { brand: b.brand, produse: Number(b.produse), logo: d?.logo_url ?? null, descriere: d?.description ?? null };
      })}
      totalProduse={totalProduse ?? 0}
    />
  );
}
