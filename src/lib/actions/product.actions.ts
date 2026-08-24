"use server";

import { revalidatePath } from "next/cache";
import { proiecteazaImediat } from "@/lib/storefront/catalog/proiector";
import { maybeSyncMailchimpProduct, maybeSyncMailchimpProductsBulk } from "@/lib/mailchimp-sync";
import { maybeSyncBrevoProduct, maybeSyncBrevoProductsBulk } from "@/lib/brevo-sync";
import { maybeSyncKlaviyoProduct, maybeSyncKlaviyoProductsBulk } from "@/lib/klaviyo-sync";
import { createClient } from "@/lib/supabase/server";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { getProductLimit, numaraProduseleContului } from "@/lib/plan-limits";
import { deleteOrphanImages } from "@/lib/r2-cleanup";
import { logError } from "@/lib/error-logger";
import { resolveUniqueProductSlug } from "@/lib/slug";
import { readBundleConfig } from "@/lib/bundles";
import { construiesteTrepte, mesajProblemaTrepte, problemaMonotonie } from "@/lib/storefront/quantity-tiers";
import { enqueueGmcSync, enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { enqueueOlxSync, enqueueOlxSyncMany } from "@/lib/olx/queue";
import { enqueueAboutYouSync, enqueueAboutYouSyncMany } from "@/lib/aboutyou/queue";
import { enqueueTrendyolSync, enqueueTrendyolSyncMany } from "@/lib/trendyol/queue";
import {
  enqueueEmagPretMany, enqueueEmagRetragereInainteDeStergere,
  enqueueEmagSync, enqueueEmagSyncMany,
} from "@/lib/emag/queue";

interface ProductData {
  name: string;
  slug?: string | null;
  description?: string;
  price: number;
  compare_at_price?: number | null;
  category?: string;
  shipping_class?: string | null;
  sku?: string;
  images: string[];
  track_inventory: boolean;
  stock_quantity?: number | null;
  is_featured: boolean;
  is_active: boolean;
  weight_grams?: number | null;
  page_sections?: {
    specifications?: { label: string; value: string }[];
    quantity_tiers?: { enabled: boolean; tier2_price: number; tier2_badge: string; tier3_price: number; tier3_badge: string };
    stock_status?: string;
    low_stock_threshold?: number | null;
    dimensions?: { length: number; width: number; height: number };
    seo?: { title: string; description: string };
    variants?: {
      enabled: boolean;
      options: { id: string; name: string; values: string[] }[];
      combinations: { id: string; title: string; price: string; sku: string; enabled: boolean }[];
    };
    customization?: {
      enabled: boolean;
      fields: {
        id: string;
        type: string;
        label: string;
        placeholder?: string;
        required: boolean;
        max_length?: number;
        max_files?: number;
        max_file_size_mb?: number;
        options?: string[];
        default_color?: string;
        helper_text?: string;
      }[];
    };
    google?: {
      gtin?: string; brand?: string; mpn?: string; google_product_category?: string;
      condition?: string; gender?: string; age_group?: string;
      color?: string; size?: string; material?: string;
      custom_label_0?: string; custom_label_1?: string; custom_label_2?: string; custom_label_3?: string; custom_label_4?: string;
    };
  };
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Garanteaza slug unic per magazin: daca "tricou" e luat, returneaza "tricou-2", "tricou-3", etc.
// excludeProductId: la editare, ignora produsul curent (ca sa nu se auto-incrementeze inutil).
async function resolveUniqueSlug(
  supabase: ServerClient,
  businessId: string,
  rawSlug: string | null | undefined,
  excludeProductId?: string,
): Promise<string | null> {
  return resolveUniqueProductSlug(supabase, businessId, rawSlug, excludeProductId);
}

// Mesaj prietenos cand o coliziune de slug scapa de dedup (ex. race intre 2 salvari).
function isSlugConflict(error: { code?: string | null; message: string }) {
  return error.code === "23505" && error.message.includes("slug");
}

/**
 * Un pachet nu are voie sa coste mai putin decat o cantitate mai mica.
 *
 * Verificarea sta pe SERVER, nu doar in formular: `createProduct` si
 * `updateProduct` scriu `page_sections` cu `as never`, deci nici tipurile nu
 * apara, iar orice cale care ocoleste formularul — import, un tab vechi, un
 * viitor API — intra direct in baza.
 *
 * Se verifica pe pretul de BAZA si, la produsele variabile, pe fiecare pret de
 * combinatie: in modul suma fixa cazul cel mai defavorabil e varianta cea mai
 * scumpa, fiindca un pachet fix e cu atat mai probabil sub o bucata cu cat
 * bucata e mai scumpa.
 */
function problemaTrepteProdus(data: ProductData): string | null {
  const ps = (data.page_sections ?? null) as { quantity_tiers?: unknown; variants?: { enabled?: boolean; combinations?: Array<{ enabled?: boolean; price?: unknown }> } } | null;
  const cfg = ps?.quantity_tiers;
  if (!cfg) return null;

  const preturi = new Set<number>();
  const baza = Number(data.price);
  if (Number.isFinite(baza) && baza > 0) preturi.add(baza);
  if (ps?.variants?.enabled && Array.isArray(ps.variants.combinations)) {
    for (const c of ps.variants.combinations) {
      const n = Number(c?.price);
      if (c?.enabled && Number.isFinite(n) && n > 0) preturi.add(n);
    }
  }

  for (const unit of preturi) {
    const problema = problemaMonotonie(construiesteTrepte(cfg, unit));
    if (problema) return mesajProblemaTrepte(problema);
  }
  return null;
}

export async function createProduct(businessId: string, data: ProductData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const problemaTrepte = problemaTrepteProdus(data);
  if (problemaTrepte) return { error: problemaTrepte };

  // Check plan product limit
  const { data: profile } = await supabase
    .from("users_profile")
    .select("plan")
    .eq("id", user.id)
    .single();

  const plan = profile?.plan ?? "free";
  const limit = getProductLimit(plan);

  // Numaram pe CONT, nu pe magazin: planul e per cont, iar numaratoarea pe
  // magazin insemna ca al doilea magazin dubla limita. Vezi plan-limits.ts.
  const count = await numaraProduseleContului(supabase, user.id);

  if (limit !== Infinity && count >= limit) {
    return { error: `Ai atins limita de ${limit} produse pentru planul tau. Upgradeaza planul pentru mai multe produse.` };
  }

  const slug = await resolveUniqueSlug(supabase, businessId, data.slug);

  const { data: created, error } = await supabase.from("products").insert({
    business_id: businessId,
    name: data.name.trim(),
    slug,
    description: data.description?.trim() || null,
    price: data.price,
    compare_at_price: data.compare_at_price || null,
    category: data.category?.trim() || null,
    shipping_class: data.shipping_class ?? null,
    sku: data.sku?.trim() || null,
    images: data.images,
    track_inventory: data.track_inventory,
    stock_quantity: data.track_inventory ? (data.stock_quantity ?? 0) : null,
    is_featured: data.is_featured,
    is_active: data.is_active,
    weight_grams: data.weight_grams ?? null,
    page_sections: (data.page_sections ?? {}) as never,
  }).select("id").single();

  if (error) {
    logError({ action: "createProduct", message: error.message, details: { code: error.code, hint: error.hint, businessId }, userId: user.id });
    return { error: isSlugConflict(error) ? "Exista deja un produs cu acest link (slug). Alege altul." : "Eroare la salvare. Incearca din nou." };
  }
  if (created?.id) void enqueueGmcSync(businessId, created.id, created.id, "upsert");
  if (created?.id) void enqueueOlxSync(businessId, created.id, created.id, "upsert");
  if (created?.id) void enqueueAboutYouSync(businessId, created.id, created.id, "upsert");
  if (created?.id) void enqueueTrendyolSync(businessId, created.id, created.id, "upsert", true);
  if (created?.id) void enqueueEmagSync(businessId, created.id, created.id, "oferta", true);
  if (created?.id) void maybeSyncMailchimpProduct({ businessId, action: "upsert", product: { id: created.id, name: data.name, price: data.price, slug, image: (data.images?.[0] as string | undefined) ?? null } });
  if (created?.id) void maybeSyncBrevoProduct({ businessId, action: "upsert", product: { id: created.id, name: data.name, price: data.price, slug, image: (data.images?.[0] as string | undefined) ?? null } });
  if (created?.id) void maybeSyncKlaviyoProduct({ businessId, action: "upsert", product: { id: created.id, name: data.name, price: data.price, slug, image: (data.images?.[0] as string | undefined) ?? null } });
  // Proiectia catalogului se face SINCRON, inainte de revalidare: altfel
  // comerciantul salveaza si isi vede magazinul cu datele vechi pana trece
  // cronul. Nu arunca niciodata — randul e deja in coada.
  await proiecteazaImediat(businessId);
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function updateProduct(productId: string, businessId: string, data: ProductData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const problemaTrepte = problemaTrepteProdus(data);
  if (problemaTrepte) return { error: problemaTrepte };

  /*
   * ⚠ SI `is_active`, nu doar imaginile.
   *
   * Din el se afla daca produsul TOCMAI a fost activat — singurul moment in care un
   * produs care n-a fost niciodata pe marketplace trebuie publicat. Vezi mai jos.
   */
  const { data: oldProduct } = await supabase
    .from("products")
    .select("images, is_active")
    .eq("id", productId)
    .eq("business_id", businessId)
    .single();

  const slug = await resolveUniqueSlug(supabase, businessId, data.slug, productId);

  const { data: randeAtinse, error } = await supabase.from("products").update({
    name: data.name.trim(),
    slug,
    description: data.description?.trim() || null,
    price: data.price,
    compare_at_price: data.compare_at_price || null,
    category: data.category?.trim() || null,
    shipping_class: data.shipping_class ?? null,
    sku: data.sku?.trim() || null,
    images: data.images,
    track_inventory: data.track_inventory,
    stock_quantity: data.track_inventory ? (data.stock_quantity ?? 0) : null,
    is_featured: data.is_featured,
    is_active: data.is_active,
    weight_grams: data.weight_grams ?? null,
    page_sections: (data.page_sections ?? {}) as never,
    updated_at: new Date().toISOString(),
  })
    .eq("id", productId).eq("business_id", businessId)
    /*
     * `is_bundle: false` — pe SCRIERE, nu doar pe citire.
     *
     * Formularul obisnuit reconstruieste `page_sections` de la zero si nu cunoaste
     * cheia `bundle`, iar aici se scrie inlocuire: o singura salvare lasa
     * `is_bundle = true` cu configul sters, pachetul continua sa se vanda la
     * pretul lui inghetat, iar `expandBundleStock` scade stocul RANDULUI DE
     * PACHET in loc de componente. Filtrul pus doar pe pagina de editare acopera
     * doar ce se deschide de acolo: functia asta e export dintr-un modul
     * „use server", deci un tab ramas deschis inainte de deploy sau o cerere
     * reluata ajung direct aici.
     */
    .eq("is_bundle", false)
    .select("id");

  if (error) {
    logError({ action: "updateProduct", message: error.message, details: { code: error.code, hint: error.hint, productId, businessId }, userId: user.id });
    return { error: isSlugConflict(error) ? "Exista deja un produs cu acest link (slug). Alege altul." : "Eroare la salvare. Incearca din nou." };
  }
  // Zero randuri inseamna ca tinta e un pachet: altfel salvarea „reuseste" mut.
  if (!randeAtinse || randeAtinse.length === 0) {
    return { error: "Pachetele se editeaza din sectiunea Pachete, nu din formularul de produs." };
  }

  // Clean up removed images from R2 — but only those no other product still
  // references (duplicated products share the same image URLs).
  if (oldProduct?.images && Array.isArray(oldProduct.images)) {
    const newSet = new Set(data.images);
    const removed = (oldProduct.images as string[]).filter((url) => !newSet.has(url));
    void deleteOrphanImages(supabase, businessId, removed, { excludeProductId: productId });
  }

  void enqueueGmcSync(businessId, productId, productId, "upsert");
  void enqueueOlxSync(businessId, productId, productId, "upsert");
  void enqueueAboutYouSync(businessId, productId, productId, "upsert");
  /*
   * ═══ ⚠ ACTIVAREA E NASTEREA, PENTRU MARKETPLACE (24.08.2026) ═══
   *
   * `publicaSiFaraOferta` e steagul care ingaduie publicarea automata, si e restrans
   * dinadins: fara el, orice atingere a unui produs — o marire de pret in masa, o
   * schimbare de categorie — ar fi trimis pe eMAG tot ce a atins.
   *
   * Dar `createProduct` il da, iar `updateProduct` nu — si atunci un produs care intra in
   * magazin INACTIV nu se publica niciodata. Asta se intampla la:
   *
   *   duplicare      — `duplicateProduct` scrie `is_active: false` si nu anunta pe nimeni
   *   import CSV     — produsele pot veni inactive
   *   creare ca ciorna, activata mai tarziu
   *
   * ⚠ Si nu se poate da la creare in schimb: un produs inactiv NU e sarit la trimitere, e
   * publicat cu `status: 0`. Deci am fi creat oferte in catalogul lor pentru ciorne pe
   * care comerciantul nu s-a hotarat inca sa le vanda.
   *
   * Momentul corect e cel in care el spune „da": trecerea din inactiv in activ.
   */
  const tocmaiActivat = oldProduct?.is_active === false && data.is_active === true;

  void enqueueTrendyolSync(businessId, productId, productId, "upsert", tocmaiActivat);
  void enqueueEmagSync(businessId, productId, productId, "oferta", tocmaiActivat);
  void maybeSyncMailchimpProduct({ businessId, action: "upsert", product: { id: productId, name: data.name, price: data.price, slug, image: (data.images?.[0] as string | undefined) ?? null } });
  void maybeSyncBrevoProduct({ businessId, action: "upsert", product: { id: productId, name: data.name, price: data.price, slug, image: (data.images?.[0] as string | undefined) ?? null } });
  void maybeSyncKlaviyoProduct({ businessId, action: "upsert", product: { id: productId, name: data.name, price: data.price, slug, image: (data.images?.[0] as string | undefined) ?? null } });
  // Proiectia catalogului se face SINCRON, inainte de revalidare: altfel
  // comerciantul salveaza si isi vede magazinul cu datele vechi pana trece
  // cronul. Nu arunca niciodata — randul e deja in coada.
  await proiecteazaImediat(businessId);
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function duplicateProduct(productId: string, businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  // Check plan product limit
  const { data: profile } = await supabase
    .from("users_profile")
    .select("plan")
    .eq("id", user.id)
    .single();

  const plan = profile?.plan ?? "free";
  const limit = getProductLimit(plan);

  // Numaram pe CONT, nu pe magazin: planul e per cont, iar numaratoarea pe
  // magazin insemna ca al doilea magazin dubla limita. Vezi plan-limits.ts.
  const count = await numaraProduseleContului(supabase, user.id);

  if (limit !== Infinity && count >= limit) {
    return { error: `Ai atins limita de ${limit} produse. Upgradeaza planul.` };
  }

  const { data: original } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("business_id", businessId)
    .single();

  if (!original) return { error: "Produs negasit" };

  const slug = await resolveUniqueSlug(
    supabase,
    businessId,
    original.slug ? `${original.slug}-copie` : null,
  );

  const { data: created, error } = await supabase.from("products").insert({
    business_id: businessId,
    name: `${original.name} (copie)`,
    slug,
    description: original.description,
    price: original.price,
    compare_at_price: original.compare_at_price,
    category: original.category,
    shipping_class: original.shipping_class,
    sku: original.sku ? `${original.sku}-COPY` : null,
    images: original.images,
    track_inventory: original.track_inventory,
    stock_quantity: original.stock_quantity,
    is_featured: false,
    is_active: false,
    weight_grams: original.weight_grams,
    page_sections: original.page_sections as never,
  }).select("id").single();

  if (error) {
    logError({ action: "duplicateProduct", message: error.message, details: { code: error.code, hint: error.hint, productId, businessId }, userId: user.id });
    return { error: isSlugConflict(error) ? "Exista deja un produs cu acest link (slug). Alege altul." : "Eroare la duplicare." };
  }
  // Proiectia catalogului se face SINCRON, inainte de revalidare: altfel
  // comerciantul salveaza si isi vede magazinul cu datele vechi pana trece
  // cronul. Nu arunca niciodata — randul e deja in coada.
  await proiecteazaImediat(businessId);
  revalidatePath("/dashboard/products");
  // Intoarcem id-ul ca UI-ul sa deschidă direct editarea copiei.
  return { success: true, id: created.id };
}

/**
 * Pachetele care contin produsul asta si care ar ramane incomplete fara el.
 *
 * `deleteProduct` stergea componenta si pleca: pachetul ramanea publicat, cu
 * pretul lui, listand randuri „Produs indisponibil" si refuzand orice comanda la
 * ultimul pas. Asa a ajuns „Pachet Femei" nevandabil pe 2026-07-28, fara ca
 * cineva sa afle. Sunt 12 pachete in tot sistemul, deci interogarea e gratuita.
 */
async function dezactiveazaPacheteleCu(
  supabase: Awaited<ReturnType<typeof createClient>>, businessId: string, productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  const { data: pachete } = await supabase
    .from("products").select("id, page_sections")
    .eq("business_id", businessId).eq("is_bundle", true).eq("is_active", true);
  const sters = new Set(productIds);
  const afectate = (pachete ?? [])
    .filter((b) => (readBundleConfig(b.page_sections)?.items ?? []).some((i) => sters.has(i.product_id)))
    .map((b) => b.id);
  if (afectate.length === 0) return;
  // Fail-closed: mai bine un pachet ascuns decat unul publicat pe care nimeni
  // nu-l poate cumpara. Comerciantul il vede in lista de pachete, marcat.
  // Pe bucati, ca peste tot unde id-urile ajung in adresa (vezi `id-chunks.ts`):
  // aici lista e de obicei scurta, dar „de obicei" nu e o limita.
  for (const bucata of bucatiDeIduri(afectate)) {
    const { error } = await supabase.from("products").update({ is_active: false }).in("id", bucata).eq("business_id", businessId);
    if (error) {
      logError({ action: "dezactiveazaPacheteleCu", message: error.message, details: { businessId, afectate: bucata }, severity: "error" });
      return;
    }
  }
  // Feedurile sunt cozi de PUSH: fara sincronizare, oferta ramane activa si „in
  // stoc" in Merchant Center dupa ce magazinul tocmai a stins pachetul — adica
  // exact divergenta pagina-vs-feed din care ies suspendarile. Toate celelalte
  // cai de scriere din fisierul asta sincronizeaza; asta nu o facea.
  void enqueueGmcSyncMany(businessId, afectate);
  void enqueueOlxSyncMany(businessId, afectate);
  void enqueueAboutYouSyncMany(businessId, afectate);
  void enqueueTrendyolSyncMany(businessId, afectate);
  /* ⚠ „pret", nu „oferta": functia asta schimba DOAR `is_active` pe pachetele care
     contineau produsul atins. La eMAG asta e `status` pe oferta, adica `offer/save`.
     Pe ruta grea ar fi plecat documentatia intreaga a fiecarui pachet, ca sa se
     schimbe un singur numar. */
  void enqueueEmagPretMany(businessId, afectate);
}

export async function deleteProduct(productId: string, businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  // Fetch images before deleting
  const { data: product } = await supabase
    .from("products")
    .select("images")
    .eq("id", productId)
    .eq("business_id", businessId)
    .single();

  /*
   * ═══ ⚠ OFERTELE eMAG SE CITESC ÎNAINTE DE ȘTERGERE (audit 24.08.2026) ═══
   *
   * `emag_offers.product_id` devine `null` la ștergere (`on delete set null`), deci după
   * linia de mai jos nu se mai poate afla ce oferte avea produsul. Iar retragerea pusă la
   * coadă cu `product_id: null` era ȘTEARSĂ de cron înainte să trimită ceva.
   *
   * ⚠ Rezultatul, până azi: comerciantul ștergea produsul din magazin și continua să
   * primească comenzi eMAG pentru marfă pe care n-o mai avea. Anulările le plătea el, în
   * bani și în punctaj la ei.
   *
   * Se face ÎNAINTE și se așteaptă: pus cu `void` după ștergere, ar fi citit o legătură
   * deja ruptă.
   */
  await enqueueEmagRetragereInainteDeStergere(businessId, [productId]);

  const { error } = await supabase.from("products").delete()
    .eq("id", productId).eq("business_id", businessId);

  if (error) {
    logError({ action: "deleteProduct", message: error.message, details: { code: error.code, hint: error.hint, productId, businessId }, userId: user.id });
    return { error: "Eroare la stergere." };
  }
  await dezactiveazaPacheteleCu(supabase, businessId, [productId]);

  // Clean up R2 images — but only those no other product still references
  // (the deleted product's row is already gone, so it won't self-match).
  if (product?.images && Array.isArray(product.images)) {
    void deleteOrphanImages(supabase, businessId, product.images as string[]);
  }

  // Remove from Google Merchant + OLX too (product_id is null — the row is now gone).
  void enqueueGmcSync(businessId, null, productId, "delete");
  void enqueueOlxSync(businessId, null, productId, "delete");
  void enqueueAboutYouSync(businessId, null, productId, "delete");
  void enqueueTrendyolSync(businessId, null, productId, "delete");
  /* ⚠ Retragerea eMAG s-a pus la coada MAI SUS, inainte de stergere: vezi nota de
     acolo. Pusa aici, ar fi citit o legatura deja rupta si n-ar fi trimis nimic. */
  void maybeSyncMailchimpProduct({ businessId, action: "delete", product: { id: productId, name: "", price: 0 } });
  void maybeSyncBrevoProduct({ businessId, action: "delete", product: { id: productId, name: "", price: 0 } });
  void maybeSyncKlaviyoProduct({ businessId, action: "delete", product: { id: productId, name: "", price: 0 } });
  // Proiectia catalogului se face SINCRON, inainte de revalidare: altfel
  // comerciantul salveaza si isi vede magazinul cu datele vechi pana trece
  // cronul. Nu arunca niciodata — randul e deja in coada.
  await proiecteazaImediat(businessId);
  revalidatePath("/dashboard/products");
  return { success: true };
}

// ── Bulk actions (Produsele mele: select many → one action) ──────────────────
export type BulkAction =
  | { kind: "active"; value: boolean }
  | { kind: "featured"; value: boolean }
  | { kind: "category"; value: string | null }
  | { kind: "price"; mode: "inc_pct" | "dec_pct" | "inc_amt" | "dec_amt" | "set"; amount: number }
  | { kind: "delete" };

/**
 * Plafonul de siguranta, ridicat de la 1000 (2026-08-11).
 *
 * ⚠ Vechiul 1000 nu era doar strimt, era GRESIT: `.in("id", ids)` pleaca in
 * ADRESA, iar marginea o respinge intre 600 si 700 de id-uri (masurat, vezi
 * `id-chunks.ts`). Deci plafonul statea PESTE pragul la care platforma cedeaza —
 * o selectie de exact 1000 trecea de verificare si pica dupa aceea cu „Eroare la
 * actiunea in masa", care il trimitea pe om sa reincerce ce n-avea cum sa mearga.
 *
 * Acum fiecare cerere merge pe bucati de `ID_PER_CERERE`, deci lungimea adresei
 * nu mai depinde de cate produse a ales omul. Ce ramane de pazit e TIMPUL: o
 * bucata inseamna un dus-intors, iar functia are un buget. La 20000 ies 100 de
 * cereri pentru pornit/oprit, ceea ce intra confortabil; peste, lucrarea
 * trebuie mutata pe o coada, nu strecurata intr-o apasare de buton.
 *
 * Cel mai mare catalog de azi are 3351 de produse.
 */
const MAX_BULK = 20000;

export async function bulkProductAction(
  businessId: string,
  productIds: string[],
  action: BulkAction,
): Promise<{ success: true; count: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const ids = [...new Set((productIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { error: "Niciun produs selectat." };
  if (ids.length > MAX_BULK) return { error: `Poti modifica cel mult ${MAX_BULK} produse odata.` };

  // Verify the business belongs to the user.
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const now = new Date().toISOString();

  try {
    if (action.kind === "active" || action.kind === "featured") {
      const patch = action.kind === "active" ? { is_active: action.value } : { is_featured: action.value };
      /* Pe bucati: `.in()` intra in adresa, iar peste ~650 de id-uri cererea e
         respinsa la margine. Vezi `id-chunks.ts`. */
      let count = 0;
      for (const bucata of bucatiDeIduri(ids)) {
        const res = await supabase
          .from("products").update({ ...patch, updated_at: now }, { count: "exact" })
          .eq("business_id", businessId).in("id", bucata);
        if (res.error) throw res.error;
        count += res.count ?? bucata.length;
      }
      void enqueueGmcSyncMany(businessId, ids);
      void enqueueOlxSyncMany(businessId, ids);
      void enqueueAboutYouSyncMany(businessId, ids);
      void enqueueTrendyolSyncMany(businessId, ids);
      /*
       * ⚠ „pret", nu „oferta", si numai la ACTIVARE.
       *
       * `is_active` devine `status` pe oferta eMAG, iar starea se schimba prin
       * `offer/save` — ruta usoara. Trimisa pe `product_offer/save`, ar fi plecat
       * toata documentatia produsului ca sa se schimbe un singur numar.
       *
       * `is_featured` NU are corespondent la eMAG. Pus si el in coada, ar fi mancat
       * din cele 3 cereri pe secunda ale magazinului fara sa schimbe nimic acolo.
       */
      if (action.kind === "active") void enqueueEmagPretMany(businessId, ids);
      if (action.kind === "active" && action.value === false) void maybeSyncMailchimpProductsBulk({ businessId, ids, action: "delete" });
      else void maybeSyncMailchimpProductsBulk({ businessId, ids, action: "upsert" });
      if (action.kind === "active" && action.value === false) void maybeSyncBrevoProductsBulk({ businessId, ids, action: "delete" });
      else void maybeSyncBrevoProductsBulk({ businessId, ids, action: "upsert" });
      if (action.kind === "active" && action.value === false) void maybeSyncKlaviyoProductsBulk({ businessId, ids, action: "delete" });
      else void maybeSyncKlaviyoProductsBulk({ businessId, ids, action: "upsert" });
      await proiecteazaImediat(businessId);
      revalidatePath("/dashboard/products");
      return { success: true, count };
    }

    if (action.kind === "category") {
      const value = action.value?.trim() || null;
      let count = 0;
      for (const bucata of bucatiDeIduri(ids)) {
        const res = await supabase
          .from("products").update({ category: value, updated_at: now }, { count: "exact" })
          .eq("business_id", businessId).in("id", bucata);
        if (res.error) throw res.error;
        count += res.count ?? bucata.length;
      }
      void enqueueGmcSyncMany(businessId, ids);
      void enqueueOlxSyncMany(businessId, ids);
      void enqueueAboutYouSyncMany(businessId, ids);
      void enqueueTrendyolSyncMany(businessId, ids);
      void enqueueEmagSyncMany(businessId, ids);
      await proiecteazaImediat(businessId);
      revalidatePath("/dashboard/products");
      return { success: true, count };
    }

    if (action.kind === "delete") {
      /* Si citirea, si stergerea merg pe bucati: amandoua duc id-urile in
         adresa. Imaginile se strang din toate bucatile INAINTE de stergere —
         dupa aceea randurile nu mai exista si nu mai stie nimeni ce fisiere
         erau ale lor. */
      const rows: { id: string; images: unknown }[] = [];
      for (const bucata of bucatiDeIduri(ids)) {
        const res = await supabase
          .from("products").select("id, images").eq("business_id", businessId).in("id", bucata);
        if (res.error) throw res.error;
        rows.push(...((res.data ?? []) as { id: string; images: unknown }[]));
      }
      /* ⚠ Ofertele eMAG, din acelasi motiv ca imaginile de mai sus: `product_id` devine
         `null` la stergere, deci dupa bucla urmatoare nu se mai stie ce oferte erau ale
         lor. Se asteapta, nu se pune cu `void`. Vezi `deleteProduct`. */
      await enqueueEmagRetragereInainteDeStergere(businessId, ids);

      for (const bucata of bucatiDeIduri(ids)) {
        const { error } = await supabase
          .from("products").delete().eq("business_id", businessId).in("id", bucata);
        if (error) throw error;
      }
      await dezactiveazaPacheteleCu(supabase, businessId, ids);
      // Reference-safe R2 cleanup + remove from Google Merchant.
      for (const r of rows ?? []) {
        if (Array.isArray(r.images)) void deleteOrphanImages(supabase, businessId, r.images as string[]);
      }
      for (const id of ids) void enqueueGmcSync(businessId, null, id, "delete");
      for (const id of ids) void enqueueOlxSync(businessId, null, id, "delete");
      for (const id of ids) void enqueueAboutYouSync(businessId, null, id, "delete");
      for (const id of ids) void enqueueTrendyolSync(businessId, null, id, "delete");
      void maybeSyncMailchimpProductsBulk({ businessId, ids, action: "delete" });
      void maybeSyncBrevoProductsBulk({ businessId, ids, action: "delete" });
      void maybeSyncKlaviyoProductsBulk({ businessId, ids, action: "delete" });
      await proiecteazaImediat(businessId);
      revalidatePath("/dashboard/products");
      return { success: true, count: (rows ?? []).length || ids.length };
    }

    // Price: needs per-product computation, so read → compute → update.
    if (action.kind === "price") {
      const amt = Number(action.amount);
      if (!Number.isFinite(amt) || amt < 0) return { error: "Valoare invalida." };
      /* Scrierile erau deja pe bucati de 20, dar CITIREA lua toate id-urile
         intr-un singur `.in()` — deci calea de pret cadea la fel de sus ca
         celelalte, doar ca la primul pas. */
      const rows: { id: string; price: number }[] = [];
      for (const bucata of bucatiDeIduri(ids)) {
        const res = await supabase
          .from("products").select("id, price").eq("business_id", businessId).in("id", bucata);
        if (res.error) throw res.error;
        rows.push(...((res.data ?? []) as { id: string; price: number }[]));
      }

      const compute = (price: number): number => {
        let p = price;
        switch (action.mode) {
          case "inc_pct": p = price * (1 + amt / 100); break;
          case "dec_pct": p = price * (1 - amt / 100); break;
          case "inc_amt": p = price + amt; break;
          case "dec_amt": p = price - amt; break;
          case "set": p = amt; break;
        }
        return Math.max(0, Math.round(p * 100) / 100);
      };

      let count = 0;
      // Update in small concurrent batches to avoid a long serial loop.
      const batch = 20;
      for (let i = 0; i < (rows ?? []).length; i += batch) {
        const slice = (rows ?? []).slice(i, i + batch);
        const results = await Promise.all(slice.map((r) =>
          supabase.from("products")
            .update({ price: compute(Number(r.price) || 0), updated_at: now })
            .eq("id", r.id).eq("business_id", businessId),
        ));
        count += results.filter((res) => !res.error).length;
      }
      void enqueueGmcSyncMany(businessId, ids);
      void enqueueOlxSyncMany(businessId, ids);
      void enqueueAboutYouSyncMany(businessId, ids);
      void enqueueTrendyolSyncMany(businessId, ids);
      /*
       * ⚠⚠ „pret", NU „oferta". AICI ERA CHIAR DEFECTUL VETDEPO, MUTAT LA eMAG.
       *
       * O schimbare de pret in masa punea in coada `op: "oferta"`, adica ruta
       * `product_offer/save` — cea care trimite documentatia INTREAGA a produsului.
       * La Trendyol, exact confuzia asta a raportat succes pe 1051 de produse fara
       * sa schimbe niciun pret, si s-a aflat abia cand a intrebat comerciantul.
       *
       * Scrisesem in `queue.ts` ca „o schimbare de pret nu are CUM sa ajunga pe ruta
       * grea". Mecanismul era bun; firul era legat gresit.
       */
      void enqueueEmagPretMany(businessId, ids);
      void maybeSyncMailchimpProductsBulk({ businessId, ids, action: "upsert" });
      void maybeSyncBrevoProductsBulk({ businessId, ids, action: "upsert" });
      void maybeSyncKlaviyoProductsBulk({ businessId, ids, action: "upsert" });
      await proiecteazaImediat(businessId);
      revalidatePath("/dashboard/products");
      return { success: true, count };
    }

    return { error: "Actiune necunoscuta." };
  } catch (e) {
    logError({ action: "bulkProductAction", message: (e as Error).message, details: { businessId, kind: action.kind, n: ids.length }, userId: user.id });
    return { error: "Eroare la actiunea in masa. Incearca din nou." };
  }
}
