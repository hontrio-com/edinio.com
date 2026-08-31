/**
 * O citire de administrare care ARUNCĂ dacă baza a răspuns cu eroare.
 *
 * ⚠ FRATELE LUI `cere()` DIN `src/lib/blog/citire.ts`, ȘI E AICI DIN ACELAȘI
 * MOTIV. Acolo, în runda a patra, toate cele 23 de citiri publice luau doar
 * `data`: o bază căzută nu dădea o eroare, ci o listă goală — adică „articolul
 * nu există", adică 404, adică Google scoate pagina din index.
 *
 * La administrare păgubitul e altul, dar paguba e de aceeași formă: ecranul
 * spune „nu ai niciun redactor" în timp ce baza are trei, iar omul n-are de
 * unde să bănuiască, fiindcă un ecran gol arată exact ca un ecran gol pe drept.
 *
 * ⚠ STĂ ÎNTR-UN FIȘIER PROPRIU, NU LÂNGĂ ACȚIUNI, ȘI NU DIN GUST. Fișierele cu
 * `"use server"` au voie să exporte NUMAI funcții asincrone — o funcție ajutătoare
 * exportată de acolo e o eroare de compilare. De aceea `cereAdmin` a stat întâi
 * ca funcție locală în `blog.actions.ts`, și de aceea celelalte două module de
 * acțiuni n-o puteau folosi. Mutată aici, o pot chema toate trei.
 *
 * ⚠ CÂND SE ARUNCĂ ȘI CÂND NU:
 *
 *   * citirile chemate din COMPONENTE DE SERVER (paginile din `/admin`) trec pe
 *     aici — Next prinde aruncarea și arată marginea de eroare. „Nu am putut
 *     încărca acum" e un adevăr; „nu există nimic" e o minciună.
 *
 *   * acțiunile chemate din COMPONENTE CLIENT (butoanele) NU trec pe aici. Acolo
 *     cel care cheamă face `if ("error" in res) toast.error(res.error)`, iar o
 *     aruncare i-ar da omului eroarea generică a unei acțiuni de server în loc de
 *     mesajul scris pentru el. Acolo se întoarce `{ error: … }`.
 */
export function cereAdmin<T>(
  rezultat: { data: T; error: { message?: string } | null },
  unde: string,
): T {
  if (rezultat.error) {
    throw new Error(
      `[blog-admin] citirea „${unde}” a eșuat: ${rezultat.error.message ?? "eroare necunoscută"}. ` +
        "Se aruncă dinadins: o listă goală ar fi arătat ca „nu există nimic”.",
    );
  }
  return rezultat.data;
}
