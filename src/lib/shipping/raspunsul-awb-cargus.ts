/**
 * Ce a intors Cargus cand am cerut un AWB, si daca acel ceva chiar e un numar de AWB.
 *
 * ═══ ⚠ DE CE NU AJUNGE `String(raspuns)` ═══
 *
 * Asa era scris: `String(barCode ?? "").trim()`, cu o singura paza, pe sirul gol si pe
 * „null". Dar `String({})` da `"[object Object]"`, care nu e nici gol, nici „null": trecea
 * si se scria pe comanda ca numar de expediere. De acolo mai departe, eticheta se cere pe el,
 * urmarirea il intreaba, iar anularea il trimite la Cargus. Nimic nu mai da eroare, si nimeni
 * nu afla pana nu suna clientul.
 *
 * ⚠ SI NU E O TEMERE TEORETICA: chiar modulul lor oficial de WooCommerce (1.6.0,
 * `class-cargus-admin.php`, randurile 1254-1300) trateaza DOUA forme ale raspunsului la
 * `Awbs`:
 *
 *   * `is_string($awbs)` inseamna codul de bare;
 *   * `is_array($awbs)` inseamna EROARE, iar mesajul sta ori in `status`/`command`, ori pe
 *     `Error`-ul fiecarui element.
 *
 * Deci Cargus chiar intoarce obiecte pe raspunsuri cu HTTP 200. Modulul lor le citeste ca
 * esec; noi le scriam ca succes.
 *
 * ═══ ⚠ CE SE ACCEPTA, SI DE CE ATAT ═══
 *
 * Un cod de bare e o valoare PRIMITIVA: sir sau numar. In documentatia lor e mereu numeric,
 * de noua cifre (`804523201`, `804713464`), dar formatul nu se ingheata aici: un curier isi
 * poate schimba seria, si o regula prea stransa ar refuza AWB-uri ADEVARATE. Se cere doar
 * atat: primitiva, fara spatii, destul de lunga cat sa nu fie un cuvant de stare.
 *
 * Un mesaj de eroare are mereu spatii, deci cade singur pe regula asta.
 */

/** Cate caractere are cel mai scurt cod pe care il socotim plauzibil. */
const LUNGIME_MINIMA = 5;

/** Ce a iesit din `String()` peste lucruri care nu sunt coduri. */
const GUNOAIE = new Set(["null", "undefined", "nan", "true", "false", "[object object]"]);

export type VerdictAwbCargus =
  | { fel: "cod"; cod: string }
  | { fel: "eroare"; mesaj: string }
  | { fel: "necunoscut"; mesaj: string };

function esteObiect(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * Mesajul de eroare din formele pe care le citeste chiar modulul lor.
 *
 * ⚠ Se cauta, nu se presupune: formele sunt trei, si le-am luat pe toate din `is_array`-ul
 * lor, nu din inchipuire.
 */
function mesajulLorDeEroare(x: unknown, adancime = 0): string | null {
  if (adancime > 4) return null;
  if (typeof x === "string") return x.trim() || null;

  if (Array.isArray(x)) {
    const bucati = x.map((e) => mesajulLorDeEroare(e, adancime + 1)).filter(Boolean);
    return bucati.length ? bucati.join(" ") : null;
  }

  if (esteObiect(x)) {
    /* `{ status: 400, command: "..." }`, forma pe care modulul o citeste prima. */
    if (typeof x.command === "string" && x.command.trim()) return x.command.trim();
    /* `{ Error: "..." }`, pe fiecare element al listei. */
    if (typeof x.Error === "string" && x.Error.trim()) return x.Error.trim();
    if (typeof x.message === "string" && x.message.trim()) return x.message.trim();
    /* Lista de obiecte: fiecare poate purta `Error`. */
    for (const v of Object.values(x)) {
      const gasit = mesajulLorDeEroare(v, adancime + 1);
      if (gasit) return gasit;
    }
  }
  return null;
}

/**
 * Codul de bare din raspunsul lor, sau motivul pentru care nu e unul.
 *
 * ⚠ `necunoscut` NU e acelasi lucru cu `eroare`, si deosebirea costa bani: la „eroare" stim
 * ca expedierea nu s-a facut, la „necunoscut" NU stim. Un colet care POATE a plecat nu are
 * voie sa fie reincercat de la sine. Vezi `registru-operatii-externe`.
 */
export function codulAwbCargus(raspuns: unknown): VerdictAwbCargus {
  /*
   * ⚠ Obiectul se cerceteaza INAINTEA primitivei, fiindca el poarta eroarea. Altfel un
   * `{ Error: "..." }` ar cadea pe ramura de jos si ar iesi „necunoscut", adica un slot
   * blocat degeaba pentru un refuz pe care ei ni l-au spus limpede.
   */
  if (esteObiect(raspuns)) {
    /* Forma documentata a succesului pe `Awbs/WithgetAwb`: obiect cu `BarCode`. */
    const dinObiect = codDinPrimitiva((raspuns as Record<string, unknown>).BarCode);
    if (dinObiect) return { fel: "cod", cod: dinObiect };

    const mesaj = mesajulLorDeEroare(raspuns);
    if (mesaj) return { fel: "eroare", mesaj };
    return { fel: "necunoscut", mesaj: "Cargus a raspuns cu un obiect fara cod si fara motiv" };
  }

  const cod = codDinPrimitiva(raspuns);
  if (cod) return { fel: "cod", cod };

  if (typeof raspuns === "string" && raspuns.trim()) {
    /* Un sir care nu trece drept cod e aproape sigur textul lor de eroare. */
    return { fel: "eroare", mesaj: raspuns.trim() };
  }
  return { fel: "necunoscut", mesaj: "Cargus nu a returnat niciun numar de AWB" };
}

/** Un cod plauzibil dintr-o primitiva, sau `null`. */
function codDinPrimitiva(x: unknown): string | null {
  if (typeof x !== "string" && typeof x !== "number") return null;
  if (typeof x === "number" && !Number.isFinite(x)) return null;

  const s = String(x).trim();
  if (s.length < LUNGIME_MINIMA) return null;
  if (GUNOAIE.has(s.toLowerCase())) return null;
  /* Fara spatii si fara semne de punctuatie: un mesaj de eroare are mereu si una, si alta. */
  if (!/^[A-Za-z0-9-]+$/.test(s)) return null;
  return s;
}
