import {
  Anton, Bebas_Neue, Caveat, Cinzel, Cormorant_Garamond, DM_Serif_Display, Dancing_Script,
  EB_Garamond, Figtree, Fraunces, Great_Vibes, Jost, Josefin_Sans, Lora, Merriweather,
  Montserrat, Nunito, Oswald, Outfit, Poppins, Quicksand, Raleway, Rubik, Space_Grotesk,
  Unbounded, Work_Sans,
} from "next/font/google";
import { dmsans, instrument, inter, jakarta, manrope, playfair, sora } from "@/lib/storefront/design/fonts";
import { FONTURI_PAGINA, type CheieFont } from "@/lib/pages/fonturi";

/*
  ═══════════════════════════════════════════════════════════════════════════
  FONTURILE PAGINILOR, INCARCATE                                  (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ GAZDUITE DE NOI, prin `next/font`, nu cerute de la Google la fiecare vizita.
  Un `<link>` catre fonts.googleapis.com ar fi trimis IP-ul fiecarui cumparator
  la Google, adica exact ce au amendat instantele din Germania (LG Munchen,
  2022). Si ar fi fost inca un domeniu de rezolvat inaintea primului text.

  ⚠ `preload: false` pe toate. Declararea aduce doar regulile `@font-face` (mici);
  fisierele se descarca numai pentru fontul pe care o regula aplicata chiar il
  foloseste. O pagina fara tipografie proprie nu descarca nimic in plus.

  ⚠ `latin-ext` peste tot: fara el ă, ș, ț cad pe fontul de rezerva. Vezi nota
  din `storefront/design/fonts.ts`.
*/

/*
  ⚠ Opțiunile se scriu LITERAL la fiecare font. `next/font` le citește la
  compilare, din cod; un obiect comun întins cu `...o` dă „Unexpected spread”
  și rupe toate paginile care importă fișierul.
*/
const poppins = Poppins({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "500", "600", "700", "800"], variable: "--pf-poppins" });
const montserrat = Montserrat({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-montserrat" });
const raleway = Raleway({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-raleway" });
const nunito = Nunito({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-nunito" });
const worksans = Work_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-worksans" });
const outfit = Outfit({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-outfit" });
const spacegrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-spacegrotesk" });
const figtree = Figtree({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-figtree" });
const rubik = Rubik({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-rubik" });
const josefin = Josefin_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-josefin" });
const quicksand = Quicksand({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-quicksand" });
const jost = Jost({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-jost" });
const lora = Lora({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-lora" });
const merriweather = Merriweather({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-merriweather" });
const cormorant = Cormorant_Garamond({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-cormorant" });
const dmserif = DM_Serif_Display({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: "400", variable: "--pf-dmserif" });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-fraunces" });
const ebgaramond = EB_Garamond({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-ebgaramond" });
const cinzel = Cinzel({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-cinzel" });
const bebas = Bebas_Neue({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: "400", variable: "--pf-bebas" });
const oswald = Oswald({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-oswald" });
const anton = Anton({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: "400", variable: "--pf-anton" });
const unbounded = Unbounded({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-unbounded" });
const caveat = Caveat({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-caveat" });
const dancing = Dancing_Script({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--pf-dancing" });
const greatvibes = Great_Vibes({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: "400", variable: "--pf-greatvibes" });

type Incarcat = { variable: string };

/* ⚠ Fonturile magazinului se REFOLOSESC: aceleasi fisiere, aceeasi variabila. */
const INCARCATE: Record<CheieFont, Incarcat> = {
  inter, manrope, jakarta, dmsans, sora, playfair, instrument,
  poppins, montserrat, raleway, nunito, worksans, outfit, spacegrotesk, figtree, rubik,
  josefin, quicksand, jost, lora, merriweather, cormorant, dmserif, fraunces, ebgaramond,
  cinzel, bebas, oswald, anton, unbounded, caveat, dancing, greatvibes,
};

/** Clasa care declara `@font-face` pentru fontul dat. */
export function clasaFont(cheie: CheieFont): string {
  return INCARCATE[cheie].variable;
}

/** Clasele `next/font` pentru fonturile date: pagina publica le pune pe `<main>`. */
export function claseFonturi(chei: Iterable<CheieFont>): string {
  return [...new Set(chei)].map(clasaFont).join(" ");
}

/** Toate clasele: pentru editor, unde lista de fonturi se arata cu fontul ei. */
export function toateClaseleDeFont(): string {
  return FONTURI_PAGINA.map((f) => clasaFont(f.cheie as CheieFont)).join(" ");
}
