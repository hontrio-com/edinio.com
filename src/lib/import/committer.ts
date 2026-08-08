// Writes StagedProduct[] into the DB in resumable chunks.
// Owns: plan-limit enforcement, batch slug dedupe, category-tree upsert,
// insert/upsert by external_id, and the background image-rehost phase.
// Driven by processImport(), which both the server action and the cron call.

import { createAdminClient } from "@/lib/supabase/admin";
import { getProductLimit, numaraProduseleContului } from "@/lib/plan-limits";
import type {
  ImportOptions,
  ImportStatus,
  ImportTotals,
  StagedProduct,
  ValidationSummary,
} from "./types";
import { EMPTY_TOTALS } from "./types";
import { rehostProductImages, rehostImageUrl, needsRehost, isR2Url, type CacheRehostare } from "./image-rehost";
import { parseShippingClasses } from "@/lib/shipping/rules";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";

type Admin = ReturnType<typeof createAdminClient>;

const COMMIT_CHUNK = 40; // products written per tick
const REHOST_CHUNK = 15; // products whose images are rehosted per tick (slower)
const STAGE_BATCH = 500; // import_rows inserted per batch

interface JobRow {
  id: string;
  business_id: string;
  user_id: string;
  source: string;
  status: string;
  options: unknown;
  totals: unknown;
}

// ── Staging ─────────────────────────────────────────────────────────────────

/** Persist canonical products as import rows so commits can resume statelessly. */
export async function stageProducts(
  admin: Admin,
  importId: string,
  businessId: string,
  products: StagedProduct[],
  importImages: boolean,
): Promise<{ total: number; imagesTotal: number }> {
  let imagesTotal = 0;
  const rows = products.map((p, i) => {
    if (importImages) imagesTotal += p.images.length;
    return {
      import_id: importId,
      business_id: businessId,
      row_index: i,
      parsed: p as unknown as never,
      external_id: p.external_id,
      status: "pending",
    };
  });

  for (let i = 0; i < rows.length; i += STAGE_BATCH) {
    const { error } = await admin.from("product_import_rows").insert(rows.slice(i, i + STAGE_BATCH));
    if (error) throw new Error(error.message);
  }
  return { total: products.length, imagesTotal };
}

// ── Validation (pure, used for the review step) ──────────────────────────────

export function validateStaged(
  products: StagedProduct[],
  opts: { existingCategories: Set<string>; currentCount: number; limit: number },
): ValidationSummary {
  const errors: ValidationSummary["errors"] = [];
  const warnings: ValidationSummary["warnings"] = [];
  const newCategories = new Set<string>();
  let valid = 0;

  products.forEach((p, i) => {
    const name = (p.name ?? "").trim();
    if (!name) {
      errors.push({ row_index: i, name: name || `Rand ${i + 1}`, message: "Lipseste numele produsului" });
      return;
    }
    if (!(p.price > 0)) {
      errors.push({ row_index: i, name, message: "Pret lipsa sau invalid" });
      return;
    }
    valid++;
    if (p.images.length === 0) warnings.push({ row_index: i, name, message: "Produs fara imagini" });
    const leaf = p.category_path[p.category_path.length - 1];
    if (leaf && !opts.existingCategories.has(leaf.toLowerCase())) newCategories.add(leaf);
  });

  if (opts.limit !== Infinity && opts.currentCount + valid > opts.limit) {
    const importable = Math.max(0, opts.limit - opts.currentCount);
    warnings.push({
      row_index: -1,
      name: "Limita de plan",
      message: `Planul tau permite ${opts.limit} produse. Vor fi importate maximum ${importable}, restul vor fi sarite.`,
    });
  }

  return { total: products.length, valid, errors, warnings, newCategories: [...newCategories] };
}

// ── Commit phase ─────────────────────────────────────────────────────────────

interface CommitDeltas {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

/**
 * Randurile de stagiere ale unui import incheiat, sterse cand nu mai spun nimic.
 *
 * `product_import_rows` stageaza FIECARE rand al fisierului si nu se curata
 * niciodata: 8.331 de randuri si 25 MB acumulate din importuri de mult terminate.
 * Bomba nu e insa istoricul, ci feedul de stocuri — `stock-feed/runner.ts`
 * stageaza un set COMPLET la fiecare rulare ORARA a fiecarei surse. Zero surse
 * configurate azi, dar cronul e deja programat: la prima sursa reala, tabela
 * creste cu tot fisierul in fiecare ora, pentru totdeauna.
 *
 * Se pastreaza `failed` si `skipped`: din ele se compune raportul de erori pe care
 * comerciantul il descarca din `/api/imports/[id]/error-report`. Randurile
 * reusite (`created`/`updated`) nu mai au niciun cititor odata ce produsul exista
 * — id-ul lui e deja pe produs.
 *
 * Esecul e inghitit deliberat: o curatare care nu reuseste n-are voie sa faca un
 * import incheiat sa para picat. Randurile raman, si le ia urmatoarea trecere.
 */
async function curataRandurileReusite(admin: Admin, importId: string): Promise<void> {
  const { error } = await admin
    .from("product_import_rows")
    .delete()
    .eq("import_id", importId)
    .in("status", ["created", "updated"]);
  if (error) console.error(`[import] curatarea randurilor pentru ${importId} a esuat:`, error.message);
}

async function commitChunk(admin: Admin, job: JobRow): Promise<{ deltas: CommitDeltas; remaining: number }> {
  const businessId = job.business_id;
  const options = job.options as unknown as ImportOptions;
  const source = job.source;
  const deltas: CommitDeltas = { created: 0, updated: 0, skipped: 0, failed: 0 };

  const { data: pending } = await admin
    .from("product_import_rows")
    .select("id, row_index, parsed, external_id")
    .eq("import_id", job.id)
    .eq("status", "pending")
    .order("row_index", { ascending: true })
    .limit(COMMIT_CHUNK);

  if (!pending || pending.length === 0) return { deltas, remaining: 0 };

  // Plan limit + current usage.
  const { data: profile } = await admin.from("users_profile").select("plan").eq("id", job.user_id).single();
  const limit = getProductLimit(profile?.plan ?? "free");
  // Pe CONT, nu pe magazin: altfel al doilea magazin dubla limita la import.
  let currentCount = await numaraProduseleContului(admin, job.user_id);

  // Preload existing slugs + category tree for in-memory dedupe/upsert.
  const slugSet = await loadSlugs(admin, businessId);
  const catMap = await loadCategories(admin, businessId);
  // Shipping classes are keyed by name in the CSV; map them to their stored ids.
  const shipClassMap = await loadShippingClasses(admin, businessId);

  for (const row of pending) {
    const p = row.parsed as unknown as StagedProduct | null;
    const rowId = row.id;

    if (!p || !(p.name ?? "").trim()) {
      await failRow(admin, rowId, "Lipseste numele produsului");
      deltas.failed++;
      continue;
    }
    if (!(p.price > 0)) {
      await failRow(admin, rowId, "Pret lipsa sau invalid");
      deltas.failed++;
      continue;
    }
    /*
     * Limita de plan atinsa: se marcheaza TOT restul dintr-o data si se iese.
     *
     * `currentCount` doar creste, deci din clipa in care conditia e adevarata
     * ramane adevarata pentru fiecare rand care urmeaza — nu doar din bucata
     * asta, ci din tot importul. Pana acum se afla asta din nou la fiecare rand:
     * un `UPDATE` propriu ca sa-l marcheze `skipped`, patruzeci pe bucata, plus
     * inca un tur de orchestrare pentru urmatoarea bucata. Masurat, 22 de minute
     * intr-un job care crease ZECE produse; in istoric sunt 3.674 de randuri
     * marcate asa, adica 3.674 de dus-intorsuri.
     *
     * Acum: o singura instructiune peste toate randurile ramase, si
     * `remaining: 0`, deci orchestrarea incheie importul in tick-ul asta in loc
     * sa mai ceara nouazeci si doua de bucati care ar face exact acelasi lucru.
     *
     * `count: "exact"` fiindca `deltas.skipped` intra in totalurile aratate
     * comerciantului: numarat gresit, raportul i-ar spune ca s-au sarit mai
     * putine produse decat s-au sarit.
     */
    if (limit !== Infinity && currentCount >= limit) {
      const { count } = await admin
        .from("product_import_rows")
        .update({ status: "skipped", error: "Limita de plan atinsa" }, { count: "exact" })
        .eq("import_id", job.id)
        .eq("status", "pending");
      deltas.skipped += count ?? 0;
      return { deltas, remaining: 0 };
    }

    const category = await upsertCategoryPath(admin, businessId, p.category_path, catMap);
    // Match the CSV shipping-class name to a stored class id (case-insensitive); unknown -> standard.
    const shippingClassId = p.shipping_class
      ? shipClassMap.get(p.shipping_class.trim().toLowerCase()) ?? null
      : null;

    // Overwrite path: update an existing product matched by (source, external_id).
    let existingId: string | null = null;
    if (options.overwrite_existing && p.external_id) {
      const { data: ex } = await admin
        .from("products")
        .select("id")
        .eq("business_id", businessId)
        .eq("source", source)
        .eq("external_id", p.external_id)
        .maybeSingle();
      existingId = ex?.id ?? null;
    }

    const payload = buildPayload(p, businessId, source, category, shippingClassId);

    if (existingId) {
      // Keep the existing slug (avoid collisions); update everything else.
      const { slug: _slug, ...rest } = payload;
      void _slug;
      const { error } = await admin
        .from("products")
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq("id", existingId)
        .eq("business_id", businessId);
      if (error) {
        // Pastreaza cauza reala (trunchiata) — un mesaj generic a ascuns o ora
        // de depanare cand toate randurile picau pe unicitatea slug-ului.
        await failRow(admin, rowId, `Eroare la actualizare: ${(error.message ?? "necunoscuta").slice(0, 120)}`);
        deltas.failed++;
        continue;
      }
      await admin.from("product_import_rows").update({ status: "updated", product_id: existingId, error: null }).eq("id", rowId);
      deltas.updated++;
      continue;
    }

    const slug = dedupeSlug(payload.slug, slugSet);
    const { data: inserted, error } = await admin
      .from("products")
      .insert({ ...payload, slug })
      .select("id")
      .single();

    if (error || !inserted) {
      const cause = error?.code === "23505"
        ? "Produs duplicat (slug deja existent)"
        : `Eroare la salvare: ${(error?.message ?? "necunoscuta").slice(0, 120)}`;
      await failRow(admin, rowId, cause);
      deltas.failed++;
      continue;
    }
    await admin.from("product_import_rows").update({ status: "created", product_id: inserted.id, error: null }).eq("id", rowId);
    deltas.created++;
    currentCount++;
  }

  const { count: remaining } = await admin
    .from("product_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", job.id)
    .eq("status", "pending");

  return { deltas, remaining: remaining ?? 0 };
}

// ── Image rehost phase ───────────────────────────────────────────────────────

async function rehostChunk(admin: Admin, job: JobRow): Promise<{ done: number; failed: number; remaining: number }> {
  const businessId = job.business_id;
  const cache: CacheRehostare = new Map();
  let imagesDone = 0;
  let imagesFailed = 0;

  const { data: rows } = await admin
    .from("product_import_rows")
    .select("id, product_id")
    .eq("import_id", job.id)
    .eq("images_done", false)
    .in("status", ["created", "updated"])
    .order("row_index", { ascending: true })
    .limit(REHOST_CHUNK);

  if (!rows || rows.length === 0) return { done: 0, failed: 0, remaining: 0 };

  /*
   * Produsele se rehosteaza in BAZIN, nu unul dupa altul.
   *
   * Rehostarea e partea grea a importului — 88% din durata lui, masurat: 2.828 de
   * imagini, cate ~1,17 s fiecare, toate la coada. Fiecare imagine inseamna o
   * descarcare de pe serverul altcuiva si o urcare in R2, deci timpul e aproape
   * numai ASTEPTARE; puse in paralel, se suprapune.
   *
   * PATRU, nu cincisprezece: sursa e de obicei un singur CDN al furnizorului, iar
   * o rafala prea larga se intoarce ca `429` — adica imagini pierdute, nu doar
   * mai lente. Patru produse deodata, fiecare cu imaginile lui cerute in paralel,
   * inseamna un varf de ordinul zecilor de cereri, nu al sutelor. Numarul asta se
   * poate ridica, dar numai dupa ce se masoara pe un import real.
   *
   * Duplicarea e imposibila: cache-ul tine PROMISIUNI, deci doi lucratori care
   * cer aceeasi adresa in aceeasi clipa asteapta amandoi acelasi rezultat, si in
   * R2 ajunge un singur obiect. Vezi `CacheRehostare`.
   */
  const PARALEL = 4;
  for (let i = 0; i < rows.length; i += PARALEL) {
    await Promise.all(rows.slice(i, i + PARALEL).map(async (row) => {
    if (!row.product_id) {
      await admin.from("product_import_rows").update({ images_done: true }).eq("id", row.id);
      return;
    }
    const { data: product } = await admin.from("products").select("images, page_sections").eq("id", row.product_id).single();
    const images = Array.isArray(product?.images) ? (product!.images as string[]) : [];
    const update: Record<string, unknown> = {};

    if (images.length && needsRehost(images)) {
      const res = await rehostProductImages(images, businessId, job.id, cache);
      imagesDone += res.done;
      imagesFailed += res.failed;
      update.images = res.images as unknown as never;
    }

    // Rehost per-variant images too, reusing the SAME cache: a variant image shared
    // with the gallery resolves to the identical rehosted URL, so it can never end up
    // as an external duplicate of the gallery image on the storefront. Runs after the
    // gallery loop above so the cache is already primed with the shared URLs.
    const ps = (product?.page_sections ?? null) as { variants?: { combinations?: { image?: string }[] } } | null;
    const combos = ps?.variants?.combinations;
    if (ps && Array.isArray(combos) && combos.some((c) => c?.image && !isR2Url(c.image))) {
      for (const c of combos) {
        if (c?.image && !isR2Url(c.image)) {
          const res = await rehostImageUrl(c.image, businessId, job.id, cache);
          c.image = res.url;
        }
      }
      update.page_sections = ps as unknown as never;
    }

    if (Object.keys(update).length > 0) {
      await admin.from("products").update(update as never).eq("id", row.product_id);
    }
    await admin.from("product_import_rows").update({ images_done: true }).eq("id", row.id);
    }));
  }

  const { count: remaining } = await admin
    .from("product_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", job.id)
    .eq("images_done", false)
    .in("status", ["created", "updated"]);

  return { done: imagesDone, failed: imagesFailed, remaining: remaining ?? 0 };
}

// ── Orchestration tick ────────────────────────────────────────────────────────

/**
 * Advance an import by one chunk. Idempotent and safe to call repeatedly from
 * both the client loop and the cron fallback. Returns the new status + totals.
 */
export async function processImport(
  admin: Admin,
  importId: string,
): Promise<{ status: ImportStatus; totals: ImportTotals; done: boolean }> {
  const { data: jobRaw } = await admin
    .from("product_imports")
    .select("id, business_id, user_id, source, status, options, totals")
    .eq("id", importId)
    .single();

  if (!jobRaw) return { status: "failed", totals: EMPTY_TOTALS, done: true };
  const job = jobRaw as JobRow;

  /*
   * Bariera de siguranta: acest committer CREEAZA produse din
   * `product_import_rows.parsed`. Tabelul `product_imports` tine si joburi de alt
   * fel, cum e feedul de stocuri, la care `parsed` are cu totul alta forma.
   * Ajuns aici cu un astfel de job, ar incerca sa importe produse din stocuri.
   *
   * Apelantii filtreaza deja pe sursa, dar protectia nu trebuie sa depinda de
   * disciplina apelantului: e prea scump daca cineva uita.
   */
  if (!["shopify_csv", "woo_csv", "generic_csv"].includes(job.source)) {
    return { status: job.status as ImportStatus, totals: EMPTY_TOTALS, done: true };
  }

  const options = job.options as unknown as ImportOptions;
  const totals: ImportTotals = { ...EMPTY_TOTALS, ...((job.totals as Partial<ImportTotals>) ?? {}) };

  if (job.status === "importing") {
    const { deltas, remaining } = await commitChunk(admin, job);
    totals.created += deltas.created;
    totals.updated += deltas.updated;
    totals.skipped += deltas.skipped;
    totals.failed += deltas.failed;

    let status: ImportStatus = "importing";
    const patch: Record<string, unknown> = { totals: totals as unknown as never, updated_at: new Date().toISOString() };
    if (remaining === 0) {
      const wantImages = options.import_images && totals.images_total > 0;
      status = wantImages ? "rehosting_images" : totals.failed > 0 ? "completed_with_errors" : "completed";
      patch.status = status;
      if (status !== "rehosting_images") patch.finished_at = new Date().toISOString();
    }
    await admin.from("product_imports").update(patch as never).eq("id", importId);
    // Importul s-a incheiat aici (fara pas de imagini): randurile reusite nu mai
    // au cititor. Vezi `curataRandurileReusite`.
    if (status === "completed" || status === "completed_with_errors") await curataRandurileReusite(admin, importId);
    return { status, totals, done: status === "completed" || status === "completed_with_errors" };
  }

  if (job.status === "rehosting_images") {
    const { done, failed, remaining } = await rehostChunk(admin, job);
    totals.images_done += done + failed; // count attempts so the bar reaches 100%

    let status: ImportStatus = "rehosting_images";
    const patch: Record<string, unknown> = { totals: totals as unknown as never, updated_at: new Date().toISOString() };
    if (remaining === 0) {
      status = totals.failed > 0 ? "completed_with_errors" : "completed";
      patch.status = status;
      patch.finished_at = new Date().toISOString();
    }
    await admin.from("product_imports").update(patch as never).eq("id", importId);
    // Al doilea punct terminal: dupa rehostarea imaginilor. Curatarea sta la
    // AMANDOUA, nu doar la primul — altfel importurile cu imagini nu s-ar curata
    // niciodata, si tocmai alea au cele mai multe randuri.
    if (status === "completed" || status === "completed_with_errors") await curataRandurileReusite(admin, importId);
    return { status, totals, done: status === "completed" || status === "completed_with_errors" };
  }

  const status = job.status as ImportStatus;
  const done = status === "completed" || status === "completed_with_errors" || status === "failed" || status === "cancelled";
  return { status, totals, done };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPayload(
  p: StagedProduct,
  businessId: string,
  source: string,
  category: string | null,
  shippingClassId: string | null,
) {
  const page_sections: Record<string, unknown> = {};
  if (p.variants && p.variants.combinations.length > 0) page_sections.variants = p.variants;
  if (p.seo) page_sections.seo = p.seo;
  if (p.short_description) page_sections.short_description = p.short_description;
  if (p.stock_status) page_sections.stock_status = p.stock_status;
  if (p.low_stock_threshold != null) page_sections.low_stock_threshold = p.low_stock_threshold;
  if (p.dimensions && (p.dimensions.length || p.dimensions.width || p.dimensions.height)) page_sections.dimensions = p.dimensions;
  if (p.specifications && p.specifications.length > 0) page_sections.specifications = p.specifications;
  if (p.quantity_tiers) page_sections.quantity_tiers = p.quantity_tiers;
  // EAN/brand share page_sections.google with the product form (Google/Facebook feeds read them).
  const google: Record<string, string> = {};
  if (p.gtin) google.gtin = p.gtin;
  if (p.brand) google.brand = p.brand;
  if (Object.keys(google).length > 0) page_sections.google = google;

  return {
    business_id: businessId,
    name: p.name.trim(),
    slug: p.slug,
    description: p.description_html,
    price: p.price,
    compare_at_price: p.compare_at_price,
    category,
    sku: p.sku,
    // Always store the source URLs now; the rehost phase swaps them for R2 URLs.
    images: p.images.map((i) => i.src) as unknown as never,
    track_inventory: p.track_inventory,
    stock_quantity: p.track_inventory ? p.stock_quantity ?? 0 : null,
    is_featured: p.is_featured,
    // Per-product when the source provides it (generic "Publicat" column); preset
    // adapters set p.is_active = options.default_active, so they are unaffected.
    is_active: p.is_active,
    weight_grams: p.weight_grams,
    shipping_class: shippingClassId,
    page_sections: page_sections as unknown as never,
    tags: p.tags as unknown as never,
    source,
    external_id: p.external_id,
    sort_order: 0,
  };
}

async function loadSlugs(admin: Admin, businessId: string): Promise<Set<string>> {
  // Windowed past the 1000-row PostgREST cap: cu set incomplet, dedupeSlug
  // returna slug-uri deja existente in DB si TOATE insert-urile picau pe
  // constrangerea de unicitate (incident 25.07: job cu 100/100 esuate la un
  // catalog de peste 1000 de produse).
  const data = await fetchAllRowsStrict("import.commit.slugs", (from, to) =>
    admin.from("products").select("id, slug").eq("business_id", businessId).not("slug", "is", null).order("id").range(from, to)
  );
  return new Set(data.map((r) => r.slug as string));
}

/** Map each store shipping class NAME (lowercased) to its stored id, for CSV resolution. */
async function loadShippingClasses(admin: Admin, businessId: string): Promise<Map<string, string>> {
  const { data } = await admin
    .from("store_settings")
    .select("shipping_classes")
    .eq("business_id", businessId)
    .maybeSingle();
  const map = new Map<string, string>();
  for (const c of parseShippingClasses(data?.shipping_classes ?? [])) {
    const key = c.name.trim().toLowerCase();
    if (key) map.set(key, c.id);
  }
  return map;
}

function dedupeSlug(base: string | null, slugSet: Set<string>): string | null {
  if (!base) return null;
  if (!slugSet.has(base)) {
    slugSet.add(base);
    return base;
  }
  let n = 2;
  while (slugSet.has(`${base}-${n}`)) n++;
  const next = `${base}-${n}`;
  slugSet.add(next);
  return next;
}

interface CatNode {
  id: string;
  name: string;
}

async function loadCategories(admin: Admin, businessId: string): Promise<Map<string, CatNode>> {
  // Windowed past the 1000-row PostgREST cap — an incomplete dedup map would
  // make the committer re-insert categories that already exist.
  const data = await fetchAllRowsStrict("import.commit.categories", (from, to) =>
    admin.from("categories").select("id, name, parent_id").eq("business_id", businessId).order("id").range(from, to)
  );
  const map = new Map<string, CatNode>();
  for (const c of data) {
    map.set(catKey(c.parent_id, c.name), { id: c.id, name: c.name });
  }
  return map;
}

function catKey(parentId: string | null, name: string): string {
  return `${parentId ?? ""}::${name.trim().toLowerCase()}`;
}

async function upsertCategoryPath(
  admin: Admin,
  businessId: string,
  path: string[],
  catMap: Map<string, CatNode>,
): Promise<string | null> {
  let parentId: string | null = null;
  let leafName: string | null = null;

  for (const raw of path) {
    const name = raw.trim();
    if (!name) continue;
    const key = catKey(parentId, name);
    let node: CatNode | undefined = catMap.get(key);

    if (!node) {
      const ins = (await admin
        .from("categories")
        .insert({ business_id: businessId, name, parent_id: parentId, sort_order: 0 })
        .select("id, name")
        .single()) as { data: { id: string; name: string } | null };
      if (ins.data) {
        node = { id: ins.data.id, name: ins.data.name };
      } else {
        // Likely a concurrent insert hit the unique constraint; fetch the winner.
        const found = await findCategory(admin, businessId, name, parentId);
        if (found) node = found;
      }
      if (node) catMap.set(key, node);
    }

    if (node) {
      parentId = node.id;
      leafName = node.name;
    }
  }
  return leafName;
}

async function findCategory(
  admin: Admin,
  businessId: string,
  name: string,
  parentId: string | null,
): Promise<CatNode | null> {
  const base = admin.from("categories").select("id, name").eq("business_id", businessId).eq("name", name);
  const { data } = parentId
    ? await base.eq("parent_id", parentId).maybeSingle()
    : await base.is("parent_id", null).maybeSingle();
  return data ? { id: data.id, name: data.name } : null;
}

async function failRow(admin: Admin, rowId: string, message: string): Promise<void> {
  await admin.from("product_import_rows").update({ status: "failed", error: message }).eq("id", rowId);
}
