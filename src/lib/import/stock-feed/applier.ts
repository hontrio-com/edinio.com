import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { StockChange } from "./types";

/**
 * Scrierea propriu-zisa.
 *
 * Regula de aur a fisierului: **nu se rescrie niciodata `page_sections` din
 * datele noastre.** Obiectul se citeste proaspat din baza, se schimba DOAR
 * campurile tintite dintr-o singura combinatie, si se scrie inapoi. Daca s-ar
 * reconstrui din `CatalogEntry`, care tine doar cateva campuri, s-ar sterge
 * descrierea, specificatiile, imaginile pe varianta si tot restul.
 */

type Client = SupabaseClient<Database>;

export interface VariantEdit {
  /**
   * Cheia randului care a cerut modificarea; se intoarce in `applied`/`missing`.
   * Nu folosim `variantId` pentru raportare tocmai pentru ca nu e unic.
   */
  key: number;
  variantId: string;
  /**
   * SKU-ul combinatiei tintite, cand se stie.
   *
   * ASTA departajeaza combinatiile care impart acelasi `id`. Id-ul combinatiei e
   * un slug din optiuni ("galben-unic"), nu ceva unic: intr-un magazin real sunt
   * 52 de produse cu combinatii care se calca pe id. Cand SKU-ul e cunoscut,
   * scrierea merge DOAR in combinatia lui.
   *
   * `null` inseamna "nu stiu": atunci se pastreaza purtarea veche, adica se scrie
   * in toate combinatiile cu acel id. Asa raman valabile si randurile puse la
   * coada inainte de aceasta schimbare.
   */
  sku: string | null;
  stock: number | null;
  price: number | null;
}

function sameSku(a: unknown, b: string): boolean {
  return typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Schimba stocul si pretul unor combinatii dintr-un `page_sections`, pastrand
 * absolut tot restul. Functie pura, ca sa poata fi testata fara baza de date.
 *
 * Intoarce cheile randurilor care si-au gasit combinatia si pe cele care nu:
 * daca o varianta a disparut intre previzualizare si scriere, vrem sa stim, nu
 * sa raportam succes.
 */
export function patchVariants(
  pageSections: unknown,
  edits: VariantEdit[],
): { next: Record<string, unknown>; applied: number[]; missing: number[] } {
  const root: Record<string, unknown> =
    pageSections && typeof pageSections === "object" && !Array.isArray(pageSections)
      ? { ...(pageSections as Record<string, unknown>) }
      : {};

  const variantsRaw = root.variants;
  const variants: Record<string, unknown> =
    variantsRaw && typeof variantsRaw === "object" && !Array.isArray(variantsRaw)
      ? { ...(variantsRaw as Record<string, unknown>) }
      : {};

  const combosRaw = variants.combinations;
  const combos: Record<string, unknown>[] = Array.isArray(combosRaw)
    ? (combosRaw as Record<string, unknown>[])
    : [];

  const applied = new Set<number>();

  const nextCombos = combos.map((combo) => {
    const id = typeof combo?.id === "string" ? combo.id : null;
    if (!id) return combo;

    /*
     * Intai potrivirea pe SKU, apoi cea doar pe id. Ordinea conteaza: cand doua
     * combinatii impart un id, fiecare trebuie sa-si ia modificarea ei, nu pe a
     * vecinei. Un `Map` cheiat pe id le contopea, si castiga ultima.
     */
    const edit =
      edits.find((e) => e.variantId === id && e.sku !== null && sameSku(combo.sku, e.sku)) ??
      edits.find((e) => e.variantId === id && e.sku === null);
    if (!edit) return combo;

    applied.add(edit.key);
    /* Copie: pastram toate celelalte campuri ale combinatiei neatinse. */
    const next = { ...combo };
    if (edit.stock !== null) next.stock_quantity = edit.stock;
    if (edit.price !== null) next.price = edit.price;
    return next;
  });

  const missing = edits.filter((e) => !applied.has(e.key)).map((e) => e.key);

  variants.combinations = nextCombos;
  root.variants = variants;

  return { next: root, applied: [...applied], missing };
}

/**
 * Rezultatul, pe RAND, nu pe produs.
 *
 * Un produs cu cinci marimi schimbate primeste o singura scriere, dar cele cinci
 * randuri din fisier trebuie sa-si primeasca fiecare verdictul: altfel raportul
 * de erori nu poate spune omului care linie din fisierul lui n-a intrat.
 */
export interface ApplyOutcome {
  written: StockChange[];
  failed: { change: StockChange; message: string }[];
}

/** Cate produse se scriu deodata. Mic dinadins: nu vrem sa inecam baza. */
const BATCH = 8;

/**
 * Aplica planul.
 *
 * Modificarile pe variante se grupeaza pe produs: un produs cu cinci marimi
 * schimbate primeste o singura scriere, nu cinci.
 *
 * Fiecare scriere are si `business_id` in filtru. E aparare in adancime: chiar
 * daca un id de produs ar ajunge gresit aici, nu poate atinge alt magazin.
 */
export async function applyStockPlan(
  admin: Client,
  businessId: string,
  changes: StockChange[],
  onProgress?: (done: number) => void,
): Promise<ApplyOutcome> {
  const failed: ApplyOutcome["failed"] = [];
  const written: StockChange[] = [];
  let done = 0;

  /* ── Produse simple ── */
  const simple = changes.filter((c) => c.variantId === null);

  /* ── Variante, grupate pe produs ── */
  const byProduct = new Map<string, StockChange[]>();
  for (const change of changes) {
    if (change.variantId === null) continue;
    const list = byProduct.get(change.productId);
    if (list) list.push(change);
    else byProduct.set(change.productId, [change]);
  }

  async function runBatches<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
    for (let i = 0; i < items.length; i += BATCH) {
      await Promise.all(items.slice(i, i + BATCH).map(fn));
      done = Math.min(done + BATCH, changes.length);
      onProgress?.(done);
    }
  }

  await runBatches(simple, async (change) => {
    const patch: { stock_quantity?: number; price?: number } = {};
    if (change.stockTo !== null) patch.stock_quantity = change.stockTo;
    if (change.priceTo !== null) patch.price = change.priceTo;
    if (Object.keys(patch).length === 0) return;

    const { error } = await admin
      .from("products")
      .update(patch)
      .eq("id", change.productId)
      .eq("business_id", businessId);

    if (error) failed.push({ change, message: error.message });
    else written.push(change);
  });

  await runBatches([...byProduct.entries()], async ([productId, productChanges]) => {
    const edits: VariantEdit[] = productChanges.map((c) => ({
      key: c.rowIndex,
      variantId: c.variantId as string,
      sku: c.variantSku ?? null,
      stock: c.stockTo,
      price: c.priceTo,
    }));

    /*
     * CITESTE → PATCH → SCRIE DOAR DACA NU S-A SCHIMBAT, cu reluare.
     *
     * Pana acum erau trei pasi fara nicio legatura intre ei: SELECT, patch in
     * JavaScript, UPDATE. O vanzare aterizata intre citire si scriere
     * (`decrement_variant_stock_batch` scrie tot in `page_sections`) era
     * SUPRASCRISA cu valoarea de dinainte de vanzare — fara eroare si fara urma.
     * Feedul ruleaza orar si trateaza opt produse deodata, deci fereastra e reala.
     *
     * Patch-ul RAMANE in TypeScript: `patchVariants` potriveste dupa id sau SKU,
     * raporteaza variantele lipsa si pastreaza tipul sir-vs-numar al stocului.
     * Rescris in SQL, ar fi devenit a doua formulare a acelorasi reguli.
     *
     * Reluarea, nu esecul: daca randul s-a schimbat intre timp, se reciteste si se
     * reface patch-ul PESTE valoarea noua — deci se pastreaza si vanzarea, si
     * actualizarea din feed. Trei incercari; peste ele, produsul se raporteaza ca
     * esuat in loc sa se insiste pe un rand pe care evident scrie altcineva.
     */
    let row: { page_sections: unknown } | null = null;
    let next: unknown = null;
    let missing: number[] = [];
    let scris = false;
    let mesajEroare = "";

    for (let incercare = 0; incercare < 3 && !scris; incercare++) {
      const { data, error: readErr } = await admin
        .from("products")
        .select("page_sections")
        .eq("id", productId)
        .eq("business_id", businessId)
        .single();

      if (readErr || !data) {
        mesajEroare = readErr?.message ?? "Produsul nu mai exista";
        break;
      }
      row = data;
      const patch = patchVariants(data.page_sections, edits);
      next = patch.next;
      missing = patch.missing;

      // Toate variantele au disparut: nu mai e nimic de scris, iar erorile lor se
      // raporteaza mai jos.
      if (missing.length === productChanges.length) { scris = true; break; }

      const { data: fel, error: rpcErr } = await admin.rpc("scrie_variante_daca_neschimbat" as never, {
        p_business: businessId,
        p_product: productId,
        p_asteptat: data.page_sections as never,
        p_nou: next as never,
      } as never);

      if (rpcErr) { mesajEroare = rpcErr.message; break; }
      if (fel === "scris") { scris = true; break; }
      if (fel === "lipsa") { mesajEroare = "Produsul nu mai exista"; break; }
      // `schimbat`: se reia bucla, cu o citire proaspata.
      mesajEroare = "Produsul a fost modificat in acelasi timp de altcineva";
    }

    if (!row) {
      for (const c of productChanges) failed.push({ change: c, message: mesajEroare });
      return;
    }

    /* Varianta disparuta intre previzualizare si scriere: randul ei e eroare, dar
       restul variantelor aceluiasi produs se scriu normal. */
    const missingSet = new Set(missing);
    for (const c of productChanges) {
      if (missingSet.has(c.rowIndex)) {
        failed.push({ change: c, message: "Varianta nu mai exista in produs" });
      }
    }

    const appliedChanges = productChanges.filter((c) => !missingSet.has(c.rowIndex));
    if (appliedChanges.length === 0) return;

    if (!scris) {
      for (const c of appliedChanges) failed.push({ change: c, message: mesajEroare });
    } else {
      written.push(...appliedChanges);
    }
  });

  return { written, failed };
}
