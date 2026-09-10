import { PLATFORM_ORIGIN } from "@/lib/seo";
import { r2KeyFromUrl } from "@/lib/r2-url";
import { LATIME_PNG, cheieOptimizabila, sursaCerePngInEmail } from "@/lib/latimi-imagini";

/** Cat de inalt apare logoul in antetul emailului: `max-height` din `storeEmailShell`. */
export const INALTIME_LOGO_EMAIL = 48;

/** Cat de lat poate aparea: tabelul emailului are 560px. */
export const LATIME_MAXIMA_LOGO_EMAIL = 520;

export interface Dimensiuni {
  latime: number;
  inaltime: number;
}

/**
 * Cheia R2 a logoului, cand el trebuie sa plece prin PNG; altfel `null`.
 *
 * ⚠ CHEIA TREBUIE SA FIE CHIAR CALEA ADRESEI, fara interogare si fara ancora. `r2KeyFromUrl` cauta
 * `.r2.dev/` oriunde in sir, deci ar fi gasit o cheie si in `https://altcineva.ro/x.r2.dev/logos/…`
 * sau in `…?u=https://pub-y.r2.dev/logos/…`. Ruta ar fi cautat-o apoi in depozitul NOSTRU, n-ar fi
 * gasit-o, iar emailul ar fi purtat o poza rupta.
 */
function cheiePentruPng(adresa: string): string | null {
  let u: URL;
  try {
    u = new URL(adresa.trim());
  } catch {
    return null;
  }
  if (u.search || u.hash) return null;
  const cheie = r2KeyFromUrl(u.href);
  if (!cheie || u.pathname !== `/${cheie}`) return null;
  return cheieOptimizabila(cheie) && sursaCerePngInEmail(cheie) ? cheie : null;
}

/**
 * Adresa logoului, asa cum trebuie sa plece intr-un email.
 *
 * ═══ ⚠ DE CE NU PLEACA ADRESA DIN BAZA ═══
 *
 * Logourile se pastreaza cu terminatia `.webp` (toate cele 35 de pe platforma, pe 10.09.2026; 9
 * dintre ele sunt de fapt octeti PNG serviti ca `image/webp`), iar pe vitrina asta e bine:
 * browserul le arata cu transparenta cu tot. In email nu: Gmail nu afiseaza WebP-ul asa cum e, il
 * TRANSFORMA IN JPG (caniemail.com: „Gmail converts file to jpg"), iar JPG n-are transparenta. La
 * BricoSmart, sub cei 312.324 de pixeli transparenti ai logoului culoarea stocata e (0, 0, 0), deci
 * in emailul „Comanda noua" logoul a iesit pe un dreptunghi negru. Reclamat de comerciant, cu poza.
 * Masurat pe 10.09.2026: 11 din cele 35 de logouri ieseau asa, cu cel putin 1% din suprafata neagra.
 *
 * Deci WebP-ul, si AVIF-ul, pleaca prin `/api/img` cu `f=png`: ruta taie o singura data o varianta
 * PNG, cu transparenta intreaga, o pastreaza in depozit si trimite clientul de email la ea. `sharp`
 * citeste sursa dupa continut, deci si PNG-urile cu nume de WebP trec la fel.
 *
 * ⚠ CE SE LASA NEATINS, SI DE CE:
 *   - PNG, JPG si GIF: se vad bine in email si azi;
 *   - o adresa care nu e a depozitului nostru: n-avem ce taia;
 *   - o cheie pe care ruta ar refuza-o (`cheieOptimizabila`): adresa compusa ar da 404, adica o
 *     poza RUPTA in loc de una pe fond negru. Mai rau decat defectul.
 *
 * ⚠ GAZDA E A PLATFORMEI, NU DOMENIUL MAGAZINULUI: `www.edinio.com` raspunde mereu, pe cand un
 * domeniu propriu cu DNS-ul stricat ar rupe logoul din toate emailurile magazinului. Adresa nu se
 * vede nicaieri in email, deci nu poarta marca nimanui.
 *
 * ⚠ FARA `q` IN ADRESA: la PNG ruta nu-l citeste. Iar forma asta n-a fost ceruta niciodata inainte
 * de reparatie, deci niciun cache nu tine pentru ea raspunsul vechi, cel catre WebP.
 */
export function logoPentruEmail(adresa: string | null | undefined): string | null {
  if (!adresa) return null;
  const cheie = cheiePentruPng(adresa);
  if (!cheie) return adresa;
  return `${PLATFORM_ORIGIN}/api/img?p=${encodeURIComponent(cheie)}&w=${LATIME_PNG}&f=png`;
}

/**
 * Atributele `width` si `height` ale logoului PNG, din dimensiunile ORIGINALULUI.
 *
 * ═══ ⚠ DE CE ATRIBUTE, DESI STILUL ARE DEJA `max-height` ═══
 *
 * Outlook pe Windows (motorul Word) nu stie `max-height` pe `<img>` si, fara atribute HTML, arata
 * poza la marimea ei reala. WebP-ul nu-l arata deloc, deci pana acum acolo logoul lipsea; PNG-ul de
 * 640px l-ar fi adus inapoi URIAS: 34 din cele 35 de logouri ies mai inalte de 48px, douasprezece
 * ies 640x640, iar unul 640x1138. Cu atribute, Outlook il arata cat trebuie. Ceilalti clienti se uita
 * la stil, iar inaltimea de aici e aceeasi pe care o dau si ei.
 *
 * Inaltimea e cea a antetului, fara marire. Latimea se ia din proportia originalului si se
 * plafoneaza la latimea tabelului; atunci inaltimea scade pe masura.
 */
export function atributeLogo(original: Dimensiuni | null | undefined): Dimensiuni | null {
  if (!original) return null;
  const { latime: W, inaltime: H } = original;
  if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) return null;
  /* Inaltimea variantei PNG: ruta o taie la `LATIME_PNG`, fara s-o mareasca. */
  const inaltimeVarianta = (H * Math.min(LATIME_PNG, W)) / W;
  let inaltime = Math.max(1, Math.round(Math.min(INALTIME_LOGO_EMAIL, inaltimeVarianta)));
  let latime = Math.max(1, Math.round((W * inaltime) / H));
  if (latime > LATIME_MAXIMA_LOGO_EMAIL) {
    latime = LATIME_MAXIMA_LOGO_EMAIL;
    inaltime = Math.max(1, Math.round((H * latime) / W));
  }
  return { latime, inaltime };
}
