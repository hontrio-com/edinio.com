import { PLATFORM_ORIGIN } from "@/lib/seo";

/**
 * IndexNow: anunțăm la Bing adresele NOASTRE nou apărute sau schimbate.
 *
 * ═══ CE E ȘI CE NU E ═══
 *
 * Un ping. Motorul primește lista și decide singur dacă și când indexează —
 * `200` înseamnă „am primit", nu „am indexat". Nu ajută la Google, care nu
 * folosește protocolul; e pentru Bing și pentru ecosistemul care îl consumă.
 *
 * ═══ ⚠ POARTA: DE UNDE POT VENI ADRESELE ═══
 *
 * Cea mai scumpă greșeală posibilă aici nu e o cerere picată, ci o cerere
 * REUȘITĂ cu adrese greșite. Două feluri:
 *
 *   1. **O vitrină de magazin.** `www.edinio.com/{slug}` poartă
 *      `X-Robots-Tag: noindex`. I-am spune lui Bing „indexează asta" despre o
 *      pagină care spune „nu mă indexa" — exact contradicția pentru care s-a
 *      retras `sitemap-magazine.xml` pe 03.09.
 *   2. **Domeniul propriu al unui comerciant.** Nu e al nostru: n-am putea
 *      dovedi proprietatea, iar cererea ar fi respinsă — dar după ce am
 *      trimis-o.
 *
 * De aceea `adreseDeAnuntat` NU primește adrese și nu le construiește: primește
 * intrările sitemapului platformei, așa cum le face `intrariPlatforma()`. O
 * vitrină nu poate intra fiindcă nu e acolo — iar că nu e acolo e deja probat de
 * `sitemap.test.ts`, care cere ca fiecare adresă din sitemapul platformei să
 * înceapă cu un segment rezervat.
 *
 * Poarta e deci o CONSTRUCȚIE, nu o disciplină: nu există niciun apel prin care
 * cineva să strecoare o adresă, fiindcă funcția nu acceptă una.
 *
 * ═══ ⚠ DE CE NU DIN `after()`, LA SALVAREA ARTICOLULUI ═══
 *
 * Ar fi fost mai rapid și e locul evident. Trei motive, în ordinea greutății:
 *
 *   1. `after()` rulează DUPĂ ce răspunsul a plecat. Un eșec nu se vede nicăieri
 *      și nicio probă nu inspectă un corp HTTP trimis: un set greșit de adrese
 *      ar fi invizibil în tsc, eslint, probe și build.
 *   2. Un articol PROGRAMAT (status `published`, dată în viitor) devine viu fără
 *      nicio acțiune de om, deci `after()` nu-l prinde niciodată. Ar fi trebuit
 *      oricum un cron — și atunci sunt două căi care fac același lucru, dintre
 *      care una nu se poate proba.
 *   3. O CIORNĂ salvată ar fi fost anunțată: 404 trimise la motoare, plus
 *      scurgerea slugului unui articol nepublicat.
 *
 * Cronul singur le rezolvă pe toate trei, fiindcă întreabă SITEMAPUL, nu
 * acțiunea: o ciornă, un articol programat neajuns încă la scadență, unul
 * `noindex` sau unul cu `canonical_url` către alt site pur și simplu nu sunt
 * acolo. Prețul e întârzierea, mărginită de ritmul cronului.
 */

/** Adresa protocolului. Una singură: Bing o împarte cu ceilalți participanți. */
export const ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * Unde stă fișierul cu cheia.
 *
 * ⚠ NU la rădăcină ca `/{cheie}.txt`, deși protocolul o îngăduie. Un segment de
 * rădăcină cu nume imprevizibil ar trece prin proxy ca posibil slug de magazin
 * și ar interoga baza la fiecare verificare a lui Bing. Protocolul permite orice
 * locație, declarată în `keyLocation` — deci o folosim pe una fixă, trecută în
 * `NON_STORE_SEGMENTS`.
 */
export const CALE_CHEIE = "/indexnow-key.txt";

/** Cel mult atâtea într-o cerere. Protocolul îngăduie 10.000; noi stăm mult sub. */
export const MAXIM_PE_CERERE = 100;

/** O intrare de sitemap, exact cum o face `intrariPlatforma()`. */
export interface IntrareSitemap {
  url: string;
  lastModified?: Date | string;
}

/** Ce știm despre o adresă anunțată înainte. */
export interface Anuntata {
  url: string;
  lastmod: string | null;
}

/**
 * Cheia, din mediu. Lipsă, IndexNow e STINS cu totul.
 *
 * Fail-closed dinadins: fără cheie, fișierul de verificare n-ar exista, deci
 * orice trimitere ar primi `403` și ne-ar apropia de pragul de spam degeaba.
 */
export function cheia(): string | null {
  const k = (process.env.INDEXNOW_KEY ?? "").trim();
  /* Protocolul cere între 8 și 128 de caractere, doar hexazecimale. O cheie
     scurtă sau cu alte caractere e o greșeală de configurare, nu o cheie. */
  return /^[a-f0-9]{8,128}$/i.test(k) ? k : null;
}

/** Data unei intrări, ca ISO, sau `null` dacă adresa n-are dată adevărată. */
function iso(x: Date | string | undefined): string | null {
  if (!x) return null;
  const d = x instanceof Date ? x : new Date(x);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Ce e de anunțat: adresele NOI, plus cele a căror dată s-a schimbat.
 *
 * ⚠ O adresă fără `lastModified` se anunță O SINGURĂ DATĂ. Paginile scrise în
 * cod n-au dată adevărată (vezi nota din `sitemap.ts`: o dată inventată pe 23 de
 * adrese ieftinește adevărul de pe celelalte), iar fără regula asta ar fi
 * reanunțate la fiecare rulare — adică exact retrimiterea pe care documentația
 * o descurajează.
 */
export function adreseDeAnuntat(
  dinSitemap: readonly IntrareSitemap[],
  anuntateInainte: readonly Anuntata[],
): string[] {
  const stiute = new Map(anuntateInainte.map((a) => [a.url, a.lastmod]));
  const deTrimis: string[] = [];

  for (const intrare of dinSitemap) {
    if (!intrare.url.startsWith(`${PLATFORM_ORIGIN}/`) && intrare.url !== PLATFORM_ORIGIN) {
      /* Nu se poate întâmpla cu intrările lui `intrariPlatforma()`, dar poarta
         se scrie oricum: e ultima linie dintre noi și o adresă străină trimisă
         în numele nostru. */
      continue;
    }
    if (!stiute.has(intrare.url)) {
      deTrimis.push(intrare.url);
      continue;
    }
    const acum = iso(intrare.lastModified);
    if (!acum) continue; // fără dată adevărată: anunțată o dată, atât
    const inainte = stiute.get(intrare.url) ?? null;
    if (!inainte || new Date(acum) > new Date(inainte)) deTrimis.push(intrare.url);
  }
  return deTrimis;
}

/** Corpul cererii, în forma cerută de protocol. */
export function corpCerere(urluri: readonly string[], cheie: string): Record<string, unknown> {
  const gazda = new URL(PLATFORM_ORIGIN).host;
  return {
    host: gazda,
    key: cheie,
    keyLocation: `${PLATFORM_ORIGIN}${CALE_CHEIE}`,
    urlList: [...urluri],
  };
}

/**
 * Ce înseamnă codul primit.
 *
 * ⚠ `202` E O REUȘITĂ, și e ușor de tratat greșit. Înseamnă „am primit, dar
 * verific cheia" — deci adresa a intrat, iar retrimiterea ei ar fi tocmai
 * purtarea care duce la `429`.
 */
export function esteReusita(cod: number): boolean {
  return cod === 200 || cod === 202;
}

/** Ce s-a întâmplat, în cuvinte, pentru jurnal. */
export function explicaCod(cod: number): string {
  switch (cod) {
    case 200: return "primit";
    case 202: return "primit, cheia se verifica";
    case 400: return "corp gresit";
    case 403: return "cheia nu se potriveste cu fisierul de la keyLocation";
    case 422: return "adresele nu apartin gazdei, sau cheia nu se potriveste";
    case 429: return "prea des — ne banuiesc de spam";
    default: return `raspuns neasteptat (${cod})`;
  }
}
