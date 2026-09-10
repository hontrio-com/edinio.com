/**
 * Ordinea in care grila de catalog isi aseaza produsele.
 *
 * ═══ DE CE E O FUNCTIE SEPARATA ═══
 *
 * Aceeasi ordine o cer DOUA locuri care trebuie sa spuna acelasi lucru: felia de
 * produse pe care o randeaza `pagina-magazin.tsx`, si descrierea de cautare a
 * paginii, care numeste primele produse din grila. Scrisa de doua ori, prima
 * nepotrivire ar fi fost o descriere care promite in Google alte produse decat cele
 * pe care le vede cine da clic.
 *
 * Compunerea e cea din browser (`MiniStoreRenderer`): ce cere adresa, apoi ce a
 * ales comerciantul pentru pagina de catalog, apoi implicitul magazinului. Trimis
 * brut, un `?sort=` lipsa insemna pe server „ordinea de catalog" si in browser
 * „newest", deci alte pagini (vezi comentariul de la apelant).
 *
 * ⚠ Descrierea descrie CANONICALUL, iar canonicalul nu poarta `?sort=`. Deci
 * pentru ea `sortareDinAdresa` e sirul gol, oricare ar fi adresa ceruta.
 *
 * ⚠ `??`, nu `||`, pe implicitul magazinului: exact ca in randare si in browser.
 * Schimbat numai aici, un `default_sort` gol ar fi dat alta ordine decat grila.
 */
export function sortareEfectivaGrila(
  sortareDinAdresa: string,
  sortareImplicitaPagina: string,
  pageContent: unknown,
): string {
  const sortareImplicita =
    (pageContent as { sort_options?: { default_sort?: string } } | null | undefined)?.sort_options?.default_sort
    ?? "newest";
  return sortareDinAdresa || sortareImplicitaPagina || sortareImplicita;
}
