/**
 * Plaja de coduri AWB alocata prin contract.
 *
 * ═══ DE CE EXISTA MODUL ASTA ═══
 *
 * Documentatia: „`codAwb` trebuie sa fie un cod de awb din plaja alocata
 * clientului daca se lucreaza cu plaja, altfel acest camp nu va fi trecut si se va
 * genera in mod automat."
 *
 * Sunt deci DOUA moduri, si primul e mult mai sigur pentru noi. Cu codul stiut
 * INAINTE de apel:
 *
 *   - garda de idempotenta din registru poate fi chiar codul;
 *   - raspunsul lui `POST /api/awb` — al carui format documentatia NU il descrie —
 *     nu ne mai intereseaza;
 *   - confirmarea „chiar s-a creat?" se ia din `GET /api/awb/{cod}`, o citire
 *     gratuita si repetabila.
 *
 * ═══ ⚠ ALOCAREA NU SE FACE AICI ═══
 *
 * Consumarea unui cod e o scriere concurenta: doua comenzi expediate in aceeasi
 * secunda nu au voie sa primeasca acelasi numar. Se face in baza, cu
 * `posta_aloca_cod()` — un singur `update … returning`, deci randul se incuie.
 *
 * Fisierul asta tine numai partea PURA: validarea configurarii si previzualizarea.
 * `formeazaCod` OGLINDESTE `lpad(...)` din functia SQL — daca se schimba una, se
 * schimba amandoua. Autoritatea ramane SQL-ul; asta e doar pentru ce se arata
 * omului inainte sa salveze.
 */

export type PlajaConfig = {
  /** Partea nenumerica din fata („LN"). Poate fi si goala. */
  prefix: string;
  /** Capetele intervalului, inclusive. */
  deLa: number;
  panaLa: number;
  /** Cate cifre are partea numerica; se completeaza cu zerouri in fata. */
  cifre: number;
};

/** Lungimea la care arata toate exemplele din documentatie. */
export const LUNGIME_COD_ASTEPTATA = 13;

/**
 * Numar → cod, ca in SQL.
 *
 * ⚠ Numarul mai lung decat `cifre` NU se taie: taiat, ar iesi un cod din alta
 * plaja, poate a altui client. Se lasa intreg, iar `problemePlaja` opreste
 * configurarea inainte sa se ajunga aici.
 */
export function formeazaCod(prefix: string, numar: number, cifre: number): string {
  const cifreValid = Number.isInteger(cifre) && cifre > 0 ? cifre : 1;
  return `${prefix ?? ""}${String(Math.trunc(numar)).padStart(cifreValid, "0")}`;
}

/** Cate coduri mai sunt de consumat. */
export function codurileRamase(p: PlajaConfig, urmator: number): number {
  return Math.max(0, Math.floor(p.panaLa) - Math.floor(urmator) + 1);
}

/**
 * Ce nu e in regula cu o plaja, in cuvintele comerciantului.
 *
 * ⚠ Se verifica INAINTE de salvare. O plaja gresita nu da nicio eroare la
 * configurare — da coduri pe care Posta le respinge la fiecare expediere, iar
 * refuzul vine intr-un format pe care nu-l putem traduce.
 */
export function problemePlaja(p: Partial<PlajaConfig>): string[] {
  const probleme: string[] = [];
  const prefix = (p.prefix ?? "").trim();
  const deLa = Number(p.deLa);
  const panaLa = Number(p.panaLa);
  const cifre = Number(p.cifre);

  if (!Number.isInteger(deLa) || deLa < 0) probleme.push("primul numar din plaja trebuie sa fie un intreg pozitiv");
  if (!Number.isInteger(panaLa) || panaLa < 0) probleme.push("ultimul numar din plaja trebuie sa fie un intreg pozitiv");
  if (!Number.isInteger(cifre) || cifre < 1 || cifre > 28) probleme.push("numarul de cifre trebuie sa fie intre 1 si 28");

  if (probleme.length) return probleme;

  if (deLa > panaLa) probleme.push("primul numar din plaja e mai mare decat ultimul");
  if (!/^[A-Za-z0-9]*$/.test(prefix)) probleme.push("prefixul poate contine doar litere si cifre");

  /* Un numar mai lung decat plafonul de cifre ar iesi din plaja. */
  if (String(panaLa).length > cifre) {
    probleme.push(
      `ultimul numar (${panaLa}) are ${String(panaLa).length} cifre, mai multe decat cele ${cifre} configurate`,
    );
  }

  return probleme;
}

/**
 * Ce e in regula, dar merita spus.
 *
 * ⚠ Lungimea codului e o AVERTIZARE, nu o oprire. Toate exemplele din
 * documentatie au 13 caractere (si `awbRetur` e declarat `char 13`), dar noi n-am
 * vazut niciodata o plaja adevarata — deci nu avem dreptul sa refuzam una care
 * arata altfel. Comerciantul o are din contract; noi doar ii spunem ca nu seamana.
 */
export function avertismentePlaja(p: PlajaConfig): string[] {
  if (problemePlaja(p).length) return [];

  const av: string[] = [];
  const exemplu = formeazaCod(p.prefix, p.deLa, p.cifre);
  if (exemplu.length !== LUNGIME_COD_ASTEPTATA) {
    av.push(
      `Codurile ies de ${exemplu.length} caractere (${exemplu}), dar toate exemplele din `
      + `documentatia Postei au ${LUNGIME_COD_ASTEPTATA}. Verifica prefixul si numarul de cifre.`,
    );
  }
  return av;
}
