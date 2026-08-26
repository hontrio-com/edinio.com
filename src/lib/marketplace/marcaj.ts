/**
 * Unde se muta marcajul de timp dupa o trecere. `null` = nu se muta nimic.
 *
 * Sta aici, si nu in cron, ca sa poata fi PROBAT. Regula pare de doua randuri si
 * are trei capcane, toate calcate deja o data:
 *
 *  1. Cursorul e cod mort daca nu se citeste decat cand `ok` e fals — deci
 *     trunchierea TREBUIE sa stinga `ok`, altfel se sare la „acum" si se pierd
 *     exact paginile necitite.
 *  2. Cursorul se scrie COMPENSAT cu suprapunerea. La citire se scad `overlapMs`
 *     din marcaj (ca sa nu se piarda nimic in cusatura dintre rulari), dar
 *     cursorul e exact: scris nemodificat, fereastra urmatoare ar porni inaintea
 *     lui, iar daca cele 500 de comenzi citite incap in mai putin decat
 *     suprapunerea — adica exact rafala care produce trunchierea — s-ar reciti la
 *     nesfarsit aceleasi pagini.
 *  3. Fara cursor NU se muta nimic. E singurul caz de blocaj ramas, si trebuie sa
 *     fie zgomotos, nu tacut.
 *
 *  4. ⚠ A PATRA, GASITA PE 26.08.2026: „am citit tot" inseamna „tot din FEREASTRA", nu „tot
 *     pana acum". Furnizorii care nu ingaduie decat doua saptamani intr-o cerere taie fereastra
 *     tacut. Un magazin oprit o luna cerea deci ultimele doua saptamani, le citea cu bine, iar
 *     marcajul sarea la „acum" — si cele saisprezece zile dintre ele se pierdeau DEFINITIV.
 *
 *     Nu incet, nu cu o eroare: definitiv, si tocmai pentru magazinul care avea cel mai mult
 *     nevoie de recuperare.
 *
 *     De-aia `fereastraSfarsitMs` spune pana unde s-a citit CU ADEVARAT. Cand e mai devreme
 *     decat clipa de start a rularii, marcajul se opreste acolo, iar trecerea urmatoare
 *     continua de-acolo — fereastra cu fereastra, pana se ajunge din urma.
 */
export function marcajUrmator(
  r: {
    ok: boolean;
    cursorMs?: number;
    /**
     * Sfarsitul ferestrei chiar citite. Lipsa inseamna „fereastra a ajuns pana acum" — asa se
     * poarta integrarile care nu taie intervalul, si de-aia campul e optional.
     */
    fereastraSfarsitMs?: number;
  },
  p: { runStartMs: number; overlapMs: number },
): number | null {
  if (r.ok) {
    /* ⚠ Cel mai devreme dintre cele doua: niciodata mai departe decat s-a citit. */
    return r.fereastraSfarsitMs != null
      ? Math.min(p.runStartMs, r.fereastraSfarsitMs)
      : p.runStartMs;
  }
  if (r.cursorMs != null) return r.cursorMs + p.overlapMs;
  return null;
}
