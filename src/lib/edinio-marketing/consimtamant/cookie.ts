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
 * Cookie-urile furnizorilor, impartite pe categoria care le indreptateste.
 *
 * ═══ ⚠ DE CE PE CATEGORII, SI CE STRICA O LISTA SINGURA ═══
 *
 * Forma veche avea o lista unica si o matura INTREAGA cand vreuna din categorii
 * lipsea (`if (!marketing || !statistici)`). Deci omul care alegea „doar
 * statistici" — alegerea cea mai des facuta cand cineva se uita atent la panou —
 * ramanea fara `_ga`: exact masuratoarea pe care TOCMAI o incuviintase.
 *
 * Pe dos era la fel: cine retragea numai marketingul pierdea si analiza.
 *
 * ⚠ SI `_gac_` STATEA IN PARTEA GRESITA. Vechiul prefix `_ga` prinde si
 * `_gac_<ID-CONT-ADS>`, care e scris de Google Ads si poarta legatura cu campania
 * — un cookie de RECLAMA numarat drept analiza. Cu impartirea de aici, el cade
 * unde ii e locul, si `_ga`/`_ga_<ID>` raman la statistici.
 *
 * ⚠ PREFIXE, NU DOAR NUME INTREGI. `_ga_<ID-UL-PROPRIETATII>` poarta id-ul in
 * chiar numele lui, si la fel `_gcl_*`. O lista de nume exacte ar fi lasat in
 * urma tocmai cookie-ul de masurare al Google, iar retragerea ar fi parut facuta.
 */
export const COOKIE_STATISTICI_EXACTE = ["_gid"] as const;
export const COOKIE_STATISTICI_PREFIXE = ["_ga"] as const;

export const COOKIE_MARKETING_EXACTE = [
  "_fbp", "_fbc", "_ttp", "_tt_enable_cookie", "_ttclid",
] as const;
export const COOKIE_MARKETING_PREFIXE = ["_gcl_", "_gac_"] as const;

/**
 * Sub ce categorie sta un cookie, sau `null` daca nu e al niciunui furnizor.
 *
 * ⚠ MARKETINGUL SE INTREABA PRIMUL. `_gac_` incepe si cu `_ga`; intrebat invers,
 * un cookie de reclama ar fi supravietuit retragerii marketingului.
 */
export function categoriaCookie(nume: string): "statistici" | "marketing" | null {
  if ((COOKIE_MARKETING_EXACTE as readonly string[]).includes(nume)) return "marketing";
  if ((COOKIE_MARKETING_PREFIXE as readonly string[]).some((p) => nume.startsWith(p))) return "marketing";
  if ((COOKIE_STATISTICI_EXACTE as readonly string[]).includes(nume)) return "statistici";
  if ((COOKIE_STATISTICI_PREFIXE as readonly string[]).some((p) => nume.startsWith(p))) return "statistici";
  return null;
}

/**
 * Se sterge cookie-ul asta, data fiind hotararea?
 *
 * ⚠ UN SINGUR LOC IN CARE SE HOTARASTE, chemat si din browser si de pe server.
 * Cele doua maturi trebuie sa stearga exact aceleasi lucruri: una scapa ce e pe
 * `.edinio.com`, cealalta ce e scris din JavaScript.
 */
export function eCookieDeMaturat(
  nume: string,
  acordat: { statistici: boolean; marketing: boolean },
): boolean {
  const c = categoriaCookie(nume);
  return c !== null && acordat[c] !== true;
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
