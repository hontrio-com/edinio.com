import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ProductForm } from "@/components/dashboard/ProductForm";
import { parseShippingClasses } from "@/lib/shipping/rules";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

interface Props {
  params: Promise<{ productId: string }>;
  /** Filtrele listei din care a venit omul. Vezi `intoarcereLaLista`. */
  searchParams: Promise<{ page?: string; search?: string; cat?: string; stare?: string; stoc?: string }>;
}

/**
 * Adresa listei din care a venit, refacuta intreaga.
 *
 * ⚠ SE PASTRA NUMAI PAGINA. Cine cautase ceva se intorcea dupa „Salveaza" intr-o lista
 * NEFILTRATA, la aceeasi pagina dar cu alte produse — iar daca lista lui filtrata avea o singura
 * pagina, se intorcea chiar la inceputul catalogului.
 *
 * ⚠ Se citesc numai cheile pe care le stie lista. Orice altceva din adresa nu se duce mai departe:
 * ce nu intelegem n-avem ce cara.
 */
function intoarcereLaLista(sp: { page?: string; search?: string; cat?: string; stare?: string; stoc?: string }): string {
  const p = new URLSearchParams();
  if (sp.search?.trim()) p.set("search", sp.search.trim().slice(0, 100));
  if (sp.cat?.trim()) p.set("cat", sp.cat.trim().slice(0, 200));
  if (sp.stare === "active" || sp.stare === "inactive") p.set("stare", sp.stare);
  if (sp.stoc === "in" || sp.stoc === "out") p.set("stoc", sp.stoc);
  const pagina = Number(sp.page);
  if (Number.isFinite(pagina) && pagina > 1) p.set("page", String(Math.floor(pagina)));
  const qs = p.toString();
  return qs ? `/dashboard/products?${qs}` : "/dashboard/products";
}

export default async function EditProductPage({ params, searchParams }: Props) {
  const { productId } = await params;
  const backHref = intoarcereLaLista(await searchParams);
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, is_published, store_settings(olx_config, trendyol_config, emag_config, google_merchant_config, shipping_classes)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  const settings = Array.isArray(business.store_settings) ? business.store_settings[0] : business.store_settings;
  const olxConnected = !!(settings?.olx_config as { connected?: boolean } | null)?.connected;
  const trendyolConnected = !!(settings?.trendyol_config as { connected?: boolean } | null)?.connected;
  /* ⚠ Numai `connected`. Restul lui `emag_config` are acreditari, iar citit cu clientul
     comerciantului ele vin criptate — vezi regula casei despre `createAdminClient`. */
  const emagConnected = !!(settings?.emag_config as { connected?: boolean } | null)?.connected;
  const gmcConfig = settings?.google_merchant_config as { connected?: boolean; account_id?: string } | null;
  const gmcConnected = !!gmcConfig?.connected && !!gmcConfig?.account_id;
  const shippingClasses = parseShippingClasses(settings?.shipping_classes);

  // Categories windowed past the 1000-row PostgREST cap (big imported taxonomies).
  const [{ data: product }, categories] = await Promise.all([
    // `is_bundle: false`: formularul obisnuit reconstruieste `page_sections` de la
    // zero si nu cunoaste cheia `bundle`, iar `updateProduct` scrie inlocuire. O
    // SINGURA salvare lasa `is_bundle = true` cu configul sters — pachetul
    // continua sa se vanda la pretul lui inghetat, iar `expandBundleStock` cade pe
    // ramura de produs simplu si scade stocul RANDULUI DE PACHET in loc de
    // componente. Pachetele isi au formularul lor, la /dashboard/products/bundles.
    supabase.from("products").select("*").eq("id", productId).eq("business_id", business.id).eq("is_bundle", false).single(),
    fetchAllRows("dashboard.product-edit.categories", (from, to) =>
      supabase.from("categories").select("id, name, parent_id").eq("business_id", business.id)
        .order("sort_order").order("name").order("id").range(from, to)
    ),
  ]);

  if (!product) notFound();

  /*
   * ═══ ⚠ „DEJA PE eMAG" SE CITESTE CA IN `rutaDeTrimitere`, NU ALTFEL ═══
   *
   * Doua feluri de a fi acolo, si amandoua conteaza:
   *   `last_synced_at` ne-nul       l-am trimis NOI si ei l-au primit
   *   `creat_de_edinio = false`     era la ei inainte sa stim de el, si l-a legat importul
   *
   * Citita doar dupa primul, oferta preluata din contul lui ar fi aratat „nepublicat",
   * iar butonul l-ar fi imbiat sa retrimita un produs care se vinde deja acolo.
   */
  let emagPublicat = false;
  if (emagConnected) {
    const { data: oferte } = await supabase
      .from("emag_offers")
      .select("last_synced_at, creat_de_edinio")
      .eq("business_id", business.id).eq("product_id", productId).limit(20);
    emagPublicat = (oferte ?? []).some(
      (o) => o.last_synced_at != null || o.creat_de_edinio === false,
    );
  }

  return (
    <ProductForm
      businessId={business.id}
      product={product}
      categories={categories}
      backHref={backHref}
      business={business.slug ? { slug: business.slug, is_published: !!business.is_published } : undefined}
      olxConnected={olxConnected}
      trendyolConnected={trendyolConnected}
      emagConnected={emagConnected}
      emagPublicat={emagPublicat}
      gmcConnected={gmcConnected}
      shippingClasses={shippingClasses}
    />
  );
}
