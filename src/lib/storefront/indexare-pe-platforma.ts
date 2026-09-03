/**
 * ═══ INVARIANTA SEO A PLATFORMEI (03.09.2026) ═══
 *
 * Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
 * sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.
 *
 * Adica:
 *   - www.edinio.com/, /preturi, /blog/..., /ajutor/..., /vs/..., /industrii/...
 *     se indexeaza: sunt ale platformei;
 *   - www.edinio.com/{slug} si TOT ce e sub el (/product/..., /magazin/...,
 *     /politici/..., paginile proprii, cautarea, previzualizarea) NU se
 *     indexeaza, desi raman public accesibile;
 *   - magazin-client.ro (domeniul propriu al comerciantului) se indexeaza, cu
 *     sitemapul, robots-ul, canonicalul si setarile SEO ale comerciantului.
 *
 * ═══ CUM SE APLICA ═══
 *
 * Prin antetul `X-Robots-Tag: noindex, follow`, pus de `src/proxy.ts` pe ORICE
 * raspuns servit pe gazda platformei al carui prim segment de cale e un magazin
 * PUBLICAT. Un antet, nu o eticheta `<meta>` in fiecare pagina: asa o ruta de
 * vitrina adaugata maine e protejata fara ca cineva sa-si aminteasca de regula.
 *
 * ⚠ NU prin `robots.txt` cu `Disallow`. Un `Disallow` ii interzice lui
 * Googlebot sa CEARA pagina, deci n-ar mai vedea niciodata `noindex` — iar o
 * adresa interzisa, dar cu linkuri spre ea, poate ramane in index fara continut.
 * `noindex` cere ca pagina sa poata fi citita.
 *
 * ═══ DE CE MODULUL ASTA E PUR ═══
 *
 * Proxy-ul cere un client Supabase viu, dar hotararea din el nu. Aici sta
 * hotararea, fara `next/server` si fara baza: proxy-ul doar o aplica, iar
 * probele o judeca pe toate ramurile ei (si pe proxy insusi, cu o baza de proba,
 * in `src/proxy.test.ts`).
 */

/** Numele antetului. Scris o singura data, ca proxy-ul si probele sa citeasca aceeasi cheie. */
export const ANTET_ROBOTS = "X-Robots-Tag";

/**
 * Valoarea pentru vitrinele servite pe gazda platformei. `follow` ramane:
 * linkurile catre domeniul propriu (canonicalul, cand exista) merita urmate.
 */
export const NOINDEX_VITRINA = "noindex, follow";

/**
 * Valoarea pentru gazdele de desfasurare (`*.vercel.app`). Acolo nu e nimic de
 * urmat: e o copie a site-ului la o adresa pe care n-o cautam indexata deloc.
 */
export const NOINDEX_DESFASURARE = "noindex";

/**
 * Domeniul propriu al unui magazin, IMPREUNA cu sanatatea lui. `sanatos: null`
 * inseamna „inca neverificat" si se trateaza ca sanatos — doar un `false`
 * dovedit opreste redirectul (vezi nota din proxy despre `okai.ro`).
 */
export type TintaProprie = { domeniu: string; sanatos: boolean | null };

/**
 * Ce stim despre primul segment al unei cai de pe gazda platformei.
 *
 * ⚠ DOUA INTREBARI, NU UNA. Pana pe 03.09.2026 cache-ul din proxy tinea doar
 * `TintaProprie | null`, iar `null` insemna deopotriva „magazin fara domeniu
 * propriu" si „nu e un magazin". Pentru redirect era destul; pentru `noindex`
 * nu mai e: un magazin fara domeniu trebuie sa primeasca antetul, iar o adresa
 * care nu e magazin (404, sau o ruta a site-ului) nu trebuie sa-l primeasca —
 * inclusiv la a doua cerere, cand raspunsul vine din cache.
 */
export type RezolvareSlugPlatforma = {
  /** Primul segment e slug-ul unui magazin PUBLICAT. */
  esteMagazin: boolean;
  /** Domeniul propriu al magazinului, cand il are. Mereu `null` cand nu e magazin. */
  tinta: TintaProprie | null;
};

/** Raspunsul pentru un segment care nu e slug de magazin publicat. */
export const NU_E_MAGAZIN: Readonly<RezolvareSlugPlatforma> = Object.freeze({ esteMagazin: false, tinta: null });

/** Randul din `businesses` de care are nevoie hotararea. `null` = nu exista magazin publicat cu slug-ul asta. */
export type RandMagazinPentruProxy = {
  custom_domain: string | null;
  custom_domain_healthy: boolean | null;
} | null;

/** Traducerea randului din baza in ce stie proxy-ul. */
export function rezolvareDinRand(rand: RandMagazinPentruProxy): RezolvareSlugPlatforma {
  if (!rand) return NU_E_MAGAZIN;
  const domeniu = (rand.custom_domain ?? "").trim().toLowerCase();
  return {
    esteMagazin: true,
    tinta: domeniu ? { domeniu, sanatos: rand.custom_domain_healthy } : null,
  };
}

/**
 * Cat se tine minte o rezolvare, in milisecunde.
 *
 * ⚠ SURSA UNICA (04.09.2026). Cele doua numere stateau in proxy si erau pasate
 * ca obiect; o inversare a lor ar fi trecut prin toate probele, fiindca nicio
 * proba nu masoara timpul. Aici sunt langa regula care le foloseste, iar proba
 * verifica invarianta care conteaza: „fara tinta" se tine MAI SCURT decat „cu tinta".
 *
 *   - `gasit` (60s): sub timpul de propagare DNS al oricarei schimbari de domeniu,
 *     deci invechirea e invizibila pentru comerciant;
 *   - `negasit` (15s): un magazin tocmai publicat sau un domeniu tocmai conectat
 *     trebuie sa se vada in cateva secunde, nu peste un minut — exact in clipa in
 *     care omul se uita daca a mers.
 */
export const TTL_REZOLVARE = Object.freeze({ gasit: 60_000, negasit: 15_000 });

/**
 * Cat se tine minte o rezolvare.
 *
 * Aceeasi regula ca inainte de refacere, dinadins: „fara domeniu propriu" — fie
 * ca e magazin, fie ca nu e — se tine SCURT. Doar o tinta gasita se tine lung.
 */
export function ttlRezolvare(r: RezolvareSlugPlatforma, ttl: { gasit: number; negasit: number } = TTL_REZOLVARE): number {
  return r.tinta ? ttl.gasit : ttl.negasit;
}

/** Ce face proxy-ul cu o cerere de pe gazda platformei, dupa primul ei segment. */
export type HotarareVitrina =
  /** Nu e magazin: pagina platformei sau 404. Nimic de facut. */
  | { fel: "nimic" }
  /** Magazin cu domeniu propriu sanatos: vizitatorul merge acolo, pastrand calea. */
  | { fel: "redirect"; tinta: TintaProprie }
  /** Magazin servit CHIAR pe platforma: primeste `noindex`. */
  | { fel: "noindex" }
  /** Nu se poate afla (baza nu raspunde): 503, „reveniti", fara cache. */
  | { fel: "indisponibil" };

/**
 * Hotararea, pe toate ramurile ei:
 *
 *   - nu se stie (baza a picat)                     → indisponibil (503)
 *   - nu e magazin                                  → nimic
 *   - magazin, domeniu sanatos (sau neverificat)    → redirect (ca inainte)
 *   - magazin, domeniu sanatos, dar previzualizare  → noindex (previzualizarea
 *     ramane pe origine, ca sa poata fi pusa in cadrul panoului; dar e tot o
 *     vitrina servita pe platforma)
 *   - magazin fara domeniu                          → noindex
 *   - magazin cu domeniu DOVEDIT stricat            → noindex (e servit aici,
 *     fiindca redirectul spre un domeniu mort i-ar lua si ultima cale de acces)
 *
 * ═══ DE CE „INDISPONIBIL" SI NU „NIMIC" LA ESEC (04.09.2026) ═══
 *
 * Prima forma raspundea la o citire picata ca pentru un 404: nimic. Adica exact
 * in clipa in care baza nu raspunde, o vitrina de pe platforma ar fi fost servita
 * FARA `noindex` si fara redirect — si Google, daca trecea atunci, o indexa.
 * Invarianta spune „ORICE cerere"; „aproape orice" nu e o invarianta.
 *
 * 503 e raspunsul pe care il da deja ramura domeniilor proprii in acelasi caz:
 * spune adevarul („reveniti"), nu se indexeaza si nu se cacheaza. Vitrina oricum
 * n-ar fi putut randa fara baza. Iar paginile platformei nu ajung aici: primul
 * lor segment e in `NON_STORE_SEGMENTS` — inclusiv `robots.txt` si `sitemap.xml`,
 * puse acolo anume ca un 503 sa nu-l faca pe Google sa opreasca crawlarea.
 */
export function hotarasteVitrinaPePlatforma(r: RezolvareSlugPlatforma | null, previzualizare: boolean): HotarareVitrina {
  if (r === null) return { fel: "indisponibil" };
  if (!r.esteMagazin) return { fel: "nimic" };
  if (r.tinta && r.tinta.sanatos !== false && !previzualizare) return { fel: "redirect", tinta: r.tinta };
  return { fel: "noindex" };
}

/** Interfata minima a cache-ului, ca proba sa poata folosi unul adevarat sau unul de proba. */
export interface CacheRezolvari {
  get(cheie: string): RezolvareSlugPlatforma | undefined;
  set(cheie: string, valoare: RezolvareSlugPlatforma, ttlMs?: number): void;
}

/**
 * Rezolva un slug prin cache, si prin baza doar cand cache-ul nu stie.
 *
 * ⚠ ESECUL NU SE TINE MINTE SI NU SE PREFACE IN RASPUNS. O interogare picata
 * nu inseamna „nu e magazin": se intoarce `null` („nu se stie"), proxy-ul
 * raspunde 503, si cererea urmatoare intreaba din nou. Daca am retine esecul,
 * o pana de o clipa a bazei ar face 15 secunde de vitrine fara `noindex`.
 */
export async function rezolvaSlugPlatforma(
  slug: string,
  cache: CacheRezolvari,
  cauta: (slug: string) => Promise<{ data: RandMagazinPentruProxy; error: unknown }>,
  ttl: { gasit: number; negasit: number } = TTL_REZOLVARE,
): Promise<RezolvareSlugPlatforma | null> {
  const dinCache = cache.get(slug);
  if (dinCache !== undefined) return dinCache;
  const { data, error } = await cauta(slug);
  if (error) return null;
  const r = rezolvareDinRand(data);
  cache.set(slug, r, ttlRezolvare(r, ttl));
  return r;
}
