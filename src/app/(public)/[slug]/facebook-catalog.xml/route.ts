import { disponibilitatePachet, readBundleConfig } from "@/lib/bundles";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { buildCatalogItems, serializeCatalogFeed, type CatalogBusiness, type CatalogProduct } from "@/lib/facebook/catalog-feed";
import { numeCuDescendenti, parseFeeduri, produseDinFeed, type RegulaFeed } from "@/lib/facebook/feeduri";
import type { StoreCategoryNode } from "@/lib/storefront/store-content.types";
import { logError } from "@/lib/error-logger";

export const dynamic = "force-dynamic";

// Meta (Facebook) Catalog product feed, per store, at {storeBaseUrl}/facebook-catalog.xml.
// One route serves both domain types: a custom domain reaches it because proxy.ts
// rewrites customdomain.ro/facebook-catalog.xml -> /{slug}/facebook-catalog.xml
// (it is NOT special-cased like /sitemap.xml); an edinio.com/{slug} store is served
// directly. The feed links use the store's canonical base (storeBaseUrl).
/**
 * O citire care esueaza da 503, nu un raspuns valid si gol.
 *
 * Un sitemap gol cu cod 200 ii spune lui Google „am hotarat sa nu mai am nicio
 * adresa" — exact ce a crezut doua saptamani in august, cand un embed rupt
 * intorcea zero produse fara sa dea eroare. 503 inseamna „mai incearca".
 * `no-store`, ca o sclipire de o secunda sa nu stea in cache o ora pe CDN.
 */
async function indisponibil(cine: string, e: unknown): Promise<Response> {
  // `await`, nu fire-and-forget: raspunsul pleaca imediat dupa, iar in serverless
  // functia poate fi inghetata inainte ca inserarea sa ajunga in baza.
  await logError({
    action: cine,
    message: e instanceof Error ? e.message : "citirea a esuat",
    severity: "critical",
  });
  return new Response("temporar indisponibil", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    return await construieste(req, ctx);
  } catch (e) {
    return await indisponibil("fbCatalog", e);
  }
}

async function construieste(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const admin = createAdminClient();
  /* ⚠ Fara `?feed=`, raspunsul ramane EXACT cel de pana acum: tot catalogul.
     Adresa veche e deja lipita in conturile Meta ale comerciantilor. */
  const cheieFeed = new URL(req.url).searchParams.get("feed")?.trim().toLowerCase() || "";

  const { data: biz } = await admin
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name, is_published")
    .eq("slug", slug)
    .maybeSingle();
  if (!biz || !biz.is_published) return new Response("Not found", { status: 404 });

  const business: CatalogBusiness = {
    slug: biz.slug,
    custom_domain: biz.custom_domain,
    store_name: biz.store_name,
    business_name: biz.business_name,
  };

  /*
   * Feedurile segmentate stau in `store_settings`, ca restul configurarilor.
   * Se citesc doar cand chiar se cere unul: pentru feedul intreg n-are rost inca
   * o interogare la fiecare citire a lui Meta.
   */
  let regula: RegulaFeed | null = null;
  let numeCategorii = new Set<string>();
  if (cheieFeed) {
    const [{ data: setari }, { data: categorii }] = await Promise.all([
      admin.from("store_settings").select("facebook_feeds").eq("business_id", biz.id).maybeSingle(),
      admin.from("categories").select("id, name, parent_id").eq("business_id", biz.id),
    ]);
    regula = parseFeeduri(setari?.facebook_feeds).find((f) => f.cheie === cheieFeed) ?? null;
    /*
     * ⚠ 404, nu „tot catalogul".
     *
     * Un feed sters sau scris gresit care ar raspunde cu TOATE produsele ar
     * umple in tacere un catalog care trebuia sa aiba treizeci de articole — si
     * comerciantul ar afla din reclame. 404 il face pe Meta sa pastreze ce are
     * si sa raporteze eroare la sursa de date.
     */
    if (!regula) return new Response("Feed inexistent", { status: 404 });
    numeCategorii = numeCuDescendenti(
      (categorii ?? []) as unknown as StoreCategoryNode[],
      regula.categorii ?? [],
    );
  }

  const products = await fetchAllRowsStrict("fbCatalog.products", (from, to) =>
    admin
      .from("products")
      .select("id, name, slug, description, price, compare_at_price, images, category, is_bundle, track_inventory, stock_quantity, page_sections")
      .eq("business_id", biz.id)
      .eq("is_active", true)
      .order("id")
      .range(from, to),
  );

  /*
   * Disponibilitatea pachetelor, din componentele lor.
   *
   * Feedul e o ruta publica permanenta, deci pana acum toate pachetele
   * magazinului plecau spre Meta ca „in stock" — si dupa ce pagina lor a inceput
   * sa spuna „Stoc epuizat", divergenta asta e chiar tiparul din care ies
   * suspendarile de catalog. Componentele sunt tot in lista incarcata mai sus:
   * nicio interogare in plus.
   */
  const dupaId = new Map(products.map((p) => [p.id, p]));

  /*
   * ⚠ Disponibilitatea pachetului se calculeaza INAINTE de filtrare, si din
   * lista INTREAGA: componentele unui pachet pot fi in alta categorie decat el,
   * deci filtrand intai, `dupaId` n-ar mai contine componentele si orice pachet
   * ar iesi indisponibil.
   */
  const disponibil = (p: (typeof products)[number]) => p.is_bundle
    ? disponibilitatePachet((readBundleConfig(p.page_sections)?.items ?? []).map((it) => {
        const c = dupaId.get(it.product_id);
        return {
          quantity: it.quantity,
          vandabila: !!c,
          track_inventory: !!c?.track_inventory,
          stock_quantity: c?.stock_quantity ?? null,
        };
      })).inStock
    : undefined;

  const alese = regula
    ? produseDinFeed(
        regula,
        products.map((p) => ({ ...p, pachetDisponibil: disponibil(p) })),
        numeCategorii,
      )
    : products.map((p) => ({ ...p, pachetDisponibil: disponibil(p) }));

  const items = alese.flatMap((p) => buildCatalogItems(business, p as unknown as CatalogProduct));
  const xml = serializeCatalogFeed(business, items);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      /*
       * ⚠ Feedul SEGMENTAT se pastreaza un minut, nu o ora.
       *
       * Masurat pe productie chiar la livrare: dupa ce am sters un feed de proba,
       * adresa lui a continuat sa raspunda 200 cu vechile 980 de articole — cu
       * un parametru anti-cache iesea corect 404. Deci comerciantul care schimba
       * regulile si deschide adresa ca sa verifice ar vedea O ORA continutul
       * vechi si ar crede ca n-a mers. Exact felul de „arata ca merge si nu
       * merge" pe care integrarea asta il produce cel mai usor.
       *
       * Feedul intreg ramane la o ora: adresa lui nu se schimba niciodata, e cea
       * pe care o citeste Meta, si nu are ce sa induca in eroare. Iar un minut nu
       * costa nimic nici la cel segmentat: Meta citeste programat, nu continuu.
       */
      "Cache-Control": cheieFeed
        ? "public, max-age=60, s-maxage=60"
        : "public, max-age=3600, s-maxage=3600",
    },
  });
}
