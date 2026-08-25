/**
 * Ritmul catre eMAG, numarat INTR-UN SINGUR LOC.
 *
 * ═══ ⚠ GALEATA DIN MEMORIE NU POATE NUMARA CE FAC CELELALTE INSTANTE ═══
 *
 * `client.ts` are de mult o galeata cu jetoane, si e bine ca o are: taie varfurile locale
 * fara sa coste nimic. Dar traieste in memoria instantei, iar aceeasi cheie de vanzator e
 * folosita din mai multe locuri deodata:
 *
 *   cronul, pe o instanta          3/s
 *   importul, pe alta              3/s
 *   un buton apasat de om          3/s
 *   un webhook sosit intre timp    3/s
 *
 * Fiecare crede ca are bugetul intreg. eMAG vede suma.
 *
 * ⚠ Iar depasirea nu se plateste doar cu un 429: documentatia lor spune ca si cererile
 * INVALIDE se numara in limita. Deci bugetul ars e chiar cel prin care trebuie sa plece o
 * mișcare de stoc dupa o vanzare — iar aceea intarziata inseamna supravanzare.
 *
 * ═══ ⚠ SE CADE DESCHIS, NU INCHIS ═══
 *
 * Daca baza nu raspunde, cererea PLEACA. Doua motive, si sunt hotaratoare:
 *
 *   1. Avem deja o a doua plasa care nu tine de baza — antetele lor si 429-ul, in
 *      `franeazaDupaAntete`. Depasirea costa o intarziere, nu date pierdute.
 *   2. Cazuta inchis, o pana a bazei ar opri TOATE cererile catre eMAG ale tuturor
 *      magazinelor — inclusiv confirmarile de comenzi si mișcarile de stoc. Adica un
 *      incident mult mai mare decat cel de care ne aparam.
 */

import { createHash } from "node:crypto";
import { ceruJeton } from "@/lib/marketplace/ritm-impartit";
import type { EmagAuth } from "./client";

/**
 * Cheia contului la ei, nu a magazinului la noi.
 *
 * ⚠ Limita e a VANZATORULUI. Doua magazine Edinio legate la acelasi cont eMAG impart
 * acelasi buget, iar numarate separat ar fi trecut de el impreuna fara sa vada nimeni.
 *
 * ⚠ Numele de utilizator e o adresa de e-mail, deci nu se scrie ca atare intr-o masa de
 * contorizare: se trece printr-o amprenta. Cheia ramane stabila si nu mai duce nicaieri.
 */
export function cheiaContului(auth: Pick<EmagAuth, "username" | "tara">): string {
  const brut = `${auth.tara ?? "ro"}:${(auth.username ?? "").trim().toLowerCase()}`;
  return createHash("sha256").update(brut).digest("hex").slice(0, 32);
}

/** Limitele lor, din documentatie. */
export const LIMITE_RITM = {
  /** `/order*` */
  comenzi: { limita: 12, fereastraMs: 1000 },
  /** Tot restul, cumulat. */
  restul: { limita: 3, fereastraMs: 1000 },
  /*
   * ⚠ `documentation/find_by_eans` are limite PROPRII, mai stranse decat restul API-ului,
   * si una dintre ele e ZILNICA. Pe un plafon de zi, o galeata din memorie nu poate face
   * nimic: instanta moare cu mult inainte sa se termine ziua.
   */
  eanSecunda: { limita: 5, fereastraMs: 1000 },
  eanMinut: { limita: 200, fereastraMs: 60_000 },
  eanZi: { limita: 5000, fereastraMs: 86_400_000 },
} as const;

/*
 * ═══ ⚠ CORPUL GENERIC S-A MUTAT IN `@/lib/marketplace/ritm-impartit` (26.08.2026) ═══
 *
 * Auditul Trendyol a aratat ca acolo nu exista NICIUN limitator impartit — doar o pauza de
 * 350 ms in bucla cronului, in memoria unei instante. Regula era scrisa si probata, dar statea
 * intr-un folder pe care Trendyol n-avea cum sa-l vada. A treia oara intr-o zi cand se
 * intampla asta (dupa `randCitit` si dupa compare-and-set-ul cozii).
 *
 * ⚠ Ce a ramas aici e ce e ANUME al eMAG: cheia contului (numele lor de utilizator e o adresa
 * de e-mail), limitele lor, si plafonul ZILNIC de la `find_by_eans`, care n-are pereche la
 * alt furnizor.
 *
 * ⚠ Reexportate cu acelasi nume, ca `ritm.test.ts` si apelantii sa nu se schimbe deloc.
 */
export { ceruJeton, asteaptaJetonImpartit, type RaspunsJeton } from "@/lib/marketplace/ritm-impartit";

/**
 * Mai are contul cautari dupa cod de bare azi?
 *
 * ⚠ NU se asteapta si NU se cade deschis pe plafonul zilnic — sunt cele doua deosebiri
 * fata de ferestrele de o secunda:
 *
 *   asteptarea ar fi de ore. Cronul are `maxDuration = 60`.
 *   trecutul cu vederea ar insemna sa lovim plafonul lor si sa ne trezim cu ruta inchisa
 *     pentru tot restul zilei — inclusiv pentru publicarile care chiar contau.
 *
 * ⚠ Dar tot NU se cade inchis la o pana a BAZEI: `ceruJeton` raspunde `ok` cand nu poate
 * intreba, iar asta e voit. Se opreste numai cand baza spune limpede „s-a terminat".
 */
export async function maiAreBugetZilnicEan(auth: Pick<EmagAuth, "username" | "tara">): Promise<boolean> {
  const r = await ceruJeton(
    `emag:${cheiaContului(auth)}:ean:zi`,
    LIMITE_RITM.eanZi.limita,
    LIMITE_RITM.eanZi.fereastraMs,
  );
  return r.ok;
}
