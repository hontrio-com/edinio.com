/*
  GENERAT de `python scripts/fonturi-ro.py`. NU se editeaza de mana.

  Fisierele de font cu doar literele romanesti (`public/fonturi-ro/`), taiate din subsetul latin-ext al fiecarei
  familii incarcate prin `next/font`. Le declara `components/pages/FeteRomanesti.tsx`; de ce, in antetul scriptului.
*/

export interface FataRomaneasca {
  /** Numele familiei, cum il scrie `next/font` in CSS. */
  familie: string;
  stil: "normal" | "italic";
  /** O greutate (`400`) sau intervalul unui font variabil (`100 900`). */
  greutate: string;
  /** Fisierul din `public/fonturi-ro/`. */
  fisier: string;
  /** Literele pe care le are fisierul, ca `unicode-range`. */
  interval: string;
}

export const FETE_ROMANESTI: readonly FataRomaneasca[] = [
  { familie: "Anton", stil: "normal", greutate: "400", fisier: "anton-normal-400.ee2c6a3b.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Bebas Neue", stil: "normal", greutate: "400", fisier: "bebas-neue-normal-400.1d2b3bfe.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Caveat", stil: "normal", greutate: "400 700", fisier: "caveat-normal.8e47c259.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Cinzel", stil: "normal", greutate: "400 900", fisier: "cinzel-normal.4199476f.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Cormorant Garamond", stil: "normal", greutate: "300 700", fisier: "cormorant-garamond-normal.d7b9e59c.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "DM Sans", stil: "normal", greutate: "100 1000", fisier: "dm-sans-normal.6e281311.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "DM Serif Display", stil: "normal", greutate: "400", fisier: "dm-serif-display-normal-400.ef03693b.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Dancing Script", stil: "normal", greutate: "400 700", fisier: "dancing-script-normal.fd0beda7.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "EB Garamond", stil: "normal", greutate: "400 800", fisier: "eb-garamond-normal.fc275544.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Figtree", stil: "normal", greutate: "300 900", fisier: "figtree-normal.e2df50d9.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+170-171,U+218-21B" },
  { familie: "Fraunces", stil: "normal", greutate: "100 900", fisier: "fraunces-normal.9052776c.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Geist", stil: "normal", greutate: "100 900", fisier: "geist-normal.907e1643.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Geist Mono", stil: "normal", greutate: "100 900", fisier: "geist-mono-normal.7cba1e00.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Great Vibes", stil: "normal", greutate: "400", fisier: "great-vibes-normal-400.e6e4e34c.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Instrument Serif", stil: "normal", greutate: "400", fisier: "instrument-serif-normal-400.18662dc3.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+170-171,U+218-21B" },
  { familie: "Inter", stil: "normal", greutate: "100 900", fisier: "inter-normal.828e6d3d.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Josefin Sans", stil: "normal", greutate: "100 700", fisier: "josefin-sans-normal.0178f751.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Jost", stil: "normal", greutate: "100 900", fisier: "jost-normal.1c35a360.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Lora", stil: "normal", greutate: "400 700", fisier: "lora-normal.f0f14d10.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Manrope", stil: "normal", greutate: "200 800", fisier: "manrope-normal.573fb9dd.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Merriweather", stil: "normal", greutate: "300 900", fisier: "merriweather-normal.891baf23.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Montserrat", stil: "normal", greutate: "100 900", fisier: "montserrat-normal.e65230c4.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Nunito", stil: "normal", greutate: "200 1000", fisier: "nunito-normal.eb5d5b95.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Open Sans", stil: "normal", greutate: "300 800", fisier: "open-sans-normal.41f6c280.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Oswald", stil: "normal", greutate: "200 700", fisier: "oswald-normal.2f78e948.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Outfit", stil: "normal", greutate: "100 900", fisier: "outfit-normal.31410205.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+170-171,U+218-21B" },
  { familie: "Playfair Display", stil: "normal", greutate: "400 900", fisier: "playfair-display-normal.e1e6dfe7.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Plus Jakarta Sans", stil: "normal", greutate: "200 800", fisier: "plus-jakarta-sans-normal.bab0fa2a.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Poppins", stil: "normal", greutate: "400", fisier: "poppins-normal-400.b5b99744.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Poppins", stil: "normal", greutate: "500", fisier: "poppins-normal-500.6f29f0d2.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Poppins", stil: "normal", greutate: "600", fisier: "poppins-normal-600.780ae8b0.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Poppins", stil: "normal", greutate: "700", fisier: "poppins-normal-700.de74d05b.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Poppins", stil: "normal", greutate: "800", fisier: "poppins-normal-800.91164907.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Quicksand", stil: "normal", greutate: "300 700", fisier: "quicksand-normal.c8adb270.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Raleway", stil: "normal", greutate: "100 900", fisier: "raleway-normal.3a775e6f.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Rubik", stil: "normal", greutate: "300 900", fisier: "rubik-normal.93d30911.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+170-171,U+218-21B" },
  { familie: "Sofia Sans", stil: "normal", greutate: "1 1000", fisier: "sofia-sans-normal.a6beb899.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Sora", stil: "normal", greutate: "100 800", fisier: "sora-normal.1c2de2f5.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Space Grotesk", stil: "normal", greutate: "300 700", fisier: "space-grotesk-normal.fabf4d00.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Unbounded", stil: "normal", greutate: "200 900", fisier: "unbounded-normal.ddb7992b.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
  { familie: "Work Sans", stil: "normal", greutate: "100 900", fisier: "work-sans-normal.99668988.woff2", interval: "U+102-103,U+150-151,U+15E-15F,U+162-163,U+170-171,U+218-21B" },
];
