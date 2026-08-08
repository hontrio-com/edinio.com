"use server";

import { revalidatePath } from "next/cache";
import { proiecteazaImediat } from "@/lib/storefront/catalog/proiector";
import { hasVariants } from "@/lib/storefront/variants";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getProductLimit, numaraProduseleContului } from "@/lib/plan-limits";
import { deleteOrphanImages } from "@/lib/r2-cleanup";
import { logError } from "@/lib/error-logger";
import { resolveUniqueProductSlug } from "@/lib/slug";
import { computeBundlePricing, type BundleConfig, type BundleComponent, type BundlePricingMode } from "@/lib/bundles";
import { enqueueGmcSync } from "@/lib/google-merchant/queue";
import { enqueueOlxSync } from "@/lib/olx/queue";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface BundleFormData {
  name: string;
  slug?: string | null;
  description?: string;
  images: string[];
  category?: string;
  is_active: boolean;
  is_featured: boolean;
  seo?: { title: string; description: string };
  items: { product_id: string; quantity: number }[];
  pricing_mode: BundlePricingMode;
  fixed_price?: number;
  discount_percent?: number;
  discount_amount?: number;
}

async function ownsBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", userId).single();
  return !!data;
}

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && images.length ? (images[0] as string) : null;
}

// Resolve chosen items to real component data (authoritative prices/stock),
// preserving order + quantities and dropping missing/nested-bundle products.
async function resolveComponents(
  supabase: ServerClient, businessId: string, items: { product_id: string; quantity: number }[],
): Promise<BundleComponent[]> {
  const ids = [...new Set(items.map((i) => i.product_id))];
  if (ids.length === 0) return [];
  const { data: rows } = await supabase
    .from("products")
    .select("id, name, price, images, is_bundle, is_active, track_inventory, stock_quantity")
    .eq("business_id", businessId)
    .in("id", ids);
  const map = new Map((rows ?? []).map((r) => [r.id, r]));
  const out: BundleComponent[] = [];
  for (const it of items) {
    const p = map.get(it.product_id);
    const cantitate = Math.max(1, Math.floor(Number(it.quantity) || 1));
    // Randul care nu se mai rezolva NU se sare in tacere: pana acum pachetul cu
    // componente sterse se deschidea in formular cu zero produse si refuza sa se
    // salveze („cel putin 2 produse"), fara sa spuna ca trei au disparut — deci
    // comerciantul nu-l putea nici repara, nici intelege.
    if (!p || p.is_bundle) {
      out.push({
        product_id: it.product_id,
        quantity: cantitate,
        name: "Produs sters",
        price: 0,
        image_url: null,
        track_inventory: false,
        stock_quantity: null,
        vandabila: false,
        existaInCatalog: false,
      });
      continue;
    }
    // Produsul DEZACTIVAT nu e sters: isi pastreaza numele si pretul, dar nu e
    // vandabil. Confundate, formularul i-ar spune comerciantului „nu mai exista
    // in catalog" despre un produs pe care tocmai el l-a ascuns temporar — si
    // i-ar bloca orice salvare pana cand il scoate din pachet, adica pana cand il
    // pierde definitiv. La bricosmart, trei componente stau fiecare in cate trei
    // pachete: o singura dezactivare ar intepa noua formulare.
    out.push({
      product_id: p.id,
      quantity: cantitate,
      name: p.name,
      price: Number(p.price) || 0,
      image_url: firstImage(p.images),
      track_inventory: p.track_inventory,
      stock_quantity: p.stock_quantity,
      vandabila: p.is_active,
      existaInCatalog: true,
    });
  }
  return out;
}

// Products that can go into a bundle (everything except other bundles).
export async function getBundleEligibleProducts(businessId: string, includeIds: string[] = []): Promise<{
  id: string; name: string; price: number; image_url: string | null;
  track_inventory: boolean; stock_quantity: number | null; is_active: boolean;
}[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  if (!(await ownsBusiness(supabase, businessId, user.id))) return [];

  // PostgREST taie SILENTIOS la 1000 de randuri: pe un magazin cu mai multe
  // produse, cele de dupa nu apareau in selector si comerciantul nu putea pune
  // in oferta chiar produsele lui noi.
  const data = await fetchAllRows("produse pentru oferte", (from, to) =>
    supabase
      .from("products")
      .select("id, name, price, images, is_active, track_inventory, stock_quantity, page_sections")
      .eq("business_id", businessId)
      .eq("is_bundle", false)
      .order("name")
      .range(from, to),
  );

  /*
   * Produsele cu VARIANTE nu pot fi componente.
   *
   * `BundleItem` n-are camp de varianta, `resolveComponents` ia pretul de BAZA, iar
   * `expandBundleStock` scade din stocul PRODUSULUI, nu al combinatiei — deci un
   * pachet cu o componenta variabila s-ar vinde sub pret, s-ar expedia fara marime
   * si ar lasa stocul pe combinatii neatins. Ofertele au inchis exact gaura asta;
   * pachetele n-o aveau inchisa. Se blocheaza selectia pana cand `BundleItem`
   * capata o varianta — azi niciun pachet nu are asa ceva, deci nu se pierde nimic.
   *
   * Si produsele INACTIVE ies din selector: nu se poate cumpara prin pachet ce nu
   * se poate cumpara direct.
   */
  // Componentele DEJA din pachet raman in lista chiar daca nu mai sunt eligibile
  // (dezactivate sau ajunse variabile intre timp): altfel formularul le-ar arata
  // drept „sterse" si ar refuza orice salvare pana cand comerciantul le scoate,
  // adica pana cand le pierde. Filtrul se aplica doar la ce se poate ADAUGA.
  const pastrate = new Set(includeIds);
  return (data ?? [])
    .filter((p) => pastrate.has(p.id) || (p.is_active && !hasVariants(p.page_sections)))
    .map((p) => ({
      id: p.id, name: p.name, price: Number(p.price) || 0, image_url: firstImage(p.images),
      track_inventory: p.track_inventory, stock_quantity: p.stock_quantity, is_active: p.is_active,
    }));
}

/**
 * Componentele care nu se mai pot vinde OPRESC salvarea.
 *
 * `resolveComponents` intoarce de acum si randurile nerezolvate, ca formularul sa
 * le poata arata si sa le poata scoate comerciantul — dar ele n-au voie sa ajunga
 * la pretuire. Un substitut are pretul 0, deci un pachet cu toate componentele
 * sterse ar iesi din `computeBundlePricing` cu `compareAt = 0` si `price = 0` si
 * s-ar scrie ca produs ACTIV la 0,00 lei. Verificarea din browser nu e de ajuns:
 * amandoua actiunile sunt exporturi „use server".
 */
function componenteNevandabile(components: BundleComponent[]): string | null {
  // Doar cele STERSE. Una dezactivata isi pastreaza pretul, deci pachetul se
  // pretuieste corect si doar nu se poate vinde — asta o spune
  // `disponibilitatePachet`, nu o interdictie de salvare. Blocata si ea, o
  // ascundere temporara de produs ar bloca orice modificare a pachetelor care il
  // contin, inclusiv stingerea lor.
  const rele = components.filter((c) => !c.existaInCatalog).length;
  if (rele === 0) return null;
  return rele === 1
    ? "Un produs din pachet nu mai exista in catalog. Scoate-l din pachet inainte de a salva."
    : `${rele} produse din pachet nu mai exista in catalog. Scoate-le inainte de a salva.`;
}

function buildBundleWrite(data: BundleFormData, components: BundleComponent[]) {
  const { price, compareAt } = computeBundlePricing(components, data.pricing_mode, {
    fixedPrice: data.fixed_price,
    discountPercent: data.discount_percent,
    discountAmount: data.discount_amount,
  });
  const bundle: BundleConfig = {
    items: components.map((c) => ({ product_id: c.product_id, quantity: c.quantity })),
    pricing_mode: data.pricing_mode,
    ...(data.pricing_mode === "discount_percent" ? { discount_percent: Number(data.discount_percent) || 0 } : {}),
    ...(data.pricing_mode === "discount_amount" ? { discount_amount: Number(data.discount_amount) || 0 } : {}),
  };
  const page_sections: Record<string, unknown> = { bundle };
  if (data.seo && (data.seo.title || data.seo.description)) page_sections.seo = data.seo;
  return { price, compareAt, page_sections };
}

export async function createBundle(
  businessId: string, data: BundleFormData,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  if (!data.name.trim()) return { error: "Pachetul are nevoie de un nume." };
  const components = await resolveComponents(supabase, businessId, data.items);
  const eroareComponente = componenteNevandabile(components);
  if (eroareComponente) return { error: eroareComponente };
  if (components.length < 2) return { error: "Un pachet trebuie sa contina cel putin 2 produse." };

  const { data: profile } = await supabase.from("users_profile").select("plan").eq("id", user.id).single();
  const limit = getProductLimit(profile?.plan ?? "free");
  // Pe CONT, nu pe magazin: planul e per cont. Vezi plan-limits.ts.
  const count = await numaraProduseleContului(supabase, user.id);
  if (limit !== Infinity && count >= limit) {
    return { error: `Ai atins limita de ${limit} produse pentru planul tau. Upgradeaza planul.` };
  }

  const slug = await resolveUniqueProductSlug(supabase, businessId, data.slug);
  const { price, compareAt, page_sections } = buildBundleWrite(data, components);

  const { data: created, error } = await supabase.from("products").insert({
    business_id: businessId,
    name: data.name.trim(),
    slug,
    description: data.description?.trim() || null,
    price,
    compare_at_price: compareAt > price ? compareAt : null,
    category: data.category?.trim() || null,
    images: data.images,
    is_bundle: true,
    track_inventory: false,
    stock_quantity: null,
    is_featured: data.is_featured,
    is_active: data.is_active,
    page_sections: page_sections as never,
  }).select("id").single();

  if (error) {
    logError({ action: "createBundle", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea pachetului. Incearca din nou." };
  }
  if (created?.id) void enqueueGmcSync(businessId, created.id, created.id, "upsert");
  if (created?.id) void enqueueOlxSync(businessId, created.id, created.id, "upsert");
  // Sincron, inaintea revalidarii: un pachet salvat trebuie sa-si arate pretul
  // si disponibilitatea noua imediat, nu peste un minut.
  await proiecteazaImediat(businessId);
  revalidatePath("/dashboard/products/bundles");
  return { success: true };
}

export async function updateBundle(
  bundleId: string, businessId: string, data: BundleFormData,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  if (!data.name.trim()) return { error: "Pachetul are nevoie de un nume." };
  const components = await resolveComponents(supabase, businessId, data.items);
  const eroareComponente = componenteNevandabile(components);
  if (eroareComponente) return { error: eroareComponente };
  if (components.length < 2) return { error: "Un pachet trebuie sa contina cel putin 2 produse." };

  const { data: oldRow } = await supabase
    .from("products").select("images").eq("id", bundleId).eq("business_id", businessId).eq("is_bundle", true).single();
  if (!oldRow) return { error: "Pachet negasit" };

  const slug = await resolveUniqueProductSlug(supabase, businessId, data.slug, bundleId);
  const { price, compareAt, page_sections } = buildBundleWrite(data, components);

  const { error } = await supabase.from("products").update({
    name: data.name.trim(),
    slug,
    description: data.description?.trim() || null,
    price,
    compare_at_price: compareAt > price ? compareAt : null,
    category: data.category?.trim() || null,
    images: data.images,
    track_inventory: false,
    stock_quantity: null,
    is_featured: data.is_featured,
    is_active: data.is_active,
    page_sections: page_sections as never,
    updated_at: new Date().toISOString(),
  }).eq("id", bundleId).eq("business_id", businessId).eq("is_bundle", true);

  if (error) {
    logError({ action: "updateBundle", message: error.message, details: { code: error.code, bundleId, businessId }, userId: user.id });
    return { error: "Eroare la salvarea pachetului. Incearca din nou." };
  }

  // Clean up removed images from R2 — but only those no other product still
  // references (duplicated products share the same image URLs).
  if (Array.isArray(oldRow.images)) {
    const keep = new Set(data.images);
    const removed = (oldRow.images as string[]).filter((url) => !keep.has(url));
    void deleteOrphanImages(supabase, businessId, removed, { excludeProductId: bundleId });
  }

  void enqueueGmcSync(businessId, bundleId, bundleId, "upsert");
  void enqueueOlxSync(businessId, bundleId, bundleId, "upsert");
  // Sincron, inaintea revalidarii: un pachet salvat trebuie sa-si arate pretul
  // si disponibilitatea noua imediat, nu peste un minut.
  await proiecteazaImediat(businessId);
  revalidatePath("/dashboard/products/bundles");
  revalidatePath(`/dashboard/products/bundles/${bundleId}/edit`);
  return { success: true };
}
