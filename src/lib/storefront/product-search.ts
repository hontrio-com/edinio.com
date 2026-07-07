// Storefront product search — diacritics-insensitive, typo-tolerant, ranked.
//
// Customers type without Romanian diacritics ("papusa" for "păpușă"), drop or
// swap letters ("telfon" for "telefon") and still expect results, the way the
// big marketplaces behave. This is a small dependency-free engine over the
// in-memory product list:
//
//   1. Normalization: lowercase + Unicode NFKD with combining marks stripped,
//      so query and catalog compare diacritics-free; letter/digit boundaries
//      are split so "iphone15" ≡ "iphone 15".
//   2. Per query word, best of: exact, prefix, substring, bounded
//      Damerau-Levenshtein fuzzy (1 typo for 4+ letter words, 2 for 7+) and a
//      typo-tolerant prefix for the word still being typed.
//   3. AND semantics: every query word must match somewhere in the product.
//   4. Ranking: field-weighted scores (name > category > variant options >
//      description) plus whole-phrase / name bonuses.

export type SearchableProduct = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  /** Variant option values (e.g. "Roșu", "XL") so queries can hit them. */
  optionValues?: string[];
};

type Field = { weight: number; text: string; tokens: string[] };
type Doc = { id: string; name: Field; rest: Field[] };
export type ProductSearchIndex = { docs: Doc[] };

/** Below this per-word score a product does not count as a match at all. */
const MATCH_MIN = 0.35;
/** Long free-text fields are capped so per-keystroke work stays bounded. */
const MAX_FIELD_TOKENS = 80;

const COMBINING_MARKS = /\p{M}+/gu;

export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/ł/g, "l");
}

function tokenize(input: string): string[] {
  return normalizeSearchText(input)
    .replace(/(\d)(?=[a-z])/g, "$1 ")
    .replace(/([a-z])(?=\d)/g, "$1 ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function makeField(raw: string, weight: number): Field {
  const all = tokenize(raw).slice(0, MAX_FIELD_TOKENS);
  return { weight, text: all.join(" "), tokens: [...new Set(all)] };
}

/** How many typos a query word of this length is allowed. */
function typoBudget(len: number): number {
  if (len >= 7) return 2;
  if (len >= 4) return 1;
  return 0;
}

// Optimal-string-alignment distance (Levenshtein + adjacent transposition),
// banded: returns null as soon as the distance is provably above `max`.
function editDistanceWithin(a: string, b: string, max: number): number | null {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return null;
  let prev2: number[] | null = null;
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur: number[] = new Array(lb + 1);
    cur[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (
        prev2 && i > 1 && j > 1 &&
        ca === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return null;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb] <= max ? prev[lb] : null;
}

const NUMERIC = /^\d+$/;

// Score one query word against one catalog word (0 = no match, 1 = exact).
// `isTyping` marks the last query word while it is still being typed, which
// unlocks typo-tolerant prefix matching ("telfo" → "telefon").
function tokenScore(q: string, d: string, isTyping: boolean): number {
  if (q === d) return 1;
  const ql = q.length;
  const dl = d.length;
  if (NUMERIC.test(q) || NUMERIC.test(d)) {
    // Digits change meaning with a single typo ("15" vs "16") — literal only.
    if (d.startsWith(q)) return 0.75 + 0.2 * (ql / dl);
    if (ql >= 3 && d.includes(q)) return 0.6;
    return 0;
  }
  let best = 0;
  if (d.startsWith(q)) best = 0.75 + 0.2 * (ql / dl);
  else if (ql >= 3 && d.includes(q)) best = 0.55 + 0.15 * (ql / dl);
  const budget = typoBudget(ql);
  if (budget > 0) {
    const dist = editDistanceWithin(q, d, budget);
    if (dist != null) best = Math.max(best, 0.85 * (1 - dist / Math.max(ql, dl)));
    if (isTyping && dl > ql && best < 0.62) {
      for (let len = ql - 1; len <= Math.min(dl - 1, ql + budget); len++) {
        if (len < 1) continue;
        const dp = editDistanceWithin(q, d.slice(0, len), budget);
        if (dp != null) best = Math.max(best, 0.62 * (1 - dp / ql));
      }
    }
  }
  return best;
}

function bestFieldScore(q: string, field: Field, isTyping: boolean): number {
  let best = 0;
  for (const t of field.tokens) {
    const s = tokenScore(q, t, isTyping);
    if (s > best) {
      best = s;
      if (best >= 1) break;
    }
  }
  return best;
}

export function buildProductSearchIndex(products: SearchableProduct[]): ProductSearchIndex {
  return {
    docs: products.map((p) => {
      const rest: Field[] = [];
      if (p.category) rest.push(makeField(p.category, 0.85));
      if (p.optionValues && p.optionValues.length > 0) rest.push(makeField(p.optionValues.join(" "), 0.7));
      if (p.description) rest.push(makeField(p.description, 0.45));
      return { id: p.id, name: makeField(p.name, 1), rest };
    }),
  };
}

/**
 * Runs a query against the index. Returns null for an empty/blank query (no
 * filtering), otherwise a map of product id → relevance score containing only
 * the products that match every query word.
 */
export function queryProductSearchIndex(
  index: ProductSearchIndex,
  rawQuery: string,
): Map<string, number> | null {
  const qTokens = tokenize(rawQuery);
  if (qTokens.length === 0) return null;
  // A trailing space means the last word was committed, not mid-typing.
  const lastCommitted = /\s$/.test(rawQuery);
  const phrase = qTokens.join(" ");
  const out = new Map<string, number>();

  for (const doc of index.docs) {
    let total = 0;
    let allInName = true;
    let matchedAll = true;
    for (let i = 0; i < qTokens.length; i++) {
      const q = qTokens[i];
      const isTyping = i === qTokens.length - 1 && !lastCommitted;
      const nameRaw = bestFieldScore(q, doc.name, isTyping);
      let raw = nameRaw;
      let weighted = nameRaw * doc.name.weight;
      for (const f of doc.rest) {
        const r = bestFieldScore(q, f, isTyping);
        if (r > raw) raw = r;
        const w = r * f.weight;
        if (w > weighted) weighted = w;
      }
      if (raw < MATCH_MIN) {
        matchedAll = false;
        break;
      }
      if (nameRaw < MATCH_MIN) allInName = false;
      total += weighted;
    }
    if (!matchedAll) continue;

    // Normalize by word count so short and long queries score comparably.
    let score = total / qTokens.length;
    if (doc.name.text.includes(phrase)) {
      score += 0.6;
      if (doc.name.text === phrase || doc.name.text.startsWith(phrase)) score += 0.3;
    }
    if (allInName) score += 0.25;
    out.set(doc.id, score);
  }
  return out;
}
