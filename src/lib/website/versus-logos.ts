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
 */

import { logoSize, type LogoSize, type ProviderLogo } from "./logos";

const V = "/versus";

export const VERSUS_LOGOS = {
  shopify: { name: "Shopify", src: `${V}/shopify.svg`, ratio: 2192 / 2500 },
  cartum: { name: "Cartum", src: `${V}/cartum.webp`, ratio: 600 / 108 },
  wix: { name: "Wix", src: `${V}/wix.svg`, ratio: 2500 / 973 },
  woocommerce: { name: "WooCommerce", src: `${V}/woocommerce.svg`, ratio: 2 },
  opencart: { name: "OpenCart", src: `${V}/opencart.svg`, ratio: 1 },
  magento: { name: "Magento", src: `${V}/magento.svg`, ratio: 1 },
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
} as const satisfies ProviderLogo;

/**
 * Suprafața la care se desenează FIECARE siglă din rând, în pixeli pătrați.
 *
 * O siglă pătrată la suprafața asta iese de 35px pe latură; una lungă, ca a lui
 * Cartum, iese mai joasă și mai lată, dar la fel de „grea" pentru ochi.
 */
export const SUPRAFATA_VERSUS = 1250;

/** Cât de mare se desenează sigla noastră, la aceeași suprafață. */
export function marimeaNoastra(): LogoSize {
  return logoSize(SIGLA_NOASTRA, SUPRAFATA_VERSUS, 96);
}

/** Cât de mare se desenează sigla dată, la suprafața comună. */
export function marimeVersus(cheie: VersusKey): LogoSize {
  /* `maxWidth` e plasa pentru cea mai lungă: la suprafață egală, Cartum iese de
     vreo 83px lățime, iar pe telefon rândul are loc puțin. Peste 96 se
     micșorează singură, prin `object-contain`. */
  return logoSize(VERSUS_LOGOS[cheie], SUPRAFATA_VERSUS, 96);
}
