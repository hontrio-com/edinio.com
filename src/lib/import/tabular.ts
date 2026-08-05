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
export function sheetToRecords(rows: SheetCell[][], maxRows: number = MAX_CSV_ROWS): ParsedCsv {
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

  return { headers, rows: out, truncated };
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

/**
 * Cat are voie sa ocupe un XLSX DUPA desfacere.
 *
 * Cel mai mare feed legitim (MAX_STOCK_ROWS = 50.000 de randuri, cate un rand per
 * varianta) da un `sheet1.xml` de vreo 10-15 MB, plus sirurile partajate. 64 MB
 * lasa loc de trei ori pe atat si taie tot ce e absurd.
 */
export const MAX_XLSX_DESFACUT = 64 * 1024 * 1024;

const EROARE_BOMBA =
  "Fisierul .xlsx se desface in prea multe date. Pastreaza doar coloanele si randurile necesare.";
const EROARE_ARHIVA =
  "Nu am putut citi arhiva fisierului .xlsx. Deschide-l si salveaza-l din nou ca .xlsx.";

/* Semnaturile ZIP de care avem nevoie ca sa mergem din antet in antet. */
const SEMNATURA_ANTET_LOCAL = 0x04034b50;
const SEMNATURA_DIRECTOR = 0x02014b50;
const SEMNATURA_SFARSIT_DIRECTOR = 0x06054b50;
/** Semnatura descriptorului, ca octeti: exact tiparul dupa care o cauta unzipper. */
const OCTETI_DESCRIPTOR = Buffer.from([0x50, 0x4b, 0x07, 0x08]);

type MasuraIntrare = { tip: "ok"; desfacut: number } | { tip: "bomba" } | { tip: "eroare" };

/**
 * Desface o intrare scrisa IN FLUX, doar ca sa o masoare, cu plafon.
 *
 * Se arunca tot ce iese: ne intereseaza un singur numar, cat ocupa desfacuta.
 * Frontiera intrarii NU se deduce de aici — o da apelantul, dupa aceeasi regula
 * pe care o foloseste biblioteca (vezi `verificaArhivaXlsx`).
 *
 * "bomba" = peste plafon; "eroare" = octeti pe care nici zlib nu ii poate citi,
 * deci nici biblioteca nu i-ar putea citi.
 */
async function masoaraIntrareInFlux(date: Buffer, plafon: number): Promise<MasuraIntrare> {
  /* Import lenes, ca la read-excel-file: acest fisier nu are voie sa traga
     module de Node in pachetul de browser (vezi antetul fisierului). */
  const { createInflateRaw } = await import("node:zlib");

  return new Promise((resolve) => {
    const inflate = createInflateRaw();
    let desfacut = 0;
    let raspuns = false;
    const gata = (r: MasuraIntrare) => {
      if (raspuns) return;
      raspuns = true;
      resolve(r);
    };

    inflate.on("data", (bucata: Buffer) => {
      desfacut += bucata.byteLength;
      if (desfacut > plafon) {
        inflate.destroy();
        gata({ tip: "bomba" });
      }
    });
    inflate.on("end", () => gata({ tip: "ok", desfacut }));
    inflate.on("error", () => gata({ tip: "eroare" }));
    inflate.end(date);
  });
}

/**
 * Plafon pe octetii DESFACUTI, inainte de parsare.
 *
 * Plafonul de la descarcare (8 MB, `ssrf.ts`) se aplica octetilor COMPRIMATI, iar
 * `readXlsxFile` aduce toata foaia in memorie inainte ca `sheetToRecords` sa
 * apuce sa taie la `maxRows`. Masurat pe randuri XML repetate, deflate ajunge la
 * 295:1, deci 8 MB pe fir pot deveni ~2,4 GB — peste memoria functiei.
 *
 * Ce pierde cine sterge verificarea: un OOM nu e o exceptie, omoara PROCESUL. Nu
 * se prinde in niciun `try/catch`, iar cronul de feeduri de stoc ruleaza 5 surse
 * in aceeasi invocare — deci un singur comerciant putea ingheta sincronizarea
 * tuturor celorlalti, tacut si la nesfarsit (al doilea strat, in
 * `stock-feed/runner.ts`: rularea se marcheaza pesimist INAINTE de parsare).
 *
 * Verificarea merge pe acelasi drum ca `unzipper-esm`, inregistrare cu
 * inregistrare, si se opreste EXACT unde se opreste si el. Asta e tot rostul ei:
 * o socoteala care se opreste mai devreme decat biblioteca nu apara nimic.
 *
 * Capcana pentru cine o simplifica: directorul central NU inseamna "gata".
 * `parse.js` verifica semnatura antetului local INAINTEA celei de director si nu
 * tine minte ca a trecut de el, deci o intrare locala pusa DUPA director e citita
 * ca oricare alta. Cu 2 KB (cateva antete locale mincinoase, strecurate intre
 * ultimul rand al directorului si incheierea lui) se ajungea la peste 2 GB de
 * `Buffer.alloc` — masurat. Singurul lucru dupa care biblioteca chiar se opreste
 * e incheierea directorului (`self.end()`), deci doar acolo ne oprim si noi.
 *
 * Doua cazuri, si de ce sunt tratate diferit:
 *   - antetul local DECLARA dimensiunea desfacuta: biblioteca aloca exact atat
 *     (`Buffer.alloc(fileSize)`) si taie ce trece peste, deci declaratia chiar e
 *     plafonul ei de memorie. O adunam si mergem mai departe, fara sa desfacem
 *     nimic — cazul obisnuit (Excel, LibreOffice, openpyxl) costa microsecunde.
 *     Atentie: pe ramura asta biblioteca NU citeste descriptor dupa date, chiar
 *     daca steagul 0x08 e pus, deci nici noi nu sarim peste unul.
 *   - NU o declara (arhiva scrisa in flux, cu descriptor de date; asa scrie
 *     ExcelJS/archiver): biblioteca aduna bucatile la nesfarsit, deci declaratiile
 *     nu mai spun nimic si singurul adevar e sa desfacem noi, cu plafon. Frontiera
 *     intrarii e prima aparitie a semnaturii descriptorului, cum o cauta
 *     `PullStream.stream` — masurata altfel (de pilda dupa cat a consumat zlib),
 *     urmatoarea inregistrare ar fi cautata in alt loc decat o cauta biblioteca,
 *     si de acolo se poate strecura orice.
 * Regulile sunt copiate din `unzipFromStream.unzipper.js`, `parse.js` si
 * `PullStream.js`; daca acolo se schimba, aici se strica tacut.
 *
 * Orice nu se potriveste cu forma unui ZIP se refuza, nu se lasa sa treaca.
 */
async function verificaArhivaXlsx(buffer: Buffer): Promise<string | null> {
  let pozitie = 0;
  let desfacutTotal = 0;
  let dupaDirector = false;

  for (;;) {
    /* Fluxul s-a terminat pe o granita curata: `pull(4)` da zero octeti si
       parserul se incheie fara sa mai citeasca nimic. */
    if (pozitie + 4 > buffer.byteLength) return null;
    const semnatura = buffer.readUInt32LE(pozitie);

    /* Incheierea directorului opreste parserul (`self.end(); self.push(null)`):
       ce urmeaza dupa ea nu mai e citit niciodata. */
    if (semnatura === SEMNATURA_SFARSIT_DIRECTOR) return null;

    /* Randurile directorului central: le sarim, dar mergem mai departe, fiindca
       si biblioteca merge mai departe. */
    if (semnatura === SEMNATURA_DIRECTOR) {
      dupaDirector = true;
      if (pozitie + 46 > buffer.byteLength) return EROARE_ARHIVA;
      const lungimeNume = buffer.readUInt16LE(pozitie + 28);
      const lungimeExtra = buffer.readUInt16LE(pozitie + 30);
      const lungimeComentariu = buffer.readUInt16LE(pozitie + 32);
      pozitie += 46 + lungimeNume + lungimeExtra + lungimeComentariu;
      continue;
    }

    if (semnatura !== SEMNATURA_ANTET_LOCAL) {
      /* Dupa director, o semnatura necunoscuta il face pe unzipper sa sara pana
         la incheierea directorului si sa se opreasca: nicio intrare in plus. */
      if (dupaDirector) return null;
      return EROARE_ARHIVA;
    }

    if (pozitie + 30 > buffer.byteLength) return EROARE_ARHIVA;
    const steaguri = buffer.readUInt16LE(pozitie + 6);
    const metoda = buffer.readUInt16LE(pozitie + 8);
    const comprimatDeclarat = buffer.readUInt32LE(pozitie + 18);
    const desfacutDeclarat = buffer.readUInt32LE(pozitie + 22);
    const lungimeNume = buffer.readUInt16LE(pozitie + 26);
    const lungimeExtra = buffer.readUInt16LE(pozitie + 28);

    const inceputNume = pozitie + 30;
    const inceputDate = inceputNume + lungimeNume + lungimeExtra;
    if (inceputDate > buffer.byteLength) return EROARE_ARHIVA;
    const nume = buffer.toString("utf8", inceputNume, inceputNume + lungimeNume);

    /* Aceeasi regula ca in unzipper-esm: doar asa stim ce vede biblioteca. */
    const dimensiuneCunoscuta = !(steaguri & 0x08) || comprimatDeclarat > 0;
    /* Restul intrarilor sunt aruncate de `filterZipArchiveEntry`, si aruncate
       FARA sa fie desfacute (`inflater` devine `PassThrough` cand se autodreneaza),
       deci nu costa nici memorie, nici procesor. Nu le masuram deloc. */
    const seCiteste = nume.endsWith(".xml") || nume.endsWith(".xml.rels");

    if (dimensiuneCunoscuta) {
      if (seCiteste) desfacutTotal += desfacutDeclarat;
      if (inceputDate + comprimatDeclarat > buffer.byteLength) return EROARE_ARHIVA;
      pozitie = inceputDate + comprimatDeclarat;
    } else {
      const idxDescriptor = buffer.indexOf(OCTETI_DESCRIPTOR, inceputDate);
      /* Fara semnatura de descriptor, `PullStream` citeste pana la capatul
         fluxului si cade cu FILE_ENDED. */
      if (idxDescriptor === -1) return EROARE_ARHIVA;

      if (seCiteste) {
        if (metoda === 0) {
          desfacutTotal += idxDescriptor - inceputDate;
        } else if (metoda === 8) {
          const masura = await masoaraIntrareInFlux(
            buffer.subarray(inceputDate, idxDescriptor),
            MAX_XLSX_DESFACUT - desfacutTotal,
          );
          if (masura.tip === "bomba") return EROARE_BOMBA;
          if (masura.tip === "eroare") return EROARE_ARHIVA;
          desfacutTotal += masura.desfacut;
        } else {
          return EROARE_ARHIVA;
        }
      }

      /* Semnatura (4) + crc (4) + comprimat (4) + desfacut (4): `parse.js` trage
         mereu 16 octeti pe ramura asta. */
      pozitie = idxDescriptor + 16;
    }

    if (desfacutTotal > MAX_XLSX_DESFACUT) return EROARE_BOMBA;
  }
}

export type ParseTabularResult = { parsed: ParsedCsv; format: TabularFormat } | { error: string };

/**
 * Citeste un fisier tabelar, oricare din formatele acceptate.
 *
 * Pentru XLSX se ia PRIMA foaie. Un fisier de stoc are, practic mereu, o singura
 * foaie; daca apare nevoia de a alege, se adauga un pas in interfata, dar pana
 * atunci o intrebare in plus doar incurca.
 */
export async function parseTabular(
  buffer: Buffer,
  fileName: string,
  maxRows: number = MAX_CSV_ROWS,
): Promise<ParseTabularResult> {
  const byContent = detectTabularFormat(buffer);

  if (byContent === "xls_vechi") {
    return {
      error:
        "Fisierul e in formatul vechi Excel (.xls). Deschide-l si salveaza-l ca .xlsx sau .csv.",
    };
  }

  if (byContent === "xlsx") {
    /* INAINTE de parsare: vezi `verificaArhivaXlsx`. Dupa `readXlsxFile` e prea
       tarziu, memoria e deja luata. */
    const problema = await verificaArhivaXlsx(buffer);
    if (problema) return { error: problema };

    try {
      /* Import lenes: biblioteca se incarca doar cand chiar apare un XLSX. */
      const { default: readXlsxFile } = await import("read-excel-file/node");

      /* Exportul implicit da TOATE foile, ca `{ sheet, data }`. Luam prima. */
      const sheets = await readXlsxFile(buffer);
      const first = sheets[0];
      if (!first) return { error: "Fisierul nu are nicio foaie de calcul" };

      const parsed = sheetToRecords(first.data as SheetCell[][], maxRows);
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
    const parsed = parseCsv(buffer.toString("utf-8"), maxRows);
    if (parsed.headers.length === 0) return { error: "Fisierul nu are un antet valid" };
    if (parsed.rows.length === 0) return { error: "Fisierul nu contine randuri" };
    return { parsed, format: "csv" };
  } catch {
    return { error: "Nu am putut citi fisierul. Verifica formatul." };
  }
}
