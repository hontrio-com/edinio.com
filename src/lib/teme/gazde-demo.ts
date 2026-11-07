import { bareHost, esteDomeniulPropriu } from "@/lib/platform-hosts";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SUBDOMENIILE DEMO ALE TEMELOR (etapa 19 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Decizia 2 din „Temele”: demo-ul unei teme sta pe `<cheie>.edinio.com` (local `<cheie>.localhost:3000`), un magazin
  adevarat cu datele ei. `proxy.ts` rescrie tot ce vine pe subdomeniu spre magazinul demo, iar vitrina isi scrie acolo
  adresele fara slug, ca pe un domeniu propriu (`adreseFaraSlug`).

  Fara dependente: il citesc proxy-ul, paginile vitrinei si pagina „Teme”. `lib/teme/teme.ts` tine aceleasi perechi in
  `Tema` (`cheie`, `slugDemo`); o proba le tine impreuna.
*/

/**
 * Cheile temelor, in ordinea lor (etapa 24: temele 2-30 vin pe loturi). Aici, nu in `teme.ts`: fisierul n-are dependente,
 * il citeste proxy-ul. O proba tine lista egala cu `TEME`.
 */
export const CHEI_TEME = [
  "jupiter", "mercur", "venus", "terra", "marte",
  "saturn", "uranus", "neptun", "sirius",
] as const;

/** Tema (subdomeniul) -> slugul magazinului ei demo. Un `Map`, nu un obiect: `constructor.edinio.com` nu e o tema. */
export const MAGAZINE_DEMO: ReadonlyMap<string, string> = new Map(CHEI_TEME.map((c) => [c, `tema-${c}`]));

/** Gazdele pe care traiesc subdomeniile demo: productia si, local, `*.localhost` (Chrome le trimite la 127.0.0.1). */
const GAZDA_DEMO = /^([a-z0-9-]+)\.(edinio\.com|localhost)$/;

/** Slugul magazinului demo servit pe gazda data (`jupiter.edinio.com` -> `tema-jupiter`), sau `null`. */
export function slugDemoDupaGazda(host: string | null | undefined): string | null {
  const potrivire = GAZDA_DEMO.exec(bareHost(host ?? ""));
  return potrivire ? MAGAZINE_DEMO.get(potrivire[1]) ?? null : null;
}

/**
 * Vitrina isi scrie adresele FARA slug (`basePath` gol): pe domeniul propriu al magazinului si pe subdomeniul demo al
 * temei lui, unde proxy-ul pune singur slugul in fata.
 *
 * ⚠ Doar pentru adrese. Indexarea, contul de client si verificarea Search Console raman pe `esteDomeniulPropriu`:
 * subdomeniul demo nu e domeniul nimanui, deci acolo vitrina ramane `noindex` si fara zona de cont.
 */
export function adreseFaraSlug(
  host: string | null | undefined,
  magazin: { slug: string; custom_domain: string | null | undefined },
): boolean {
  return esteDomeniulPropriu(host, magazin.custom_domain) || slugDemoDupaGazda(host) === magazin.slug;
}

/**
 * Semnul magazinului demo al unei teme, in `page_content` (pus de `scripts/teme/seamana-demo.ts` din `Tema.setariDemo`).
 * Aplicarea unei teme nu-l scrie niciodata in magazinul comerciantului.
 */
export const CHEIE_MAGAZIN_DEMO = "magazin_demo";

export function esteMagazinDemo(pageContent: unknown): boolean {
  return !!pageContent && typeof pageContent === "object" && (pageContent as Record<string, unknown>)[CHEIE_MAGAZIN_DEMO] === true;
}

/**
 * Raspunsul la o comanda pe magazinul demo (etapa 19.2): nimic nu se rezerva, nu se scrie si nu pleaca. Fara poarta,
 * un vizitator ar fi plasat o comanda cu ramburs, iar emailul de confirmare ar fi plecat la adresa scrisa de el.
 * ⚠ Fara diacritice: il citeste clientul, in vitrina, ca restul refuzurilor comenzii (gasit la proba 19.4).
 */
export const MESAJ_COMENZI_OPRITE = "Acesta e un magazin demo: poti incerca tot, dar comenzile sunt oprite.";

/** Slugurile magazinelor demo, rezervate: un comerciant nu-si poate face magazinul pe unul din ele. */
export function esteSlugDeMagazinDemo(slug: string): boolean {
  return slug.startsWith("tema-");
}
