import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { FacebookCatalogClient } from "@/components/dashboard/FacebookCatalogClient";
import { FacebookFeeduriClient } from "@/components/dashboard/FacebookFeeduriClient";
import { parseFeeduri } from "@/lib/facebook/feeduri";
import { storeBaseUrl } from "@/lib/seo";
import type { MarketingConfig } from "@/lib/marketing";

export default async function FacebookCatalogPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_settings(marketing_config, facebook_feeds)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!biz) redirect("/dashboard");

  const settings = Array.isArray(biz.store_settings) ? biz.store_settings[0] : biz.store_settings;
  const pixelConfigured = !!(settings?.marketing_config as MarketingConfig | null)?.facebook_pixel_id?.trim();

  const { count } = await supabase
    .from("products").select("id", { count: "exact", head: true })
    .eq("business_id", biz.id).eq("is_active", true);

  const base = biz.slug ? storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain }) : "https://www.edinio.com";

  /*
   * Categoriile, aplatizate cu adancimea lor, ca ecranul sa le poata indenta.
   * Masurat pe productie: un magazin are 110 categorii, din care 104 subcategorii
   * — o lista plata, fara ierarhie vizibila, ar fi de necitit.
   */
  const { data: catRows } = await supabase
    .from("categories").select("id, name, parent_id, sort_order")
    .eq("business_id", biz.id).order("sort_order");
  const copii = new Map<string | null, { id: string; name: string; parent_id: string | null }[]>();
  for (const c of catRows ?? []) {
    const l = copii.get(c.parent_id ?? null) ?? [];
    l.push(c); copii.set(c.parent_id ?? null, l);
  }
  const categoriiAplatizate: { id: string; name: string; nivel: number }[] = [];
  const vizitate = new Set<string>();
  const coboara = (parinte: string | null, nivel: number) => {
    /* `vizitate`: un arbore cu bucla ar fi invartit randarea la nesfarsit. */
    for (const c of copii.get(parinte) ?? []) {
      if (vizitate.has(c.id)) continue;
      vizitate.add(c.id);
      categoriiAplatizate.push({ id: c.id, name: c.name, nivel });
      coboara(c.id, nivel + 1);
    }
  };
  coboara(null, 0);

  const feeduri = parseFeeduri(settings?.facebook_feeds);

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="facebook-catalog" description="Trimite produsele in Facebook si Instagram pentru reclame dinamice si Shops." />
      <FacebookCatalogClient
        feedUrl={`${base}/facebook-catalog.xml`}
        hasCustomDomain={!!biz.custom_domain}
        productCount={count ?? 0}
        pixelConfigured={pixelConfigured}
      />
      <div className="mt-6">
        <FacebookFeeduriClient
          bazaFeed={`${base}/facebook-catalog.xml`}
          feeduriInitiale={feeduri}
          categorii={categoriiAplatizate}
          totalProduse={count ?? 0}
        />
      </div>
    </div>
  );
}
