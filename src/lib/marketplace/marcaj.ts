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
 */
export function marcajUrmator(
  r: { ok: boolean; cursorMs?: number },
  p: { runStartMs: number; overlapMs: number },
): number | null {
  if (r.ok) return p.runStartMs;
  if (r.cursorMs != null) return r.cursorMs + p.overlapMs;
  return null;
}
