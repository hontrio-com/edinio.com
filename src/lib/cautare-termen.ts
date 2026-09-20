/**
 * Curata termenul de cautare inainte sa intre intr-un filtru `or(...)` de PostgREST.
 *
 * ⚠ VIRGULA SI PARANTEZELE SUNT SINTAXA ACOLO, nu text. Un client numit
 * „Pop, Ion" ar fi rupt lista de conditii in doua, iar cautarea ar fi intors
 * ori nimic, ori o eroare - si niciuna n-ar fi aratat de ce.
 *
 * ⚠ `%` si `_` sunt jokerii lui `ilike`: lasate asa, o cautare dupa „50%" ar fi
 * potrivit orice. Se scot si ele, impreuna cu `*`, jokerul in forma PostgREST.
 *
 * ⚠ Sta in modulul lui, nu langa actiune: un fisier cu `"use server"` are voie
 * sa exporte numai functii asincrone, iar asta trebuie sa ramana o functie
 * curata, care se poate proba fara nicio baza de date.
 */
export function curataTermen(brut: string): string {
  return brut
    .replace(/[,()%*\_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
