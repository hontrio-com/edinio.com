import Papa from "papaparse";
import { MAX_CSV_ROWS, parseCsv, type ParsedCsv } from "./csv";

/**
 * Citirea fisierelor tabelare: CSV si XLSX.
 *
 * Ideea din spate, si motivul pentru care XLSX a costat atat de putin:
 * **fisierul se aduce la CSV chiar la intrare**, o singura data. Mai departe,
 * toata conducta (previzualizare, pornire, recitirea din cron, adaptoarele de
 * Shopify si Woo) lucreaza pe text CSV, exact ca inainte. Fara asta ar fi trebuit
 * ca fiecare pas care recitesc fisierul din R2 sa stie sa desfaca si un XLSX.
 *
 * Formatul se recunoaste din CONTINUT, nu din extensie. Un XLSX redenumit in .csv
 * e o greseala pe care o face oricine, si prin papaparse ar ieși un antet plin de
 * caractere binare, adica o eroare pe care nimeni n-o poate descifra.
 *
 * NUMAI PE SERVER. Parserul de XLSX se incarca din `read-excel-file/node`, care
 * ajunge la `fs`. Importat dintr-o componenta de client, rupe build-ul cu
 * "Module not found: Can't resolve 'fs'", o eroare greu de legat de cauza. S-a si
 * intamplat o data, cand interfata lua de aici lista de extensii.
 *
 * De aceea constantele de care are nevoie si interfata stau separat, in
 * `tabular-formats.ts`. Daca ai nevoie in browser de ceva de aici, mut-o acolo,
 * nu importa acest fisier.
 */

export type TabularFormat = "csv" | "xlsx" | "xls_vechi";

/**
 * Recunoaste formatul din primii octeti.
 *
 * XLSX e un fisier ZIP, deci incepe cu `PK\x03\x04`. XLS-ul vechi (pana la Office
 * 2003) e un container OLE si incepe cu `D0CF11E0`; nu il putem citi, dar il
 * recunoaștem ca sa putem spune limpede ce trebuie facut, in loc sa dam o eroare
 * de parsare fara noima.
 */
export function detectTabularFormat(buffer: Buffer): TabularFormat {
  if (buffer.length >= 4) {
    const b = buffer;
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "xlsx";
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "xls_vechi";
  }
  return "csv";
}

export type SheetCell = string | number | boolean | Date | null | undefined;

/**
 * Transforma randurile brute ale unei foi in aceeasi forma pe care o da CSV-ul.
 *
 * Primul rand cu ceva in el devine antetul. Tot ce urmeaza devine obiect cheiat
 * pe antet, cu valorile ca text: restul conductei a fost scris pentru text, iar
 * numerele si datele se interpreteaza mai incolo, de parserele care stiu ce
 * inseamna fiecare coloana.
 */
export function sheetToRecords(rows: SheetCell[][]): ParsedCsv {
  const headerIndex = rows.findIndex((r) => r.some((c) => cellToText(c) !== ""));
  if (headerIndex === -1) return { headers: [], rows: [] };

  const rawHeaders = rows[headerIndex].map(cellToText);

  /*
   * Antete care se repeta: pastram prima coloana, ca la CSV.
   * A doua ramane necitita, dar asta e mai putin rau decat sa inventam un nume
   * ("Stoc_2") pe care omul nu l-a scris si pe care apoi il vede in lista de
   * coloane fara sa inteleaga de unde a apărut.
   */
  const headers: string[] = [];
  const columnOfHeader = new Map<string, number>();
  rawHeaders.forEach((h, i) => {
    if (h === "" || columnOfHeader.has(h)) return;
    columnOfHeader.set(h, i);
    headers.push(h);
  });

  const out: Record<string, string>[] = [];
  for (let r = headerIndex + 1; r < rows.length && out.length < MAX_CSV_ROWS; r++) {
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

  return { headers, rows: out };
}

/**
 * O celula, ca text.
 *
 * Numerele intregi se scriu fara zecimale, ca un cod EAN citit ca numar sa nu
 * ajunga "5941234567890.0" si sa nu mai potriveasca nimic.
 */
function cellToText(cell: SheetCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell.trim();
  if (typeof cell === "boolean") return cell ? "true" : "false";
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return "";
    return Number.isInteger(cell) ? String(cell) : String(cell);
  }
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** Serializeaza inapoi in CSV, ca sa poata fi pastrat si recitit ca pana acum. */
export function recordsToCsv(parsed: ParsedCsv): string {
  return Papa.unparse(
    { fields: parsed.headers, data: parsed.rows.map((r) => parsed.headers.map((h) => r[h] ?? "")) },
    { delimiter: ",", newline: "\r\n" },
  );
}

export type ParseTabularResult = { parsed: ParsedCsv; format: TabularFormat } | { error: string };

/**
 * Citeste un fisier tabelar, oricare din formatele acceptate.
 *
 * Pentru XLSX se ia PRIMA foaie. Un fisier de stoc are, practic mereu, o singura
 * foaie; daca apare nevoia de a alege, se adauga un pas in interfata, dar pana
 * atunci o intrebare in plus doar incurca.
 */
export async function parseTabular(buffer: Buffer, fileName: string): Promise<ParseTabularResult> {
  const byContent = detectTabularFormat(buffer);

  if (byContent === "xls_vechi") {
    return {
      error:
        "Fisierul e in formatul vechi Excel (.xls). Deschide-l si salveaza-l ca .xlsx sau .csv.",
    };
  }

  if (byContent === "xlsx") {
    try {
      /* Import lenes: biblioteca se incarca doar cand chiar apare un XLSX. */
      const { default: readXlsxFile } = await import("read-excel-file/node");

      /* Exportul implicit da TOATE foile, ca `{ sheet, data }`. Luam prima. */
      const sheets = await readXlsxFile(buffer);
      const first = sheets[0];
      if (!first) return { error: "Fisierul nu are nicio foaie de calcul" };

      const parsed = sheetToRecords(first.data as SheetCell[][]);
      if (parsed.headers.length === 0) return { error: "Foaia de calcul nu are un antet valid" };
      if (parsed.rows.length === 0) return { error: "Foaia de calcul nu contine randuri" };
      return { parsed, format: "xlsx" };
    } catch {
      return { error: "Nu am putut citi foaia de calcul. Verifica fisierul." };
    }
  }

  /* CSV. Extensia nu conteaza: daca nu e ZIP, incercam text. */
  void fileName;
  try {
    const parsed = parseCsv(buffer.toString("utf-8"));
    if (parsed.headers.length === 0) return { error: "Fisierul nu are un antet valid" };
    if (parsed.rows.length === 0) return { error: "Fisierul nu contine randuri" };
    return { parsed, format: "csv" };
  } catch {
    return { error: "Nu am putut citi fisierul. Verifica formatul." };
  }
}
