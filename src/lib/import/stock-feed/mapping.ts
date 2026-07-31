import { cell, type ParsedCsv } from "@/lib/import/csv";
import { parsePrice } from "@/lib/import/normalize";
import type { StockFeedMapping, StockFeedRow } from "./types";

/**
 * Citirea fisierului: ghicirea coloanelor si transformarea randurilor.
 *
 * Amandoua sunt functii pure, deci se pot testa fara baza de date.
 */

/**
 * Valoarea unui stoc, citita FIDEL.
 *
 * Are reguli proprii de separator, si NU e o duplicare din lene. Celelalte doua
 * parsere din proiect greseau, fiecare in felul lui:
 *
 * - `parseIntOrNull` sterge separatorii si abia apoi taie, deci "12.5" devine
 *   125. Intr-un feed de pret o asemenea greseala se vede; intr-unul de stoc,
 *   cineva ramane cu de zece ori mai multa marfa pe hartie.
 * - `parsePrice` citeste "1.200" ca 1,2, ceea ce e corect la un pret ambiguu.
 *   La un stoc nu e: nimeni nu are 1,2 bucati, deci acolo separatorul urmat de
 *   exact trei cifre inseamna mii.
 *
 * Functia intoarce valoarea adevarata, inclusiv zecimale si negative. NU
 * valideaza: refuzul lor e treaba potrivitorului, care are unde sa raporteze
 * randul si motivul.
 */
export function parseStockValue(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  /* Scapa de unitati: "12 buc", "12 pcs". */
  let s = text.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;

  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  const sign = negative ? -1 : 1;

  /* Mai multi separatori, fiecare urmat de trei cifre: toti sunt de mii. */
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) {
    return sign * Number(s.replace(/[.,]/g, ""));
  }

  const parts = s.match(/^(\d+)(?:[.,](\d+))?$/);
  if (!parts) return null;

  const [, whole, frac] = parts;
  if (frac === undefined) return sign * Number(whole);

  /* Trei cifre dupa separator => mii. Una sau doua => zecimale, iar potrivitorul
     le va refuza daca nu sunt zerouri. */
  if (frac.length === 3) return sign * Number(whole + frac);
  return sign * Number(`${whole}.${frac}`);
}

/* Sinonime de antet, in ordinea in care le incercam. */
const IDENTIFIER_HINTS = [
  "sku", "cod produs", "cod_produs", "codprodus", "cod articol", "cod_articol",
  "codarticol", "cod", "referinta", "ref", "ean", "gtin", "barcode", "cod de bare",
  "product_id", "id produs", "id",
];
const STOCK_HINTS = [
  "stoc", "stock", "cantitate", "cantitate disponibila", "qty", "quantity",
  "disponibil", "available", "inventory", "in stoc", "on hand",
];
const PRICE_HINTS = ["pret", "price", "pret vanzare", "pret_vanzare", "pvp", "retail"];

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

/** Prima coloana al carei antet seamana cu unul din indicii. */
function pick(headers: string[], hints: string[], taken: Set<string>): string | undefined {
  const normalized = headers.map((h) => ({ raw: h, norm: normHeader(h) }));

  /* Intai potrivire exacta, apoi una partiala: un antet "Cod produs" nu trebuie
     furat de indiciul "cod" daca exista si o coloana numita exact "cod". */
  for (const hint of hints) {
    const exact = normalized.find((h) => h.norm === hint && !taken.has(h.raw));
    if (exact) return exact.raw;
  }
  for (const hint of hints) {
    const partial = normalized.find((h) => h.norm.includes(hint) && !taken.has(h.raw));
    if (partial) return partial.raw;
  }
  return undefined;
}

export function autoMapStockColumns(headers: string[]): StockFeedMapping {
  const taken = new Set<string>();
  const mapping: StockFeedMapping = {};

  const identifier = pick(headers, IDENTIFIER_HINTS, taken);
  if (identifier) {
    mapping.identifier = identifier;
    taken.add(identifier);
  }

  const stock = pick(headers, STOCK_HINTS, taken);
  if (stock) {
    mapping.stock = stock;
    taken.add(stock);
  }

  const price = pick(headers, PRICE_HINTS, taken);
  if (price) {
    mapping.price = price;
    taken.add(price);
  }

  return mapping;
}

/**
 * Randurile din fisier, in forma pe care o cere potrivitorul.
 *
 * `rowIndex` porneste de la 1 si e numarul randului de DATE, nu al liniei din
 * fisier: omul care deschide CSV-ul in Excel numara la fel, antetul nu conteaza.
 */
export function readFeedRows(
  parsed: ParsedCsv,
  mapping: StockFeedMapping,
  options: { updatePrice: boolean },
): StockFeedRow[] {
  return parsed.rows.map((row, i) => ({
    rowIndex: i + 1,
    identifier: cell(row, mapping.identifier).trim(),
    stock: mapping.stock ? parseStockValue(cell(row, mapping.stock)) : null,
    price: options.updatePrice && mapping.price ? parsePrice(cell(row, mapping.price)) : null,
  }));
}
