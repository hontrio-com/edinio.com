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

/*
 * ⚠⚠ `latin-ext`, NU DOAR `latin` (25.09.2026).
 *
 * Setul `latin` al Google Fonts se opreste la U+00FF, deci NU are ă, ș, ț
 * (U+0103, U+0219, U+021B). Cu el singur, fiecare litera romaneasca se desena
 * cu fontul de rezerva, in mijlocul cuvantului, pe toate magazinele cu alt font
 * decat Geist. `unicode-range` face ca fisierul `latin-ext` sa se descarce doar
 * pe paginile care chiar au asemenea litere, adica pe cele romanesti.
 *
 * ⚠ Instantele sunt EXPORTATE: paginile proprii (`components/pages/
 * fonturi-incarcate.ts`) le refolosesc, in loc sa declare a doua oara aceleasi
 * fonturi cu alta variabila si sa trimita de doua ori acelasi `@font-face`.
 */

export const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--st-font-inter" });
export const manrope = Manrope({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--st-font-manrope" });
export const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--st-font-jakarta" });
export const dmsans = DM_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--st-font-dmsans" });
export const sora = Sora({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--st-font-sora" });
export const playfair = Playfair_Display({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--st-font-playfair" });
// Instrument Serif nu e font variabil: greutatea e obligatorie.
export const instrument = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
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
