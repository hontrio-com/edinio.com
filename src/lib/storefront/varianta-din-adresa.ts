import { identitateCombinatie } from "./variante-identitate";
import { optiunileDinTitlu, type VariantsData } from "./variants";

/**
 * Varianta ceruta prin adresa paginii de produs: `?varianta=<identitatea combinatiei>`.
 *
 * ═══ ⚠⚠ DE CE (17.09.2026) ═══
 *
 * Specificatia Google Merchant, la `link`: pentru variante, adresa trebuie sa deschida pagina cu varianta
 * DEJA aleasa, iar pretul si disponibilitatea de pe pagina trebuie sa fie ale ei. Toate ofertele pe
 * varianta plecau cu adresa produsului, deci Google gasea pe pagina alt pret decat in feed (sau niciunul,
 * fiindca pagina astepta o alegere) si putea respinge oferta pentru nepotrivire.
 *
 * ⚠ Se foloseste IDENTITATEA combinatiei (`uid`, sau amprenta titlului la cele vechi), nu titlul: un
 * titlu cu diacritice si „ / ” ar fi iesit urat in adresa, iar la o redenumire linkurile deja trimise la
 * Google ar fi murit. Vezi `variante-identitate.ts`.
 */
export const PARAMETRU_VARIANTA = "varianta";

/** Adresa paginii de produs care deschide combinatia data. */
export function adresaCuVarianta(adresaProdus: string, combo: { title: string; uid?: string }): string {
  const sep = adresaProdus.includes("?") ? "&" : "?";
  return `${adresaProdus}${sep}${PARAMETRU_VARIANTA}=${encodeURIComponent(identitateCombinatie(combo))}`;
}

/**
 * Optiunile de preselectat din cautarea adresei (`window.location.search`), sau `null`.
 *
 * ⚠ Doar o combinatie ACTIVA, si doar daca titlul ei se poate citi cu certitudine inapoi in optiuni (vezi
 * `optiunileDinTitlu`). Altfel pagina ramane fara alegere, exact ca pana acum: mai bine o alegere lipsa
 * decat alta marime decat cea din reclama.
 */
export function optiunileDinAdresa(variante: VariantsData | null, cautare: string): Record<string, string> | null {
  if (!variante) return null;
  let ceruta: string | null;
  try {
    ceruta = new URLSearchParams(cautare).get(PARAMETRU_VARIANTA);
  } catch {
    return null;
  }
  if (!ceruta) return null;
  const combo = variante.combinations.find((c) => c.enabled && identitateCombinatie(c) === ceruta);
  return combo ? optiunileDinTitlu(variante.options, combo.title) : null;
}

/*
 * Pentru `useSyncExternalStore` in paginile de produs. Cautarea nu se schimba cat pagina e deschisa (o
 * alta varianta aleasa nu rescrie adresa), deci abonarea n-are ce asculta.
 */
export function abonareCautare(): () => void {
  return () => {};
}

export function citesteCautarea(): string {
  return window.location.search;
}
