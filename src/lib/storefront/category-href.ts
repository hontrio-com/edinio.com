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

export function hrefCategorie(basePath: string, nume: string): string {
  return `${radacinaMagazin(basePath)}?cat=${encodeURIComponent(nume)}`;
}
