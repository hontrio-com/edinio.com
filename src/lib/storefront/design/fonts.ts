import {
  DM_Sans,
  Instrument_Serif,
  Inter,
  Manrope,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Sora,
} from "next/font/google";
import type { FontKey } from "./types";

/**
 * Fonturile pe care si le poate alege un magazin.
 *
 * `preload: false` peste tot, deliberat: alegerea e per magazin si nu se stie la
 * build, deci un `<link rel=preload>` pentru toate cele opt ar descarca fonturi
 * pe care nimeni nu le foloseste. Fisierele reale se descarca oricum doar cand
 * o regula CSS aplicata le referentiaza.
 *
 * Geist nu se redeclara aici: e deja incarcat global in `src/app/layout.tsx`
 * (`--font-geist-sans`), cu preload activ. Fiind implicitul TUTUROR magazinelor
 * de azi, cazul comun ramane optim, iar celelalte sapte sunt opt-in.
 */

const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--st-font-inter" });
const manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false, variable: "--st-font-manrope" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--st-font-jakarta" });
const dmsans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--st-font-dmsans" });
const sora = Sora({ subsets: ["latin"], display: "swap", preload: false, variable: "--st-font-sora" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--st-font-playfair" });
// Instrument Serif nu e font variabil: greutatea e obligatorie.
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--st-font-instrument",
});

interface FontEntry {
  /** Clasa care declara `@font-face` si variabila CSS. Goala pentru Geist. */
  className: string;
  /** Ce se pune in `--st-font-heading` / `--st-font-body`. */
  stack: string;
}

const FONTS: Record<FontKey, FontEntry> = {
  geist: { className: "", stack: "var(--font-geist-sans), system-ui, sans-serif" },
  inter: { className: inter.variable, stack: "var(--st-font-inter), system-ui, sans-serif" },
  manrope: { className: manrope.variable, stack: "var(--st-font-manrope), system-ui, sans-serif" },
  jakarta: { className: jakarta.variable, stack: "var(--st-font-jakarta), system-ui, sans-serif" },
  dmsans: { className: dmsans.variable, stack: "var(--st-font-dmsans), system-ui, sans-serif" },
  sora: { className: sora.variable, stack: "var(--st-font-sora), system-ui, sans-serif" },
  playfair: { className: playfair.variable, stack: "var(--st-font-playfair), Georgia, serif" },
  instrument: { className: instrument.variable, stack: "var(--st-font-instrument), Georgia, serif" },
};

/**
 * Clasele si variabilele pentru perechea de fonturi aleasa. Cand titlurile si
 * textul folosesc acelasi font, se aplica o singura clasa.
 */
export function fontSetup(heading: FontKey, body: FontKey): {
  className: string;
  vars: Record<string, string>;
} {
  const h = FONTS[heading] ?? FONTS.geist;
  const b = FONTS[body] ?? FONTS.geist;
  const classes = [h.className, b.className].filter(Boolean);
  return {
    className: Array.from(new Set(classes)).join(" "),
    vars: { "--st-font-heading": h.stack, "--st-font-body": b.stack },
  };
}
