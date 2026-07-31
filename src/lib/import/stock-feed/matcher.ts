import type {
  CatalogEntry,
  StockChange,
  StockFeedRow,
  StockMatchKey,
  StockPlan,
  StockRowIssue,
} from "./types";

/**
 * Potriveste randurile din feed cu produsele din catalog si spune EXACT ce se va
 * schimba. Functie pura: nu atinge baza de date, deci se poate testa intreaga.
 *
 * Doua reguli din care nu se iese:
 *
 * 1. **Ce nu e in feed nu se atinge.** Functia nu intoarce niciodata o scriere
 *    pentru un produs care nu apare in fisier. Un feed de furnizor contine de
 *    obicei doar ce are pe stoc; daca am pune pe zero tot restul, o trimitere
 *    partiala ar goli magazinul.
 *
 * 2. **Ce e ambiguu se opreste, nu se ghiceste.** SKU-ul nu e unic in baza. Daca
 *    un cod prinde doua produse, randul devine eroare. Sa pui stocul pe produsul
 *    gresit e mai rau decat sa nu-l pui deloc.
 */

/** Cheia de cautare, adusa la o forma in care se pot compara doua fisiere. */
function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** O tinta gasita: produsul si, daca e cazul, varianta din el. */
interface Target {
  product: CatalogEntry;
  variantId: string | null;
}

/**
 * Indexul de cautare. Cheile care duc la mai multe tinte se tin separat, ca sa
 * poata fi raportate ca ambigue in loc sa fie rezolvate la intamplare.
 */
class TargetIndex {
  private single = new Map<string, Target>();
  private ambiguous = new Set<string>();

  add(key: string, target: Target): void {
    if (!key) return;
    if (this.ambiguous.has(key)) return;

    const existing = this.single.get(key);
    if (!existing) {
      this.single.set(key, target);
      return;
    }
    /* Acelasi produs si aceeasi varianta, listate de doua ori: nu e ambiguitate. */
    if (existing.product.id === target.product.id && existing.variantId === target.variantId) return;

    this.single.delete(key);
    this.ambiguous.add(key);
  }

  lookup(key: string): { target: Target | null; ambiguous: boolean } {
    if (this.ambiguous.has(key)) return { target: null, ambiguous: true };
    return { target: this.single.get(key) ?? null, ambiguous: false };
  }
}

function buildIndex(catalog: CatalogEntry[], matchKey: StockMatchKey): TargetIndex {
  const index = new TargetIndex();

  for (const product of catalog) {
    const productTarget: Target = { product, variantId: null };

    switch (matchKey) {
      case "product_id":
        index.add(norm(product.id), productTarget);
        break;
      case "external_id":
        index.add(norm(product.external_id), productTarget);
        break;
      case "gtin":
        index.add(norm(product.gtin), productTarget);
        break;
      case "sku":
        index.add(norm(product.sku), productTarget);
        break;
      case "variant_sku":
        for (const variant of product.variants) {
          index.add(norm(variant.sku), { product, variantId: variant.id });
        }
        break;
      case "sku_auto":
        /* Un singur fisier poate amesteca SKU de produs cu SKU de varianta, cum
           arata si exemplul cerut: TRIC-001 pe produs, TRIC-001-M pe marime. */
        index.add(norm(product.sku), productTarget);
        for (const variant of product.variants) {
          index.add(norm(variant.sku), { product, variantId: variant.id });
        }
        break;
    }
  }

  return index;
}

/** Valorile curente ale tintei, produs sau varianta. */
function currentValues(target: Target): { stock: number | null; price: number; inventoryOff: boolean } {
  if (target.variantId === null) {
    return {
      stock: target.product.stock_quantity,
      price: target.product.price,
      inventoryOff: !target.product.track_inventory,
    };
  }
  const variant = target.product.variants.find((v) => v.id === target.variantId);
  return {
    stock: variant?.stock_quantity ?? null,
    price: variant?.price ?? target.product.price,
    /* La variante, urmarirea stocului tot de pe produs se ia. */
    inventoryOff: !target.product.track_inventory,
  };
}

export interface PlanOptions {
  matchKey: StockMatchKey;
  /** Scrie preturi. Fals => coloana de pret e ignorata complet. */
  updatePrice: boolean;
}

export function buildStockPlan(
  rows: StockFeedRow[],
  catalog: CatalogEntry[],
  options: PlanOptions,
): StockPlan {
  const index = buildIndex(catalog, options.matchKey);
  const changes: StockChange[] = [];
  const issues: StockRowIssue[] = [];
  let unchanged = 0;

  /*
   * Acelasi identificator de doua ori in ACELASI fisier. Nu alegem noi care e
   * bun: daca furnizorul trimite doua cantitati pentru acelasi cod, singurul
   * raspuns cinstit e sa spunem ca fisierul se contrazice.
   */
  const seen = new Map<string, number>();
  const repeated = new Set<string>();
  for (const row of rows) {
    const key = norm(row.identifier);
    if (!key) continue;
    const before = seen.get(key);
    if (before === undefined) seen.set(key, row.rowIndex);
    else repeated.add(key);
  }

  for (const row of rows) {
    const key = norm(row.identifier);

    if (!key) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "invalid",
        detail: "Randul nu are identificator.",
      });
      continue;
    }

    if (repeated.has(key)) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "duplicate",
        detail: "Acelasi identificator apare de mai multe ori in fisier, cu valori care se pot bate cap in cap.",
      });
      continue;
    }

    const wantsPrice = options.updatePrice && row.price !== null;
    if (row.stock === null && !wantsPrice) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "invalid",
        detail: "Randul nu are nici stoc, nici pret de actualizat.",
      });
      continue;
    }

    if (row.stock !== null && (!Number.isFinite(row.stock) || row.stock < 0 || !Number.isInteger(row.stock))) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "invalid",
        detail: "Stocul trebuie sa fie un numar intreg, zero sau mai mare.",
      });
      continue;
    }

    if (wantsPrice && (!Number.isFinite(row.price!) || row.price! < 0)) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "invalid",
        detail: "Pretul trebuie sa fie un numar zero sau mai mare.",
      });
      continue;
    }

    const { target, ambiguous } = index.lookup(key);

    if (ambiguous) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "ambiguous",
        detail: "Codul se potriveste cu mai multe produse. Nu putem alege noi care e cel corect.",
      });
      continue;
    }

    if (!target) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "not_found",
        detail: "Niciun produs din magazin nu are acest cod.",
      });
      continue;
    }

    const current = currentValues(target);
    const stockTo = row.stock !== null && row.stock !== current.stock ? row.stock : null;
    const priceTo = wantsPrice && row.price !== current.price ? row.price : null;

    if (stockTo === null && priceTo === null) {
      unchanged++;
      continue;
    }

    const variant =
      target.variantId === null
        ? null
        : target.product.variants.find((v) => v.id === target.variantId) ?? null;

    changes.push({
      rowIndex: row.rowIndex,
      productId: target.product.id,
      productName: target.product.name,
      variantId: target.variantId,
      variantTitle: variant?.title ?? null,
      stockFrom: current.stock,
      stockTo,
      priceFrom: current.price,
      priceTo,
      inventoryOff: current.inventoryOff,
    });
  }

  return { changes, unchanged, issues, totalRows: rows.length };
}

/** Cifrele pentru ecranul de previzualizare. */
export function summarizePlan(plan: StockPlan) {
  const stockChanges = plan.changes.filter((c) => c.stockTo !== null).length;
  const priceChanges = plan.changes.filter((c) => c.priceTo !== null).length;
  const variantChanges = plan.changes.filter((c) => c.variantId !== null).length;
  const inventoryOff = plan.changes.filter((c) => c.inventoryOff).length;
  const toZero = plan.changes.filter((c) => c.stockTo === 0).length;

  const byProblem = { not_found: 0, ambiguous: 0, invalid: 0, duplicate: 0 };
  for (const issue of plan.issues) byProblem[issue.problem]++;

  return {
    totalRows: plan.totalRows,
    willWrite: plan.changes.length,
    stockChanges,
    priceChanges,
    variantChanges,
    inventoryOff,
    toZero,
    unchanged: plan.unchanged,
    ...byProblem,
  };
}
