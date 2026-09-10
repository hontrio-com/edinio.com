// Canonical-domain helpers for the public storefront (multi-tenant).
//
// A store is reachable at www.edinio.com/{slug} AND, if configured, at its own
// custom domain.
//
// ═══ INVARIANTA SEO (03.09.2026) ═══
//
// Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
// sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.
//
// Deci `storeBaseUrl` NU mai inseamna „adresa la care se indexeaza magazinul":
// pentru un magazin fara domeniu propriu, `www.edinio.com/{slug}` e adresa lui
// PUBLICA (linkuri in emailuri, feeduri, canonical propriu — o adresa
// `noindex` cu canonical catre ea insasi e corecta si inofensiva), dar pe
// platforma toate paginile lui poarta `X-Robots-Tag: noindex` (vezi
// `src/proxy.ts` si `src/lib/storefront/indexare-pe-platforma.ts`). Indexabil
// devine numai pe domeniul lui, unde canonicalul, sitemapul si robots-ul sunt
// ale lui.

export const PLATFORM_ORIGIN = "https://www.edinio.com";

/*
 * ⚠ O SINGURA LISTA DE GAZDE. Aici a stat, pana pe 03.09.2026, o a doua copie a
 * lui `isPlatformHost`, cu propria lista, citita de sitemap si de robots, in
 * timp ce proxy-ul si conectarea domeniilor citeau `src/lib/platform-hosts.ts`.
 * Se re-exporta de acolo, ca importurile existente sa mearga neschimbate si
 * ca lista sa nu se mai poata desparti.
 */
export { isPlatformHost } from "@/lib/platform-hosts";
import { esteDomeniulPropriu } from "@/lib/platform-hosts";
import { textCurat } from "@/lib/storefront/date-structurate";

/**
 * Adresa publica a unui magazin: domeniul propriu cand exista, altfel
 * `www.edinio.com/{slug}`. Vezi nota din capul fisierului: a doua NU e o adresa
 * indexabila.
 */
export function storeBaseUrl(business: { slug: string; custom_domain?: string | null }): string {
  return business.custom_domain
    ? `https://${business.custom_domain}`
    : `${PLATFORM_ORIGIN}/${business.slug}`;
}

/**
 * Codul de verificare Search Console care se INJECTEAZA in pagina, sau `null`.
 *
 * ⚠ NUMAI PE DOMENIUL PROPRIU. Pana pe 03.09.2026 se injecta si pe
 * `www.edinio.com/{slug}`, deci un comerciant putea revendica in Search Console
 * o proprietate `www.edinio.com/{slug}/` — adica o bucata din site-ul platformei
 * — pentru o vitrina care oricum nu se mai indexeaza acolo. Codul salvat ramane
 * in setari si devine activ singur in clipa in care domeniul e conectat si
 * cererea vine de pe el.
 */
export function verificareGooglePentru(
  gazda: string | null | undefined,
  business: { custom_domain?: string | null },
  token: string | null | undefined,
): string | null {
  const t = (token ?? "").trim();
  if (!t) return null;
  return esteDomeniulPropriu(gazda, business.custom_domain) ? t : null;
}

/**
 * Eticheta `<meta name="robots">` a vitrinei, dupa gazda pe care e servita.
 *
 * Al DOILEA strat al invariantei, sub antetul `X-Robots-Tag` pus de proxy (care
 * ramane primul si cel care acopera orice ruta). Fara el, HTML-ul vitrinei de pe
 * `www.edinio.com/{slug}` spunea `index, follow` (mostenit din layout-ul
 * radacina) in timp ce antetul spunea `noindex` — Google o ia pe cea mai
 * restrictiva, deci corect, dar doua semnale care se contrazic sunt exact felul
 * de lucru pe care cineva il „repara" gresit peste un an.
 *
 * Pe domeniul propriu nu se pune nimic: paginile mostenesc `index` si isi aplica
 * singure `noindex`-ul comerciantului. `undefined` inseamna „nu atinge".
 */
export function robotsVitrinaPeGazda(
  gazda: string | null | undefined,
  business: { custom_domain?: string | null },
): { index: false; follow: true } | undefined {
  return esteDomeniulPropriu(gazda, business.custom_domain) ? undefined : { index: false, follow: true };
}

/* ─── Store-level SEO overrides ──────────────────────────────────────────────
 *
 * Live in `store_settings.page_content.seo`. The merchant sets these in
 * Settings > SEO; when a field is empty we fall back to the auto-derived
 * defaults below. Both the Settings placeholders and the public page metadata
 * use the same derive helpers, so the live preview matches what actually ships.
 */

export interface StoreSeo {
  title?: string;
  description?: string;
  ogImage?: string | null;
  /** Advanced opt-in: hide the store homepage from search engines. */
  noindex?: boolean;
  /**
   * Google Search Console "HTML tag" verification token. Injectat in `<head>`
   * NUMAI cand cererea vine de pe domeniul propriu al magazinului — vezi
   * `verificareGooglePentru`; pe `www.edinio.com/{slug}` vitrina e `noindex`.
   */
  googleVerification?: string;
  /**
   * Paginile de politici scoase ANUME din Google, dupa segmentul din adresa
   * („retur", „termeni"...).
   *
   * Lista de EXCLUDERI, nu de includeri: politicile sunt indexabile implicit,
   * fiindca Google Merchant Center cere retur si termeni indexabili ca sa valideze
   * contul. O lista de includeri ar fi lasat toate magazinele existente pe dinafara.
   */
  politiciNoindex?: string[];
}

/** Recommended lengths — counters turn green inside [ideal_min, max], red past max. */
export const SEO_TITLE_IDEAL_MIN = 50;
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_IDEAL_MIN = 140;
export const SEO_DESCRIPTION_MAX = 160;

/**
 * Cat primeste descrierea scrisa pe o categorie (Produse > Categorii).
 *
 * Mai mult decat `SEO_DESCRIPTION_MAX`: Google taie oricum pe la 155-160 de caractere, iar
 * contorul din panou se inroseste acolo, dar textul comerciantului se publica asa cum l-a
 * scris, ca descrierea paginii principale. Peste prag salvarea il RESPINGE (nu-l taie pe
 * tacute); citirea il taie, fiindca in baza se poate scrie si ocolind actiunea.
 */
export const SEO_DESCRIERE_CATEGORIE_MAX = 300;

/*
 * Caractere invizibile care n-au ce cauta intr-o descriere: controalele C0 si C1 (fara tab si
 * rand nou, care devin spatiu mai jos), spatiile de latime zero, BOM-ul si controalele de
 * directie.
 *
 * ⚠ Un control de directie (U+202E) intoarce pe ecran textul de dupa el: in rezultatele Google
 * s-ar fi citit altceva decat vede comerciantul in panou. Iar NUL-ul (U+0000) il respinge
 * Postgres, deci ar fi picat TOT update-ul.
 */
const INVIZIBILE = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/**
 * Descrierea scrisa de om, adusa la forma in care se publica: fara etichete, fara caracterele
 * invizibile de mai sus, cu spatiile comprimate. Sirul gol (sau orice nu e sir) da `null`,
 * adica textul automat.
 *
 * `max` = taiere la cuvant, pentru CITIRE. Lipsa = fara taiere, pentru SALVARE: acolo un text
 * prea lung se refuza, nu se scurteaza.
 *
 * ⚠ Trece prin ACELASI `textCurat` ca datele structurate, iar iesirea nu se mai schimba la a
 * doua trecere. Deci ce se salveaza e exact ce apare in meta, og, twitter si JSON-LD. O regula
 * a doua, scrisa aici de mana, s-ar fi despartit de prima la prima modificare.
 */
export function curataTextSeo(brut: unknown, max?: number): string | null {
  if (typeof brut !== "string") return null;
  return textCurat(brut.replace(INVIZIBILE, ""), max ?? Number.POSITIVE_INFINITY) || null;
}

/** Read & normalize the SEO overrides out of a `page_content` JSON blob. */
export function parseStoreSeo(pageContent: unknown): StoreSeo {
  const seo = (pageContent as { seo?: unknown } | null)?.seo;
  if (!seo || typeof seo !== "object") return {};
  const s = seo as Record<string, unknown>;
  const out: StoreSeo = {};
  if (typeof s.title === "string" && s.title.trim()) out.title = s.title.trim();
  if (typeof s.description === "string" && s.description.trim()) out.description = s.description.trim();
  if (typeof s.ogImage === "string" && s.ogImage.trim()) out.ogImage = s.ogImage.trim();
  if (s.noindex === true) out.noindex = true;
  if (typeof s.googleVerification === "string" && s.googleVerification.trim()) out.googleVerification = s.googleVerification.trim();
  if (Array.isArray(s.politiciNoindex)) {
    out.politiciNoindex = s.politiciNoindex.filter((v): v is string => typeof v === "string" && !!v.trim());
  }
  return out;
}

/**
 * Default meta title for a store homepage when the merchant hasn't set one.
 * e.g. "Floraria Mea - Cluj-Napoca" or just "Floraria Mea".
 */
export function deriveStoreTitle(displayName: string, city?: string | null): string {
  const c = city?.trim();
  return c ? `${displayName} - ${c}` : displayName;
}

/** Default meta description for a store homepage when the merchant hasn't set one. */
export function deriveStoreDescription(opts: {
  tagline?: string | null;
  description?: string | null;
  displayName: string;
}): string {
  return (
    opts.tagline?.trim() ||
    opts.description?.trim().slice(0, 155) ||
    `Cumpara din ${opts.displayName} online.`
  );
}
