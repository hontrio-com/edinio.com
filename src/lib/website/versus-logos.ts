/**
 * Siglele concurenților, pentru rândul de deasupra titlului de pe paginile
 * „Edinio vs …".
 *
 * Fișierele sunt puse de client în `public/versus/` (13.08).
 *
 * ═══ DE CE O LISTĂ ȘI NU DOAR CĂILE ═══
 *
 * Siglele au forme foarte diferite: Shopify e o pungă aproape pătrată (0,88),
 * Cartum e un cuvânt lung cât cinci înălțimi (5,56). La ÎNĂLȚIME egală, Cartum
 * ar acoperi de vreo șase ori mai multă suprafață și ar strivi-o pe cealaltă.
 * Se egalizează GREUTATEA lor pe rând, nu înălțimea și nici suprafața — vezi
 * nota de la `PUTERE`, mai jos.
 *
 * ⚠ RAPORTUL E AL CUTIEI, NU AL DESENULUI, și se citește din `width`/`height`
 * scrise pe `<svg>`, nu din `viewBox`. Un `<img>` își ia proporția din atribute
 * când există; la Wix cele două chiar diferă (2,569 față de 2,484, fiindcă
 * viewBox-ul începe la -2,4). Aceeași scăpare a costat deja o dată, la
 * biblioteca de integrări.
 *
 * ═══ TOATE FIȘIERELE SUNT STRÂNSE PE DESEN ═══
 *
 * ⚠ ASTA E CE FACE GOLURILE EGALE, și e lucrul care a scăpat de două ori.
 *
 * Un `<img>` ocupă CUTIA fișierului, nu desenul din ea. Golul străveziu dinăuntru
 * se adaugă la spațiul dintre sigle, iar cum fiecare fișier avea alt gol, golurile
 * de pe ecran ieșeau diferite — deși cele dintre CUTII erau egale la pixel.
 * Măsurat înainte: la stânga lui „vs" 32,7px peste tot, la dreapta între 16,9 și
 * 33,5, după siglă. Clientul a văzut diferența fără s-o măsoare.
 *
 * Cât gol avea fiecare, măsurat desenând pe o pânză și căutând marginile
 * punctelor cu alfa > 24:
 *
 *   WooCommerce  17,8% pe fiecare latură (și 33% sus și jos)
 *   Magento       7,8% pe fiecare latură
 *   Edinio        3,1% la stânga, 4,8% la dreapta
 *   Wix           1,5% pe fiecare latură
 *   Shopify, OpenCart, Cartum — deja strânse
 *
 * Acum toate sunt strânse: la SVG-uri s-a rescris `viewBox`-ul pe marginile
 * desenului (și `width`/`height`, altfel `<img>` ia proporția veche și desenul se
 * turtește); la cele matriceale s-a tăiat fișierul. Verificat după: gol 0,0% la
 * toate șapte.
 *
 * ⚠ Odată cutiile strânse, CERNEALA S-A SCHIMBAT și ea — WooCommerce a sărit de
 * la 0,15 la 0,648, fiindcă înainte se socotea în raport cu o cutie cu mult gol
 * în ea. Valorile de mai jos sunt cele de DUPĂ strângere.
 *
 * ═══ CERNEALA ═══
 *
 * ⚠ RAPORTUL SINGUR NU AJUNGE, și WooCommerce a dovedit-o. Cutia lui e de două
 * ori mai lată decât înaltă, ca a multor cuvinte scrise — dar desenul e din linii
 * subțiri, deci ACOPERĂ foarte puțin din ea. Măsurat, desenând fiecare siglă pe
 * o pânză și numărând punctele nestrăvezii:
 *
 *   OpenCart      0,79     Shopify   0,72     Edinio   0,52
 *   Wix           0,45     Cartum    0,44     Magento  0,40
 *   WooCommerce   0,15  ← de cinci ori mai puțină cerneală decât Shopify
 *
 * La suprafață de CUTIE egală, WooCommerce arăta de vreo două ori mai mic decât
 * vecinul lui, și chiar așa l-a văzut clientul. Cerneala intră acum în socoteală
 * împreună cu raportul, în `PUTERE` — vezi acolo.
 *
 * Valorile sunt MĂSURATE, nu potrivite din ochi. Dacă se schimbă un fișier, se
 * remăsoară: se desenează pe o pânză de 200px și se numără punctele cu alfa > 24.
 */

import type { LogoSize, ProviderLogo } from "./logos";

const V = "/versus";

/**
 * ⚠ `corectie` E O ÎNMULȚIRE PESTE SOCOTEALĂ, hotărâtă PRIVIND, nu calculând.
 *
 * Formula duce departe, dar nu până la capăt: „woo" e un cuvânt de trei litere,
 * iar „cartum" de șase. La aceeași socoteală, cel scurt are mai puțină prezență
 * pe rând — se vede, deși numerele zic că sunt egale. Corecția e ce lipsește
 * între ce se poate măsura și ce se vede.
 *
 * Alese uitându-mă la toate șapte una lângă alta, la aceeași scară, în patru
 * modele. Cine le schimbă, să facă la fel: numai din numere nu iese.
 */
export const VERSUS_LOGOS = {
  shopify: { name: "Shopify", src: `${V}/shopify.svg`, ratio: 0.881, ink: 0.716 },
  cartum: { name: "Cartum", src: `${V}/cartum.webp`, ratio: 5.5556, ink: 0.407, corectie: 0.93 },
  wix: { name: "Wix", src: `${V}/wix.svg`, ratio: 2.489, ink: 0.474 },
  woocommerce: {
    name: "WooCommerce",
    src: `${V}/woocommerce.svg`,
    ratio: 3.794,
    ink: 0.648,
    /* Cel mai scurt cuvânt dintre toate. Fără corecție arăta vizibil mai mic,
       chiar și după ce cutia i-a fost strânsă pe desen. */
    corectie: 1.25,
  },
  opencart: { name: "OpenCart", src: `${V}/opencart.svg`, ratio: 1, ink: 0.788 },
  magento: { name: "Magento", src: `${V}/magento.svg`, ratio: 0.847, ink: 0.458, corectie: 0.93 },
} as const satisfies Record<string, ProviderLogo & { corectie?: number }>;

export type VersusKey = keyof typeof VERSUS_LOGOS;

/**
 * Sigla noastră, în aceeași listă cu ale lor.
 *
 * ⚠ E AICI TOCMAI CA SĂ TREACĂ PRIN ACEEAȘI SOCOTEALĂ. Clientul a cerut (13.08)
 * să rămână doar punga, fără cuvântul „Edinio" de lângă. Cu textul lângă ea,
 * ansamblul nostru avea altă greutate decât sigla lor și echilibrul se potrivea
 * din ochi; singură, punga intră în aceeași formulă și iese egală cu ele fără să
 * fie nevoie de nicio potriveală.
 *
 * Raportul e al fișierului: 284×289.
 */
export const SIGLA_NOASTRA = {
  name: "Edinio",
  /* ⚠ ALT FIȘIER decât `/logo.png`, și dinadins: ăsta e strâns pe desen, iar cel
     din antet nu. `/logo.png` are vreo 5% gol străveziu în jur; strâns acolo, s-ar
     fi mărit sigla din antet și din avatarul de WhatsApp, care sunt bine cum sunt. */
  src: `${V}/edinio.webp`,
  ratio: 0.9526,
  ink: 0.591,
} as const satisfies ProviderLogo;

/**
 * Înălțimea siglei de referință — a noastră. Toate celelalte se socotesc față de
 * ea, deci schimbând-o se schimbă tot rândul deodată.
 */
export const INALTIME_REFERINTA = 36;

/**
 * ═══ CÂT DE MARE SE DESENEAZĂ FIECARE SIGLĂ ═══
 *
 * ⚠ NU LA ÎNĂLȚIME EGALĂ ȘI NICI LA SUPRAFAȚĂ EGALĂ. Amândouă s-au încercat și
 * amândouă se văd greșite:
 *
 * - **Înălțime egală** umflă cuvintele lungi: „cartum", lat cât cinci înălțimi,
 *   ajungea de trei ori mai lat decât punga Shopify și înghițea rândul.
 * - **Suprafață egală** (`logoSize()`, ce folosesc siglele de integrări) face
 *   invers: turtește cuvintele. Măsurat, „woo" ieșea de 17px înălțime lângă o
 *   pungă de 36 — clientul a spus limpede că e prea mic, și avea dreptate.
 *
 * Adevărul e la mijloc, iar „mijloc" are aici un înțeles precis. La suprafață
 * egală, înălțimea scade cu rădăcina lui (raport × cerneală); la înălțime egală
 * nu scade deloc. Aici scade cu RĂDĂCINA DE ORDINUL PATRU — adică exact pe
 * jumătatea drumului dintre cele două, pe scara în care se compară ele.
 *
 * Ales privind, nu calculând: cele șapte sigle au fost puse una lângă alta, la
 * aceeași scară, în patru modele (0 · 0,25 · 0,35 · 0,50). La 0,25 se citesc
 * egale; la 0,35 cuvintele încă rămân mici, la 0 sunt uriașe.
 */
const PUTERE = 0.25;

/** Cât de mare se desenează sigla noastră. */
export function marimeaNoastra(): LogoSize {
  return marime(SIGLA_NOASTRA, 1);
}

/** Cât de mare se desenează sigla dată. */
export function marimeVersus(cheie: VersusKey): LogoSize {
  const logo = VERSUS_LOGOS[cheie];
  return marime(logo, "corectie" in logo ? logo.corectie : 1);
}

function marime(logo: ProviderLogo, corectie: number): LogoSize {
  const greutate = (l: ProviderLogo) => Math.pow(l.ratio * (l.ink ?? 1), PUTERE);
  const inaltime =
    (INALTIME_REFERINTA * greutate(SIGLA_NOASTRA)) / greutate(logo) * corectie;

  return {
    height: Math.round(inaltime * 10) / 10,
    /* Plasa pentru cele lungi: „cartum" iese de vreo 131px, iar pe telefon
       rândul are loc puțin. Măsurat la 320px: sigla noastră 36, „vs" 48,
       spațierile 32 — rămân 204 pentru a lor, deci 150 e sub prag. */
    maxWidth: Math.round(Math.min(150, inaltime * logo.ratio) * 10) / 10,
  };
}
