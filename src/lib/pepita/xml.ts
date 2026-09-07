/**
 * Scrierea XML pentru feedurile Pepita: escapare si elemente, nimic mai mult.
 *
 * Nu se foloseste nicio biblioteca: feedul se scrie in flux (streaming), deci nu
 * exista niciodata un arbore intreg in memorie, iar o biblioteca de serializare
 * ar cere exact arborele pe care il evitam. Ce ramane de facut e putin si
 * periculos, deci sta intr-un singur loc, cu probe.
 *
 * ⚠ CE CERE DOCUMENTATIA LOR, textual: „Az XML terméklista kódolása kizárólag
 * UTF-8 lehet" si „A speciális karakterek XML szabványnak megfelelő kódolása
 * kötelező". Adica UTF-8 si escapare standard. Nimic despre CDATA, deci nu-l
 * folosim: `&amp;` merge peste tot, iar CDATA nu poate contine `]]>` si ar cere
 * inca o regula de spart sirul.
 */

/**
 * Caracterele pe care XML 1.0 nu le poate purta DELOC, nici escapate.
 *
 * ⚠ ASTA NU E COSMETICA. Un singur octet de control intr-o descriere de produs
 * face TOT feedul neparsabil, deci Pepita nu ia niciun produs, nu doar pe acela.
 * Iar octetii astia chiar ajung in descrieri: vin din copiere din Word, din
 * exporturi de furnizor si din importurile CSV.
 *
 * Se pastreaza tab, LF si CR (0x09, 0x0A, 0x0D), care sunt valide. Restul,
 * inclusiv perechile surogat orfane (un emoji rupt la taierea unui sir), se
 * scot. `￾` si `￿` nu sunt caractere valide in XML.
 */
const NEPERMISE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Textul, curatat de ce XML nu poate purta si escapat. */
export function escapeXml(valoare: unknown): string {
  const s = valoare == null ? "" : String(valoare);
  return s
    .replace(NEPERMISE, "")
    /* `&` PRIMUL, mereu: invers, `&lt;` produs de a doua inlocuire ar deveni `&amp;lt;`. */
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    /* Ghilimelele nu sunt obligatorii in text, dar nici gresite, si feedul nu are
       atribute unde ar conta. Se escapeaza oricum: acelasi text poate ajunge
       maine intr-un atribut, si atunci lipsa lor ar fi o gaura. */
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** `<Nume>text</Nume>`, sau sirul gol cand valoarea lipseste. */
export function el(nume: string, valoare: unknown): string {
  if (valoare == null) return "";
  const s = String(valoare);
  if (s.trim() === "") return "";
  return `<${nume}>${escapeXml(s)}</${nume}>`;
}

/** `<Nume>continut</Nume>` cu continut deja serializat. Gol daca nu e nimic inauntru. */
export function grup(nume: string, continut: string): string {
  if (!continut) return "";
  return `<${nume}>${continut}</${nume}>`;
}

/**
 * Numarul, in forma pe care o citeste Pepita.
 *
 * ⚠ PUNCT ZECIMAL, NU VIRGULA, si fara separator de mii. Documentatia lor
 * ingaduie amandoua formele la `VolumeDimensions` („15"; „0.5"; „0,68"), dar la
 * preturi nu spune nimic, iar `toLocaleString` al unui server pe `ro-RO` ar
 * scrie „1.234,56", care citit ca numar ar insemna 1,23456.
 *
 * ⚠ SI NU IN NOTATIE STIINTIFICA: `String(0.0000001)` da „1e-7". Nu apare la
 * preturi, dar apare la greutati (un gram e 0,001 kg, iar un miligram ar fi
 * 0,000001). `toFixed` cu taierea zerourilor de la coada acopera si cazul asta.
 */
export function numar(valoare: number, zecimale = 2): string {
  if (!Number.isFinite(valoare)) return "";
  const s = valoare.toFixed(zecimale);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Antetul feedului. UTF-8 declarat explicit, fara BOM. */
export const ANTET = '<?xml version="1.0" encoding="UTF-8"?>\n<Catalog xmlns="https://pepita.hu/feed/1.0">\n';

/**
 * Inchiderea feedului.
 *
 * ⚠ SE SCRIE DOAR PE CALEA DE SUCCES, si asta e chiar atomicitatea feedului: un
 * flux intrerupt la mijloc ramane XML NEINCHIS, deci invalid, deci Pepita il
 * respinge intreg si pastreaza ce avea. Scris intr-un `finally`, un feed taiat de
 * o pana de baza ar deveni un feed VALID cu jumatate din catalog, adica
 * jumatate de magazin scos de la vanzare fara ca nimeni sa afle.
 */
export const INCHEIERE = "</Catalog>\n";
