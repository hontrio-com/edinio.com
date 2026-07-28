import { slugify } from "@/lib/utils/slugify";

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
export function hrefCategorie(catalogRoot: string, nume: string, pePagina = false): string {
  const slug = pePagina ? slugCategorie(nume) : "";
  // Slug gol (un nume din caractere pe care `slugify` le arunca tot) inseamna ca
  // pagina de categorie n-ar avea adresa; atunci ramane forma cu interogare, care
  // functioneaza pentru orice nume. Mai bine un link mai urat decat unul rupt.
  return slug
    ? `${radacinaMagazin(catalogRoot)}/${slug}`
    : `${radacinaMagazin(catalogRoot)}?cat=${encodeURIComponent(nume)}`;
}

/**
 * Numele categoriei, ca segment de adresa.
 *
 * Categoriile n-au coloana `slug` in baza — produsele isi tin categoria ca TEXT,
 * chiar numele ei — deci segmentul se calculeaza din nume, iar ruta face drumul
 * invers cautand categoria al carei nume da acelasi segment. Consecinta stiuta:
 * doua categorii care dau acelasi segment (o redenumire care difera doar prin
 * diacritice) sunt aceeasi pagina; ruta alege prima si nu da eroare.
 *
 * Intoarce sirul gol cand numele nu produce niciun caracter folosibil.
 */
export function slugCategorie(nume: string): string {
  return slugify(nume);
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

/** Ancora grilei de produse. Traieste pe sectiunea `product_grid`. */
export const ANCORA_PRODUSE = "#produse";

/**
 * Unde duce un buton „vezi produsele", de oriunde ar fi apasat.
 *
 * Cat timp grila e pe pagina curenta, raspunsul e ancora ei: o derulare pe loc e
 * mai buna decat o navigare. Cand catalogul si-a luat pagina lui, elementul nu
 * mai exista in DOM, iar ancora devine un buton care nu face NIMIC si nu da
 * nicio eroare — exact soarta pe care ar fi avut-o singurul indemn la actiune al
 * hero-ului, cel mai apasat element al paginii principale.
 *
 * Semnul ca grila e aici nu e un flag in plus: `catalogRoot` e deja radacina
 * magazinului exact atunci cand catalogul n-a plecat nicaieri.
 */
export function hrefCatreProduse(chrome: { basePath: string; catalogRoot: string; isHome?: boolean }): string {
  const acasaAreGrila = chrome.isHome === true && chrome.catalogRoot === radacinaMagazin(chrome.basePath);
  return acasaAreGrila ? ANCORA_PRODUSE : chrome.catalogRoot;
}
