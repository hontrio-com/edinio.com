import { cell, type ParsedCsv } from "@/lib/import/csv";
import { normHeader, pick } from "@/lib/import/header-match";
import { parsePrice } from "@/lib/import/normalize";
import type { StockFeedMapping, StockFeedRow, StockMatchKey } from "./types";

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

  /*
   * Un INTERVAL nu e o cantitate.
   *
   * Stergerea oarba a cratimelor lipea grupurile de cifre: "5-10" iesea 510,
   * "10-20" iesea 1020, "1-2 buc" iesea 12. Adica exact felul in care un
   * furnizor scrie „intre 5 si 10 bucati" devenea un stoc de cinci sute zece.
   * Mai bine refuzat, cu randul raportat, decat ghicit.
   */
  if (/\d\s*[-\u2010-\u2015]\s*\d/.test(text)) return null;

  /* Scapa de unitati: "12 buc", "12 pcs". */
  let s = text.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;

  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  const sign = negative ? -1 : 1;

  /*
   * Amandoi separatorii in acelasi numar: ultimul e cel zecimal, celalalt e de
   * mii. "1.234,00" si "1,234.00" inseamna amandoua 1234; inainte ieseau `null`,
   * iar randul era raportat drept „nu are stoc" — un mesaj care trimitea omul
   * sa caute o coloana lipsa in loc de un separator.
   */
  if (s.includes(".") && s.includes(",")) {
    const zecimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const mii = zecimal === "." ? "," : ".";
    const numar = Number(s.split(mii).join("").replace(zecimal, "."));
    return Number.isFinite(numar) ? sign * numar : null;
  }

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

/*
 * Sinonime de antet, DE LA CEL MAI ANUME LA CEL MAI GENERIC.
 *
 * Ordinea nu e cosmetica. `pick` face intai o trecere exacta pe toata lista, apoi
 * una PARTIALA in ordinea indiciilor, luand prima coloana care contine indiciul.
 * Cu genericul „pret" pus primul, un antet ca „Pret achizitie" era ales inaintea
 * lui „Pret cu TVA" — masurat. Adica feedul ar fi scris in magazin pretul de la
 * furnizor, iar comerciantul ar fi vandut in pierdere fara sa ceara nimeni nimic.
 * La fel „stoc": „Stoc rezervat" castiga inaintea lui „Stoc disponibil".
 */
const IDENTIFIER_HINTS = [
  "sku", "cod produs", "cod_produs", "codprodus", "cod articol", "cod_articol",
  "codarticol", "cod", "referinta", "ref", "ean", "gtin", "barcode", "cod de bare",
  "product_id", "id produs", "id",
];
const STOCK_HINTS = [
  "stoc disponibil", "cantitate disponibila", "stoc real", "stoc actual", "stoc final",
  "disponibil", "available", "in stoc", "on hand", "inventory",
  "stoc", "stock", "cantitate", "qty", "quantity", "bucati", "buc",
];
const PRICE_HINTS = [
  "pret vanzare", "pret_vanzare", "pret cu tva", "pret raft", "pret site", "pvp", "retail",
  "pret", "price",
];

/**
 * Coloane care poarta cuvantul cautat, dar inseamna ALTCEVA.
 *
 * Se scot din prima incercare. Daca dupa scoatere nu ramane nimic, se incearca
 * din nou cu toate: cand furnizorul trimite doar „Pret achizitie", aceea CHIAR e
 * singura coloana de pret, iar omul o poate schimba din ecran.
 */
const STOC_DE_EVITAT = [
  "rezervat", "alocat", "comandat", "minim", "maxim", "asteptare", "tranzit",
  "transit", "vandut", "iesire", "retur",
];
const PRET_DE_EVITAT = [
  "achizitie", "cost", "furnizor", "intrare", "productie", "vechi", "fara tva", "net",
];

/** `pick`, dar sarind intai peste coloanele care inseamna altceva. */
function alege(
  headers: string[],
  hints: string[],
  taken: Set<string>,
  deEvitat: string[],
): string | undefined {
  const curate = headers.filter((h) => {
    const n = normHeader(h);
    return !deEvitat.some((rau) => n.includes(rau));
  });

  return pick(curate, hints, taken) ?? pick(headers, hints, taken);
}

export function autoMapStockColumns(headers: string[]): StockFeedMapping {
  const taken = new Set<string>();
  const mapping: StockFeedMapping = {};

  const identifier = pick(headers, IDENTIFIER_HINTS, taken);
  if (identifier) {
    mapping.identifier = identifier;
    taken.add(identifier);
  }

  const stock = alege(headers, STOCK_HINTS, taken, STOC_DE_EVITAT);
  if (stock) {
    mapping.stock = stock;
    taken.add(stock);
  }

  const price = alege(headers, PRICE_HINTS, taken, PRET_DE_EVITAT);
  if (price) {
    mapping.price = price;
    taken.add(price);
  }

  return mapping;
}

/** Antete care spun limpede ca in coloana sta un cod de bare, nu un SKU. */
const ANTETE_EAN = ["ean", "gtin", "barcode", "cod de bare", "cod bare"];

/**
 * Cheia de potrivire potrivita pentru coloana de identificator aleasa.
 *
 * Fara asta, un feed cu antetul „EAN" isi lua coloana corect, dar cheia ramanea
 * implicitul „SKU (produs sau varianta)" — si FIECARE rand iesea „Niciun produs
 * din magazin nu are acest cod". Codurile erau in baza; doar ca se cautau in alt
 * camp. Nimic din ecran nu arata de ce.
 */
export function suggestMatchKey(identifierHeader: string | undefined): StockMatchKey | null {
  if (!identifierHeader) return null;
  const n = normHeader(identifierHeader);
  return ANTETE_EAN.some((e) => n.includes(e)) ? "gtin" : null;
}

/**
 * Coloanele mapate care NU mai exista in antetul fisierului.
 *
 * Furnizorul redenumeste o coloana, iar `cell()` intoarce sir gol pentru fiecare
 * rand: feedul citeste tot fisierul si nu schimba nimic, dar rularea se
 * raporteaza REUSITA, cu zero modificari. De aici incolo se opreste, cu numele
 * coloanei care lipseste.
 */
export function coloaneLipsa(
  parsed: ParsedCsv,
  mapping: StockFeedMapping,
  options?: { updatePrice?: boolean },
): string[] {
  const existente = new Set(parsed.headers);
  const lipsa: string[] = [];
  /* Coloana de pret se cere DOAR daca preturile chiar se actualizeaza.
     `autoMapStockColumns` o ghiceste mereu cand fisierul are una, si se salveaza
     asa chiar cu `update_price` oprit — deci un furnizor care redenumeste o
     coloana pe care oricum n-o citim ar fi oprit tot feedul. */
  const coloane = options?.updatePrice
    ? [mapping.identifier, mapping.stock, mapping.price]
    : [mapping.identifier, mapping.stock];
  for (const col of coloane) {
    if (col && !existente.has(col)) lipsa.push(col);
  }
  return lipsa;
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
