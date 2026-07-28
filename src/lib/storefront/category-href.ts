/**
 * Adresa de filtrare pe categorie, scrisa intr-un singur loc.
 *
 * Sapte componente arata categorii ca linkuri (navigarea de catalog, trei
 * headere, footerul cu coloane, eroul cu categorii). Toate scriau sirul de
 * mana, iar toate scriau si un slash in plus.
 *
 * Slash-ul conteaza: `basePath` e gol pe domeniu propriu, deci acolo `/?cat=`
 * e chiar radacina si e corect. Pe adresa cu slug insa, `/magazin/?cat=x` ia
 * un 308 catre `/magazin?cat=x` — un drum dus-intors la fiecare click si o
 * pagina „cu redirectionare" in Search Console pentru fiecare categorie.
 */
export function radacinaMagazin(basePath: string): string {
  return basePath === "" ? "/" : basePath;
}

/**
 * Adresa de filtrare pe categorie, pornind de la RADACINA CATALOGULUI.
 *
 * Primul argument nu mai e `basePath`, ci `catalogRoot` din contextul de chrome:
 * catalogul nu e neaparat radacina magazinului. Normalizarea prin
 * `radacinaMagazin` ramane inauntru tocmai pentru ca functia sa fie idempotenta —
 * `"/x"` si `"/x/magazin"` trec neatinse, iar un `""` ramas dintr-un apel vechi
 * cu `basePath` da tot `"/"`, adica exact ce dadea si inainte. Fara ea, pe
 * domeniu propriu un apel scapat ar fi produs un `?cat=x` relativ, lipit de
 * pagina curenta.
 */
export function hrefCategorie(catalogRoot: string, nume: string): string {
  return `${radacinaMagazin(catalogRoot)}?cat=${encodeURIComponent(nume)}`;
}

/**
 * Adresa catalogului, cu o interogare deja compusa (fara semnul intrebarii).
 *
 * O foloseau, scrisa de mana, cele sapte casete de cautare din headere, ca sa
 * trimita vizitatorul la catalog cu `?q=`. Toate sapte scriau `${basePath}/` cu
 * slash inainte de interogare, adica un 308 la fiecare cautare pe adresa cu
 * slug — exact drumul dus-intors pe care `radacinaMagazin` exista sa il evite.
 */
export function hrefCatalog(catalogRoot: string, query?: string): string {
  const radacina = radacinaMagazin(catalogRoot);
  return query ? `${radacina}?${query}` : radacina;
}
