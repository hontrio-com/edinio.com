import "server-only";
import { disponibilitatePachet, readBundleConfig } from "@/lib/bundles";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { fereastraDeLivrare, parseTimpDeLivrare } from "@/lib/shipping/delivery-time";
import { pragTransportGratuit } from "@/lib/storefront/prag-transport-gratuit";
import { permalinkuriDin } from "@/lib/storefront/permalinkuri";
import { setarileDin } from "@/lib/storefront/antet-magazin";
import { FARA_PRODUSE_DEMO } from "@/lib/teme/produse-demo";
import { caiDeCategorii, type MagazinCompari, type ProdusCompari } from "./feed";

/**
 * Ce citeste feedul Compari din baza: magazinul cu setarile lui, produsele si categoriile.
 *
 * ⚠ UN SINGUR LOC, pentru ruta feedului SI pentru panou. Panoul spune comerciantului cate produse pleaca si ce
 * termen si cost de livrare anunta feedul; citite a doua oara, cu alt filtru sau alta regula de TVA, numerele de pe
 * ecran ar fi vorbit despre alt feed decat cel descarcat de Compari.
 *
 * ⚠ Toate citirile ARUNCA la eroare. Ruta raspunde atunci 503 (nu un feed gol), iar panoul spune ca nu a putut
 * verifica (nu „zero produse afara”).
 *
 * ⚠ Se citeste cu cheia de serviciu, deci filtrul pe magazin e SINGURA granita dintre magazine: apelantul din
 * panou isi verifica intai omul.
 */

type Admin = ReturnType<typeof createAdminClient>;

type SetariFeed = {
  permalinks?: unknown;
  delivery_time?: unknown;
  delivery_estimate?: unknown;
  vat_enabled?: boolean | null;
  vat_rate?: number | string | null;
  prices_include_vat?: boolean | null;
  shipping_enabled?: boolean | null;
  default_shipping_cost?: number | string | null;
  free_shipping_threshold?: number | string | null;
};

export interface MagazinCitit {
  id: string;
  publicat: boolean;
  magazin: MagazinCompari;
}

/* ⚠ Din `page_content` se cer DOAR cele trei chei folosite, prin cale JSON: restul lui e designul si textele
   magazinului, de zeci de KB, care n-au ce cauta intr-o citire de feed. */
const COLOANE_MAGAZIN =
  "id, slug, custom_domain, store_name, business_name, is_published, "
  + "store_settings(permalinks:page_content->permalinks, delivery_time:page_content->delivery_time, "
  + "delivery_estimate:page_content->delivery_estimate, vat_enabled, vat_rate, prices_include_vat, "
  + "shipping_enabled, default_shipping_cost, free_shipping_threshold)";

/** Magazinul si setarile din care isi ia feedul cifrele, sau `null` cand magazinul nu exista. */
export async function magazinulPentruCompari(
  admin: Admin,
  cine: { slug: string } | { id: string },
): Promise<MagazinCitit | null> {
  const cerere = admin.from("businesses").select(COLOANE_MAGAZIN);
  const { data, error } = await ("slug" in cine ? cerere.eq("slug", cine.slug) : cerere.eq("id", cine.id)).maybeSingle();
  /* ⚠ O citire cazuta NU e „magazinul nu exista”: un 404 l-ar face pe Compari sa creada ca feedul a disparut. */
  if (error) throw new Error(`magazinul nu s-a putut citi: ${error.message}`);
  const rand = data as unknown as {
    id: string; slug: string; custom_domain: string | null; store_name: string | null;
    business_name: string; is_published: boolean | null;
  } | null;
  if (!rand) return null;

  const setari = setarileDin<SetariFeed>(data as never) ?? {};
  const timp = parseTimpDeLivrare({ delivery_time: setari.delivery_time, delivery_estimate: setari.delivery_estimate });
  const costBrut = setari.default_shipping_cost;
  const cost = costBrut === null || costBrut === undefined || costBrut === "" ? null : Number(costBrut);

  return {
    id: rand.id,
    publicat: rand.is_published === true,
    magazin: {
      slug: rand.slug,
      custom_domain: rand.custom_domain,
      store_name: rand.store_name,
      business_name: rand.business_name,
      prefix_produs: permalinkuriDin({ permalinks: setari.permalinks }).produs,
      tva: {
        vat_enabled: setari.vat_enabled === true,
        vat_rate: Number(setari.vat_rate) || 0,
        /* Lipsa = preturi cu TVA, ca peste tot in platforma (`order.actions.ts`). */
        prices_include_vat: setari.prices_include_vat !== false,
      },
      zileLivrare: timp ? fereastraDeLivrare(timp).max : null,
      transport: {
        /* Lipsa = livreaza: `shipping_enabled` e stins anume doar la magazinele fara livrare. */
        activ: setari.shipping_enabled !== false,
        cost: cost !== null && Number.isFinite(cost) ? cost : null,
        pragGratuit: pragTransportGratuit(setari.free_shipping_threshold),
      },
    },
  };
}

/**
 * Produsele active ale magazinului, cu disponibilitatea pachetelor socotita din componentele lor.
 *
 * ⚠ Un pachet se scrie cu `track_inventory: false`, deci fara verdictul de aici ar pleca mereu „in stoc”, si
 * dupa ce i s-a terminat o componenta (ca in catalogul Meta). Componentele sunt tot in lista citita.
 */
export async function produselePentruCompari(admin: Admin, businessId: string): Promise<ProdusCompari[]> {
  const produse = await fetchAllRowsStrict("feedCompari.products", (from, to) =>
    admin
      .from("products")
      .select("id, name, slug, sku, description, price, images, category, is_bundle, track_inventory, stock_quantity, page_sections")
      .eq("business_id", businessId)
      .eq("is_active", true)
      // Produsele demo ale temei nu pleaca din magazin.
      .or(FARA_PRODUSE_DEMO)
      .order("id")
      .range(from, to),
  );
  const dupaId = new Map(produse.map((p) => [p.id, p]));
  return produse.map((p) => ({
    ...(p as unknown as ProdusCompari),
    pachetDisponibil: p.is_bundle
      ? disponibilitatePachet((readBundleConfig(p.page_sections)?.items ?? []).map((it) => {
          const c = dupaId.get(it.product_id);
          return {
            quantity: it.quantity,
            vandabila: !!c,
            track_inventory: !!c?.track_inventory,
            stock_quantity: c?.stock_quantity ?? null,
          };
        })).inStock
      : undefined,
  }));
}

/** Numele categoriei de pe produs -> calea ei intreaga din arborele magazinului. */
export async function caileCategoriilorPentruCompari(admin: Admin, businessId: string): Promise<(nume: string) => string> {
  const categorii = await fetchAllRowsStrict("feedCompari.categories", (from, to) =>
    admin
      .from("categories")
      .select("id, name, parent_id")
      .eq("business_id", businessId)
      .order("sort_order")
      .order("id")
      .range(from, to),
  );
  const cai = caiDeCategorii(categorii as { id: string; name: string | null; parent_id: string | null }[]);
  return (nume) => cai.get(nume) ?? nume;
}
