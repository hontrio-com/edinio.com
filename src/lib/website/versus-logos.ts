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
 * Se egalizează SUPRAFAȚA, cu aceeași socoteală ca la siglele de integrări —
 * `logoSize()` din `logos.ts`.
 *
 * ⚠ RAPORTUL E AL CUTIEI, NU AL DESENULUI, și se citește din `width`/`height`
 * scrise pe `<svg>`, nu din `viewBox`. Un `<img>` își ia proporția din atribute
 * când există; la Wix cele două chiar diferă (2,569 față de 2,484, fiindcă
 * viewBox-ul începe la -2,4). Aceeași scăpare a costat deja o dată, la
 * biblioteca de integrări.
 *
 * ⚠ CARTUM A FOST TĂIAT. Fișierul venea 600×315 cu desenul doar în mijloc, pe
 * 108px — restul transparent. Pus așa, la înălțime dată, cuvântul ar fi ieșit la
 * o treime din cât trebuia, fiindcă `<img>` măsoară cutia, nu cerneala. Acum
 * fișierul e strâns pe desen: 600×108.
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
 * vecinul lui, și chiar așa l-a văzut clientul. `logoSize()` știe să socotească
 * și cerneala — `h = √(suprafață / (raport · cerneală))` — doar că până acum nu i
 * se dădea. Acum i se dă, iar suprafața comună înseamnă suprafață DESENATĂ.
 *
 * Valorile sunt MĂSURATE, nu potrivite din ochi. Dacă se schimbă un fișier, se
 * remăsoară: se desenează pe o pânză de 200px și se numără punctele cu alfa > 24.
 */

import { logoSize, type LogoSize, type ProviderLogo } from "./logos";

const V = "/versus";

export const VERSUS_LOGOS = {
  shopify: { name: "Shopify", src: `${V}/shopify.svg`, ratio: 2192 / 2500, ink: 0.72 },
  cartum: { name: "Cartum", src: `${V}/cartum.webp`, ratio: 600 / 108, ink: 0.44 },
  wix: { name: "Wix", src: `${V}/wix.svg`, ratio: 2500 / 973, ink: 0.45 },
  woocommerce: { name: "WooCommerce", src: `${V}/woocommerce.svg`, ratio: 2, ink: 0.15 },
  opencart: { name: "OpenCart", src: `${V}/opencart.svg`, ratio: 1, ink: 0.79 },
  magento: { name: "Magento", src: `${V}/magento.svg`, ratio: 1, ink: 0.4 },
} as const satisfies Record<string, ProviderLogo>;

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
  src: "/logo.png",
  ratio: 284 / 289,
  /* Măsurată la fel ca ale lor. Vezi nota despre cerneală de mai sus. */
  ink: 0.52,
} as const satisfies ProviderLogo;

/**
 * Suprafața DESENATĂ a fiecărei sigle din rând, în pixeli pătrați.
 *
 * ⚠ E suprafață de CERNEALĂ, nu de cutie — de aceea numărul e mai mic decât
 * pare: la 660, sigla noastră iese de vreo 36px pe latură, cât era și înainte,
 * fiindcă din cutia ei doar jumătate e desen.
 */
export const SUPRAFATA_VERSUS = 660;

/** Cât de mare se desenează sigla noastră, la aceeași suprafață. */
export function marimeaNoastra(): LogoSize {
  return logoSize(SIGLA_NOASTRA, SUPRAFATA_VERSUS, 140);
}

/** Cât de mare se desenează sigla dată, la suprafața comună. */
export function marimeVersus(cheie: VersusKey): LogoSize {
  /* `maxWidth` e plasa pentru cele lungi. Ridicat de la 96 la 140 odată cu
     cerneala: WooCommerce, cel mai stins dintre toate, iese acum de vreo 93px
     lățime, iar Cartum de 91 — la 96 ar fi fost tăiate amândouă exact cât să
     piardă ce tocmai câștigaseră. Măsurat, la 320px rândul are loc: sigla
     noastră 36, „vs" 40, a lor 93, plus spațierile — sub 260px. */
  return logoSize(VERSUS_LOGOS[cheie], SUPRAFATA_VERSUS, 140);
}
