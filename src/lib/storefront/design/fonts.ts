import {
  DM_Sans,
  Instrument_Serif,
  Inter,
  Manrope,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Sora,
} from "next/font/google";

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

/*
 * ⚠ `fontSetup` (clasele si stivele perechii alese) s-a mutat in `components/pages/fonturi-incarcate.ts`
 * (etapa 14): magazinul alege acum din toate cele 33 de fonturi ale paginilor, iar clasele lor stau acolo.
 * Aici raman doar cele 7 instante `next/font`, refolosite de acolo.
 */
