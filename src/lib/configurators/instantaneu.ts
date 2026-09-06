/**
 * Instantaneul configuratiei, citit dintr-o comanda.
 *
 * ═══ ⚠ DE CE UN CITITOR APARTE, CAND SCRIEM TOT NOI ═══
 *
 * `orders.items` e jsonb, si randul din baza poate fi scris acum trei luni, de o versiune de cod
 * care nu mai exista. Se poate si edita din panou, si rescrie de un import, si atinge de mana din
 * consola. Un `as InstantaneuConfiguratie` ar fi o promisiune pe care n-o poate tine nimeni: prima
 * comanda cu forma veche ar fi aruncat la randare, adica exact pe ecranul din care comerciantul
 * trebuie sa afle ce are de facut.
 *
 * ⚠ SI CE COSTA daca citim prea putin: linia arata „Cana personalizata x1 — 89 lei" si atat.
 * Atelierul nu afla ce gravura, iar comerciantul cu doua cani gravate diferit vede DOUA RANDURI
 * IDENTICE pe fiecare ecran.
 *
 * ═══ CE SE CERE, SI CE E DE BUNAVOIE ═══
 *
 * Se cere `rezumat`-ul: el e singurul lucru pe care il citeste un om. Fara macar un rand de
 * rezumat, instantaneul nu are ce arata si se intoarce `null` — mai bine nimic decat o eticheta
 * goala care sugereaza ca s-a pierdut ceva.
 *
 * Restul — id-uri, numar de versiune, amprenta, valorile brute — sunt pentru urmarire si pentru
 * o eventuala recalculare, si lipsa lor nu opreste afisarea.
 */

import { normalizeazaValori, MAX_CAMPURI, MAX_LUNGIME_TEXT, type Valori } from "./valori";
import type { RandRezumat } from "./rezumat";

/**
 * Cat se citeste dintr-un instantaneu.
 *
 * ⚠ MARGINILE SUNT ALE SCRIERII, NU NUMERE ALESE AICI, si asta e o reparatie.
 *
 * Erau 50 de randuri si 200 de caractere, cu nota „aceleasi margini ca la linia de cos”. Dar
 * cumparatorul poate SCRIE 2000 de caractere (`MAX_LUNGIME_TEXT`), iar `maxCaractere` e un camp
 * OPTIONAL pe care publicarea nu-l cere. Deci o placuta cu 320 de caractere se scria intreaga in
 * comanda si se citea TAIATA la 200 — fara puncte de suspensie, fara niciun semn, pe toate
 * suprafetele: panoul, emailurile, pagina de confirmare. Atelierul grava primele 200 si taia in
 * mijlocul unui cuvant.
 *
 * La fel randurile: un configurator cu 60 de campuri pierdea 10 de pe fiecare ecran.
 *
 * ⚠ Marginile RAMAN, si nu sunt o formalitate: instantaneul e `jsonb` vechi de luni, editabil
 * din panou, iar un sir de zece mii de caractere ajuns aici dintr-o editare de mana ar rupe
 * asezarea in toate trei locurile. Dar ele se iau acum de la CE SE POATE SCRIE, deci nu mai pot
 * taia nimic legitim. Cine schimba una dintre ele le schimba pe amandoua dintr-un loc.
 */
const MAX_RANDURI = MAX_CAMPURI;
const MAX_TEXT = MAX_LUNGIME_TEXT;

export interface InstantaneuCitit {
  configuratorId: string | null;
  versiuneId: string | null;
  numarVersiune: number | null;
  amprenta: string | null;
  /**
   * Cat cantareste configuratia, in grame, PER BUCATA. Zero cand comanda n-o poarta.
   *
   * ⚠ Zero, nu `null`: cel care cantareste coletul ADUNA. O valoare care poate lipsi l-ar fi
   * obligat sa aleaga el ce face cu lipsa, in fiecare din cele doua locuri unde se aduna
   * greutate — si comenzile scrise inainte de campul asta sunt tocmai cele in care greseala
   * ar fi trecut neobservata.
   */
  grame: number;
  /** Ce citeste omul. Cel putin un rand, altfel instantaneul nu se intoarce deloc. */
  rezumat: RandRezumat[];
  /** Valorile brute, pentru urmarire. Poate fi gol. */
  valori: Valori;
}

export function citesteInstantaneul(brut: unknown): InstantaneuCitit | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const o = brut as Record<string, unknown>;

  const rezumat = citesteRezumatul(o.rezumat);
  if (rezumat.length === 0) return null;

  return {
    configuratorId: sir(o.configuratorId),
    versiuneId: sir(o.versiuneId),
    numarVersiune: typeof o.numarVersiune === "number" && Number.isFinite(o.numarVersiune)
      ? o.numarVersiune : null,
    amprenta: sir(o.amprenta),
    grame: grameBune(o.grame),
    rezumat,
    // ⚠ Trece prin normalizare, nu se ia asa cum vine: forma poate fi de acum trei luni.
    valori: normalizeazaValori(o.valori),
  };
}

/** Instantaneul unei linii de comanda, cand are unul. */
export function instantaneulLiniei(linie: unknown): InstantaneuCitit | null {
  if (!linie || typeof linie !== "object") return null;
  return citesteInstantaneul((linie as Record<string, unknown>).configuratie);
}

function sir(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.slice(0, MAX_TEXT) : null;
}

/**
 * Gramele, curatate.
 *
 * ⚠ Se refuza tot ce nu e un numar finit si pozitiv, si nu se incearca nicio conversie din text.
 * `"250"` scris de o editare de mana ar fi trecut printr-un `Number()` binevoitor, dar `"greu"` ar
 * fi iesit `NaN` si ar fi otravit toata adunarea coletului: un singur rand stricat ar fi facut ca
 * intreaga comanda sa plece la curier cu o greutate nefinita. Un numar negativ ar fi SCAZUT din
 * colet. In amandoua cazurile raspunsul corect e zero — greutatea produsului din catalog ramane,
 * si numai sporul necunoscut lipseste.
 */
function grameBune(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Randurile de rezumat, curatate.
 *
 * ⚠ Se taie si ca numar, si ca lungime. Textele astea se pun pe un ecran de panou, pe un email si
 * pe continutul unui AWB; un sir de zece mii de caractere ajuns acolo dintr-o comanda veche sau
 * dintr-o editare de mana ar fi rupt asezarea in toate trei.
 */
/** Cate id-uri de fisier se primesc pe un rand. Plafonul campului e 10; aici e plasa. */
const MAX_FISIERE = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function citesteRezumatul(brut: unknown): RandRezumat[] {
  if (!Array.isArray(brut)) return [];
  const out: RandRezumat[] = [];
  for (const x of brut.slice(0, MAX_RANDURI)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (typeof r.eticheta !== "string" || typeof r.valoare !== "string") continue;
    if (!r.eticheta.trim() || !r.valoare.trim()) continue;
    /*
     * ⚠ Id-urile de fisier se citesc, dar cu aceeasi neincredere ca restul: ele ajung intr-o
     * ADRESA (`/api/configurator/fisier/<id>`), iar instantaneul poate fi scris de o versiune
     * veche de cod sau atins dintr-o consola. Se primeste doar forma de uuid — orice altceva
     * ar fi insemnat sa lasam continutul comenzii sa compuna calea.
     */
    const fisiere = Array.isArray(r.fisiere)
      ? r.fisiere
        .filter((f): f is string => typeof f === "string" && UUID.test(f))
        .slice(0, MAX_FISIERE)
      : [];
    out.push({
      id: typeof r.id === "string" ? r.id.slice(0, MAX_TEXT) : "",
      eticheta: r.eticheta.slice(0, MAX_TEXT),
      valoare: r.valoare.slice(0, MAX_TEXT),
      scurt: r.scurt === true,
      ...(fisiere.length ? { fisiere } : {}),
    });
  }
  return out;
}
