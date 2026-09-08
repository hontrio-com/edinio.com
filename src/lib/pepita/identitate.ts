/**
 * `<Id>`-ul cu care pleaca un articol spre Pepita, si drumul inapoi de la el.
 *
 * ═══ ⚠ CE CERE PEPITA, TEXTUAL ═══
 *
 * „Termékenként egyedi" (unic pe produs) si „Nem változik (azaz ha a termék adatai
 * változnak, készlet változik, etc. ez az azonosító ugyanaz marad)": nu se schimba
 * cand se schimba datele produsului sau stocul.
 *
 * De aceea NU se foloseste slug-ul (se schimba cand se redenumeste produsul), nici
 * un numar de rand, nici SKU-ul (comerciantul il editeaza). Se foloseste `id`-ul
 * din baza, un UUID care nu se schimba niciodata si nu se recicleaza.
 *
 * ═══ ⚠ DE CE VARIANTELE PLEACA APLATIZATE ═══
 *
 * Feedul lor stie variatii (`<Variations>`), dar NU DA NICIUN IDENTIFICATOR pe
 * variatie: doar valorile atributelor. Iar comanda ne trimite inapoi un `sku` pe
 * linie. Pentru un produs trimis cu variatii, nu am avea deci nicio cale sigura sa
 * aflam CE combinatie s-a vandut, si am scadea stocul de pe alta marime.
 *
 * Aplatizat, fiecare combinatie e un produs de sine statator cu `<Id>`-ul lui,
 * deci drumul inapoi e exact. Si dispare a doua capcana a lor: „Ha egy termék
 * egyszer variációsként lett átadva, azon változtatni nem szabad" (odata trimis ca
 * produs cu variatii, structura nu se mai schimba). Un articol aplatizat nu are
 * structura de variatii, deci n-are ce sa se strice.
 */

/** Desparte produsul de combinatie in `<Id>`. Doua liniute, ca sa nu se poata confunda cu un UUID. */
const SEPARATOR = "--";

/**
 * Amprenta stabila a titlului unei combinatii („S / Rosu").
 *
 * FNV-1a pe 64 de biti, scris de mana ca sa fie PUR: se cheama si din feed (server)
 * si din panou (poate ajunge in browser), deci nu poate depinde de `node:crypto`.
 *
 * ⚠ NU E O FUNCTIE DE SECURITATE si nu trebuie sa fie: nu apara nimic, doar da un
 * nume scurt si constant aceleiasi combinatii. Nu se foloseste NICIODATA pentru
 * chei sau jetoane.
 */
export function amprentaCombinatie(titlu: string): string {
  const octeti = new TextEncoder().encode(titlu);
  /*
   * ⚠ DOUA TRECERI PE 32 DE BITI, nu una pe 64 cu `BigInt`.
   *
   * `target` e ES2017 in `tsconfig.json`, unde literalele `BigInt` nici nu
   * compileaza. `Math.imul` face inmultirea pe 32 de biti exact, fara pierderea
   * de precizie pe care ar aduce-o `*` peste 2^53.
   *
   * Cele doua treceri pornesc din seminte diferite, deci dau doua jumatati
   * independente: impreuna, 64 de biti de amprenta.
   */
  return jumatate(octeti, 0x811c9dc5) + jumatate(octeti, 0x01000193);
}

/** O trecere FNV-1a pe 32 de biti, intoarsa ca opt cifre hexazecimale. */
function jumatate(octeti: Uint8Array, samanta: number): string {
  let h = samanta >>> 0;
  for (let i = 0; i < octeti.length; i++) {
    h = (h ^ octeti[i]) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * `<Id>`-ul articolului: produsul simplu, sau o combinatie anume a lui.
 *
 * ═══ ⚠ COMBINATIA SE DA CA OBIECT, NU CA TITLU ═══
 *
 * Titlul se schimba cand comerciantul redenumeste o valoare („Roșu" → „Roșu aprins"), iar Pepita
 * cere anume ca `<Id>` sa NU se schimbe cand se schimba datele produsului. De aceea identitatea se
 * ia din `uid`-ul combinatiei, care nu se muta niciodata.
 *
 * ⚠ FORMA CU SIR RAMANE, si nu din politete fata de apelanti: combinatiile scrise inainte de
 * 08.09.2026 n-au `uid`, iar pentru ele raspunsul trebuie sa fie EXACT cel de pana acum, altfel
 * fiecare articol deja trimis s-ar naste din nou la ei. `uid`-ul e semanat din aceeasi amprenta,
 * tocmai ca cele doua drumuri sa dea acelasi rezultat in ziua trecerii.
 *
 * ⚠ Si tipul e STRUCTURAL, nu `VariantCombo`: modulul asta e chemat si din browser si din feed, si
 * un import catre `storefront/variants` ar fi facut un cerc (acela il importa pe el).
 */
export function idArticol(
  productId: string,
  combinatie: string | { title: string; uid?: string } | null,
): string {
  if (combinatie == null) return productId;
  const identitate = typeof combinatie === "string"
    ? amprentaCombinatie(combinatie)
    : (combinatie.uid && /^[0-9a-f]{16}$/.test(combinatie.uid)
        ? combinatie.uid
        : amprentaCombinatie(combinatie.title));
  return `${productId}${SEPARATOR}${identitate}`;
}

export interface IdDesfacut {
  productId: string;
  /** Amprenta combinatiei, sau `null` pentru un produs simplu. */
  amprenta: string | null;
}

/**
 * Desface un `<Id>` primit inapoi intr-o comanda.
 *
 * ⚠ NU CONFIRMA CA PRODUSUL EXISTA. Spune doar la ce se referea sirul; potrivirea
 * adevarata se face in baza, si acolo se cer DOI martori. Un `sku` care arata a
 * id de-al nostru dar nu are corespondent in baza trebuie sa ajunga in carantina,
 * nu sa fie legat de altceva.
 */
export function desfaIdArticol(brut: unknown): IdDesfacut | null {
  const s = typeof brut === "string" ? brut.trim() : "";
  if (!s) return null;
  const i = s.indexOf(SEPARATOR);
  const productId = i === -1 ? s : s.slice(0, i);
  const amprenta = i === -1 ? null : s.slice(i + SEPARATOR.length);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) return null;
  if (amprenta !== null && !/^[0-9a-f]{16}$/.test(amprenta)) return null;
  return { productId: productId.toLowerCase(), amprenta };
}
