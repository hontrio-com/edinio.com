// CSV parsing via papaparse. Server-only. Handles the awkward bits of real
// exports: quoted multi-line fields (Shopify "Body (HTML)"), auto delimiter
// detection (comma/semicolon/tab), and a leading UTF-8 BOM.

import Papa from "papaparse";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  /**
   * Fisierul avea mai multe randuri decat plafonul, iar restul au fost taiate.
   * Cine cheama trebuie sa se uite la asta: o taiere nespusa arata exact ca un
   * fisier mai mic, si omul ramane convins ca a actualizat tot.
   */
  truncated?: boolean;
  /**
   * Fisierul nu se poate citi cu incredere (ghilimea neinchisa).
   *
   * Cand e pus, `rows` e GOL, intentionat. Vezi `parseCsv`: un rezultat partial
   * e mai periculos decat niciunul, fiindca arata exact ca un fisier mic.
   */
  parseError?: string;
  /**
   * Cate randuri de preambul s-au sarit inaintea antetului. Pentru mesajul catre
   * om: daca am sarit ceva, trebuie sa poata verifica ca am sarit ce trebuie.
   */
  skippedBeforeHeader?: number;
}

// Hard cap so a malicious/huge file can't exhaust memory or time. Plan limits
// (max 2500 products on the top tier) are enforced separately at commit time.
export const MAX_CSV_ROWS = 5000;

/**
 * Plafonul pentru feedurile de stoc.
 *
 * Mult mai mare decat cel de produse, si nu din nepasare: un feed de stoc are un
 * rand PER VARIANTA, nu per produs. Un magazin de echipamente de protectie cu
 * 1200 de produse are peste 12.000 de variante, deci plafonul de 5000 taia doua
 * treimi din fisier. Limita adevarata ramane cea de octeti (8MB), care se atinge
 * oricum pe la ~50.000 de randuri.
 */
export const MAX_STOCK_ROWS = 50000;

export type SheetCell = string | number | boolean | Date | null | undefined;

/**
 * O celula, ca text.
 *
 * Numerele intregi se scriu fara zecimale, ca un cod EAN citit ca numar sa nu
 * ajunga "5941234567890.0" si sa nu mai potriveasca nimic.
 */
export function cellToText(cell: SheetCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell.trim();
  if (typeof cell === "boolean") return cell ? "true" : "false";
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** O celula care e DOAR un numar sau o data, deci nu poate fi nume de coloana. */
function pareValoare(text: string): boolean {
  const t = text.trim();
  if (t === "") return false;
  /* Numar, cu orice separatori ar folosi furnizorul. */
  if (/^[-+]?[\d\s.,]+$/.test(t) && /\d/.test(t)) return true;
  /* Data: 01.08.2026, 2026-08-01, 1/8/2026. */
  if (/^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(t)) return true;
  return false;
}

/**
 * Randul care chiar arata a antet.
 *
 * Regula: primul rand negol in care NICIO celula nu e doar un numar sau o data.
 * Exporturile de gestiune pun deasupra un titlu de raport („Lista stocuri
 * furnizor;01.08.2026"), iar luat drept antet acesta muta antetul adevarat pe
 * primul rand de date si lasa maparea automata fara nicio coloana.
 *
 * Un singur nume de coloana e in regula (o foaie cu o singura coloana e un caz
 * real), de aceea regula nu cere doua celule.
 *
 * Daca NICIUN rand nu trece proba, se ia primul rand negol, ca inainte: o regula
 * mai stricta decat realitatea nu are voie sa refuze un fisier care mergea.
 */
function gasesteAntetul(rows: SheetCell[][]): number {
  const negol = (r: SheetCell[]) => (r ?? []).some((c) => cellToText(c) !== "");
  const cateCelule = (r: SheetCell[]) => (r ?? []).map(cellToText).filter((t) => t !== "").length;

  const primul = rows.findIndex(negol);
  if (primul === -1) return -1;

  /*
   * Se sare peste un rand DOAR daca e mai INGUST decat tabelul.
   *
   * Regula asta e dinadins timida, si a fost slabita dupa ce prima varianta a
   * facut paguba. Aceea cauta „primul rand fara nicio celula numerica", si cu
   * asta sarea peste un antet legitim care avea o coloana numita „01.08.2026",
   * promova un RAND DE DATE la antet si arunca tot ce era deasupra lui. Masurat
   * pe un feed de 100 de produse cu un singur produs fara stoc: 57 de produse
   * pierdute TACUT, iar maparea automata reusea, deci nimic nu parea stricat.
   *
   * Ce prinde acum: titlul de raport pe una-doua celule deasupra unui tabel mai
   * lat („Lista stocuri furnizor" peste cinci coloane). Ce NU mai prinde: un
   * preambul lat cat tabelul. Pretul e cinstit — un preambul necitit lasa omul
   * sa aleaga coloane ciudate si sa vada asta pe loc, pe cand randuri pierdute
   * in tacere nu se vad niciodata.
   */
  const latimeTabel = Math.max(
    0,
    ...rows.slice(primul + 1, primul + 12).map(cateCelule),
  );

  for (let i = primul; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (!negol(r)) continue;

    const celule = r.map(cellToText).filter((t) => t !== "");
    const maiIngust = celule.length < latimeTabel;
    /* Mai ingust SI cu o valoare in el (o data, un numar): e un titlu de raport. */
    if (maiIngust && celule.some(pareValoare)) continue;
    return i;
  }
  return primul;
}

/**
 * Randuri brute -> inregistrari cheiate pe antet.
 *
 * UN SINGUR loc pentru CSV si pentru XLSX, si nu din eleganta: cat au fost doua,
 * acelasi tabel dadea liste de coloane DIFERITE dupa formatul in care il livra
 * furnizorul. La antete repetate papaparse redenumea a doua coloana in `Stoc_1`
 * si o pastra, pe cand foaia de calcul o arunca tacut; iar coloanele goale de la
 * coada ieseau din CSV ca `_1`, `_2` si ajungeau in lista pe care o vede omul.
 */
export function sheetToRecords(rows: SheetCell[][], maxRows: number = MAX_CSV_ROWS): ParsedCsv {
  const headerIndex = gasesteAntetul(rows);
  if (headerIndex === -1) return { headers: [], rows: [] };

  const rawHeaders = (rows[headerIndex] ?? []).map(cellToText);

  /*
   * Antete care se repeta: pastram prima coloana. A doua ramane necitita, dar
   * asta e mai putin rau decat sa inventam un nume ("Stoc_2") pe care omul nu
   * l-a scris si pe care apoi il vede in lista fara sa inteleaga de unde a
   * aparut. Coloanele fara nume se sar cu totul.
   */
  const headers: string[] = [];
  const columnOfHeader = new Map<string, number>();
  rawHeaders.forEach((h, i) => {
    if (h === "" || columnOfHeader.has(h)) return;
    columnOfHeader.set(h, i);
    headers.push(h);
  });

  const out: Record<string, string>[] = [];
  let truncated = false;
  for (let r = headerIndex + 1; r < rows.length; r++) {
    if (out.length >= maxRows) {
      /* Mai exista randuri cu ceva in ele dincolo de plafon? Doar atunci taiem. */
      truncated = rows
        .slice(r)
        .some((rest) => (rest ?? []).some((c) => cellToText(c) !== ""));
      break;
    }
    const row = rows[r] ?? [];
    const record: Record<string, string> = {};
    let hasValue = false;

    for (const header of headers) {
      const text = cellToText(row[columnOfHeader.get(header) as number]);
      record[header] = text;
      if (text !== "") hasValue = true;
    }

    /* Randurile complet goale se sar, ca la `skipEmptyLines: "greedy"`. */
    if (hasValue) out.push(record);
  }

  const parsed: ParsedCsv = { headers, rows: out, truncated };
  if (headerIndex > 0) {
    /* Cate randuri cu ceva in ele au fost sarite. Randurile goale nu se numara:
       omului nu-i spune nimic ca am sarit o linie alba. */
    const sarite = rows
      .slice(0, headerIndex)
      .filter((r) => (r ?? []).some((c) => cellToText(c) !== "")).length;
    if (sarite > 0) parsed.skippedBeforeHeader = sarite;
  }
  return parsed;
}

/**
 * Linia `sep=;` pe care o pun Excel, Power BI si mai multe programe de gestiune.
 *
 * Nu e date, e o instructiune pentru Excel. Luata drept antet, iesea o singura
 * coloana numita `sep=` si maparea automata nu mai gasea nimic.
 */
function desprindeSep(text: string): { text: string; delimitator?: string } {
  const m = /^sep=(.)\r?\n/i.exec(text);
  if (!m) return { text };
  return { text: text.slice(m[0].length), delimitator: m[1] };
}

export function parseCsv(text: string, maxRows: number = MAX_CSV_ROWS): ParsedCsv {
  const faraBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const { text: clean, delimitator } = desprindeSep(faraBom);

  /*
   * `header: false`, INTENTIONAT.
   *
   * Randurile vin ca tablouri si trec prin `sheetToRecords`, exact ca o foaie de
   * calcul — o singura regula pentru antet, pentru antete repetate si pentru
   * coloanele fara nume. Cu `header: true`, papaparse lua MEREU prima linie ca
   * antet, deci orice preambul devenea numele coloanelor.
   */
  const result = Papa.parse<string[]>(clean, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    ...(delimitator ? { delimiter: delimitator } : {}),
  });

  /*
   * Erorile lui papaparse se CITESC. Pana acum nu le citea nimeni.
   *
   * O ghilimea neinchisa (`"Teava 1" zincata"` intr-o coloana de denumire) face
   * ca tot restul fisierului sa intre intr-o singura celula: masurat, 4000 de
   * randuri deveneau 2, `truncated` ramanea `false`, iar rularea se raporta
   * REUSITA. Stocurile celorlalte 3998 de produse ramaneau inghetate la
   * nesfarsit, fara ca nimic sa arate a problema.
   *
   * Doar ghilimelele sunt fatale. `UndetectableDelimiter` nu e: un fisier cu o
   * singura coloana chiar n-are delimitator, si mergea corect.
   */
  /*
   * DOAR `MissingQuotes`, nu tot ce e de tip „Quotes".
   *
   * papaparse pune acelasi tip pe doua coduri foarte diferite: `MissingQuotes`
   * (ghilimea chiar neinchisa, restul fisierului se pierde) si `InvalidQuotes`
   * („Trailing quote on quoted field is malformed"), care e o simpla plangere —
   * randul se citeste CORECT si complet. Prinse amandoua, fisiere care se citeau
   * pana la ultimul rand erau respinse integral.
   */
  const ghilimea = (result.errors ?? []).find((e) => e.code === "MissingQuotes");
  if (ghilimea) {
    const linie = typeof ghilimea.row === "number" ? ghilimea.row + 1 : null;
    return {
      headers: [],
      rows: [],
      parseError: linie
        ? `Fisierul are o ghilimea (") neinchisa in jurul randului ${linie}. Restul fisierului nu se poate citi.`
        : 'Fisierul are o ghilimea (") neinchisa si nu se poate citi.',
    };
  }

  return sheetToRecords((result.data ?? []) as SheetCell[][], maxRows);
}

export function cell(row: Record<string, string>, header: string | undefined): string {
  if (!header) return "";
  const v = row[header];
  return v == null ? "" : String(v);
}
