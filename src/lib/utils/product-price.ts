export interface PriceRange {
  min: number;
  max: number;
  // true cand produsul are variante cu preturi diferite (min != max)
  hasRange: boolean;
}

// Calculeaza intervalul de pret al unui produs, tinand cont de preturile variantelor.
// Variantele fara pret explicit (sau dezactivate) folosesc pretul de baza.
// Intoarce min == max (hasRange=false) pentru produse simple sau cu un singur pret.
export function getProductPriceRange(basePrice: number, pageSections: unknown): PriceRange {
  const base = Number(basePrice) || 0;
  const variants = (pageSections as {
    variants?: { enabled?: boolean; combinations?: unknown } | null;
  } | null)?.variants;
  const combos = variants?.combinations;

  if (!variants?.enabled || !Array.isArray(combos) || combos.length === 0) {
    return { min: base, max: base, hasRange: false };
  }

  const prices: number[] = [];
  for (const raw of combos) {
    const c = raw as { enabled?: boolean; price?: string | number | null };
    if (c.enabled === false) continue;
    // Pret gol => combinatia foloseste pretul de baza al produsului.
    const p = c.price === "" || c.price == null ? base : Number(c.price);
    if (Number.isFinite(p) && p > 0) prices.push(p);
  }

  if (prices.length === 0) return { min: base, max: base, hasRange: false };

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, hasRange: max > min };
}
