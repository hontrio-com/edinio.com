import { DURATA_ZILE } from "./stare";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UNDE STA HOTARAREA, SI CE SE MATURA CAND SE RETRAGE
  ═══════════════════════════════════════════════════════════════════════════════
*/

export const NUME_COOKIE = "edinio_consimtamant";

/**
 * ⚠ FARA `HttpOnly`, DINADINS.
 *
 * Un cookie ascuns de JavaScript ar fi mai greu de furat — dar retragerea trebuie
 * sa lucreze pe loc, in browser, fara sa astepte serverul nostru. Un drept al
 * omului n-are voie sa depinda de faptul ca serverele noastre raspund. Aici nu e
 * un secret: e propria lui hotarare, pe care el trebuie sa o poata sterge.
 *
 * ⚠ `SameSite=Lax`, nu `Strict`: cu `Strict`, cine vine dintr-o reclama n-ar
 * aduce cookie-ul la prima cerere, si i-am arata bannerul din nou desi a ales.
 */
export const MAX_AGE = DURATA_ZILE * 86_400;

export function atributeCookie(secure: boolean): string {
  return `Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * Cookie-urile furnizorilor, de sters la retragere.
 *
 * ⚠ PREFIXE, NU DOAR NUME INTREGI. `_ga_<ID-UL-PROPRIETATII>` poarta id-ul in
 * chiar numele lui, si la fel `_gcl_*`. O lista de nume exacte ar fi lasat in
 * urma tocmai cookie-ul de masurare al Google, iar retragerea ar fi parut facuta.
 */
export const COOKIE_FURNIZORI_EXACTE = [
  "_gid", "_fbp", "_fbc", "_ttp", "_tt_enable_cookie", "_ttclid",
] as const;

export const COOKIE_FURNIZORI_PREFIXE = ["_ga", "_gcl_"] as const;

export function eCookieDeMaturat(nume: string): boolean {
  if ((COOKIE_FURNIZORI_EXACTE as readonly string[]).includes(nume)) return true;
  return (COOKIE_FURNIZORI_PREFIXE as readonly string[]).some((p) => nume.startsWith(p));
}

/**
 * Martorii pe care ii lasa pixelii, si care ajuta potrivirea pe server.
 *
 * ⚠ EXISTA NUMAI DACA PIXELUL A RULAT, adica numai cu consimtamant. Deci
 * trimiterea lor nu adauga nicio hotarare legala noua — sunt deja acolo pentru ca
 * omul a acceptat. `_fbc` poarta id-ul clicului pe reclama, adica legatura
 * directa cu campania platita: cea mai mare crestere de potrivire pe care o avem.
 */
export const MARTORI = { fbp: "_fbp", fbc: "_fbc", ttp: "_ttp" } as const;
