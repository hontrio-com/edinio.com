/*
  ═══════════════════════════════════════════════════════════════════════════
  FONTURILE BLOCURILOR DIN PAGINILE PROPRII, CA DATE PURE         (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: „mai multe variante de fonturi si tipografii" in editorul de
  pagini. Magazinul are 8 fonturi (`storefront/design/font-options.ts`); paginile
  primesc 30, pe familii, plus perechi gata facute.

  ⚠ DATE PURE, fara `next/font`. Declararile stau in
  `components/pages/fonturi-incarcate.ts`; fisierul asta il citesc si validarea
  de pe server si listele din editor, deci nu are voie sa traga dupa el
  fisierele de font. Aceeasi regula ca `font-options.ts` langa `fonts.ts`.

  ⚠ CHEILE SE SALVEAZA IN BAZA, pe blocuri (`font`, `titleFont`...).
  Nu se redenumesc: o cheie schimbata lasa paginile vechi pe fontul implicit.
*/

export const FAMILII_FONT = ["sans", "serif", "display", "scris"] as const;
export type FamilieFont = (typeof FAMILII_FONT)[number];

export const NUMELE_FAMILIEI: Record<FamilieFont, string> = {
  sans: "Moderne",
  serif: "Clasice (serif)",
  display: "De impact",
  scris: "Scrise de mână",
};

export const FONTURI_PAGINA = [
  // Moderne
  { cheie: "inter", nume: "Inter", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "manrope", nume: "Manrope", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "jakarta", nume: "Plus Jakarta Sans", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "dmsans", nume: "DM Sans", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "sora", nume: "Sora", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "poppins", nume: "Poppins", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "montserrat", nume: "Montserrat", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "raleway", nume: "Raleway", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "nunito", nume: "Nunito", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "worksans", nume: "Work Sans", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "outfit", nume: "Outfit", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "spacegrotesk", nume: "Space Grotesk", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "figtree", nume: "Figtree", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "rubik", nume: "Rubik", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "josefin", nume: "Josefin Sans", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "quicksand", nume: "Quicksand", familie: "sans", rezerva: "system-ui, sans-serif" },
  { cheie: "jost", nume: "Jost", familie: "sans", rezerva: "system-ui, sans-serif" },
  // Clasice
  { cheie: "playfair", nume: "Playfair Display", familie: "serif", rezerva: "Georgia, serif" },
  { cheie: "instrument", nume: "Instrument Serif", familie: "serif", rezerva: "Georgia, serif" },
  { cheie: "lora", nume: "Lora", familie: "serif", rezerva: "Georgia, serif" },
  { cheie: "merriweather", nume: "Merriweather", familie: "serif", rezerva: "Georgia, serif" },
  { cheie: "cormorant", nume: "Cormorant Garamond", familie: "serif", rezerva: "Georgia, serif" },
  { cheie: "dmserif", nume: "DM Serif Display", familie: "serif", rezerva: "Georgia, serif" },
  { cheie: "fraunces", nume: "Fraunces", familie: "serif", rezerva: "Georgia, serif" },
  { cheie: "ebgaramond", nume: "EB Garamond", familie: "serif", rezerva: "Georgia, serif" },
  { cheie: "cinzel", nume: "Cinzel", familie: "serif", rezerva: "Georgia, serif" },
  // De impact
  { cheie: "bebas", nume: "Bebas Neue", familie: "display", rezerva: "Impact, sans-serif" },
  { cheie: "oswald", nume: "Oswald", familie: "display", rezerva: "Impact, sans-serif" },
  { cheie: "anton", nume: "Anton", familie: "display", rezerva: "Impact, sans-serif" },
  { cheie: "unbounded", nume: "Unbounded", familie: "display", rezerva: "system-ui, sans-serif" },
  // Scrise de mana
  { cheie: "caveat", nume: "Caveat", familie: "scris", rezerva: "cursive" },
  { cheie: "dancing", nume: "Dancing Script", familie: "scris", rezerva: "cursive" },
  { cheie: "greatvibes", nume: "Great Vibes", familie: "scris", rezerva: "cursive" },
] as const satisfies readonly { cheie: string; nume: string; familie: FamilieFont; rezerva: string }[];

export type CheieFont = (typeof FONTURI_PAGINA)[number]["cheie"];

const CHEI = new Set<string>(FONTURI_PAGINA.map((f) => f.cheie));

export function esteFontPagina(v: unknown): v is CheieFont {
  return typeof v === "string" && CHEI.has(v);
}

export function fontulPaginii(cheie: CheieFont) {
  return FONTURI_PAGINA.find((f) => f.cheie === cheie)!;
}

/**
 * Numele variabilei CSS a fiecarui font. Cele noi sunt declarate de noi
 * (`--pf-<cheie>`, in `components/pages/fonturi-incarcate.ts`); cele ale
 * magazinului sunt `--st-font-<cheie>` (`storefront/design/fonts.ts`).
 */
const DIN_MAGAZIN = new Set<string>(["inter", "manrope", "jakarta", "dmsans", "sora", "playfair", "instrument"]);
export const variabilaFont = (cheie: CheieFont) => (DIN_MAGAZIN.has(cheie) ? `--st-font-${cheie}` : `--pf-${cheie}`);

/**
 * Stiva CSS a unui font: variabila `next/font`, apoi rezerva familiei.
 * ⚠ Variabila exista numai sub un element care poarta clasa fontului (vezi
 * `fonturiPentru`); altfel se cade, corect, pe rezerva.
 */
export function stivaFont(cheie: CheieFont): string {
  return `var(${variabilaFont(cheie)}), ${fontulPaginii(cheie).rezerva}`;
}

/**
 * Cheile de font de pe blocuri. Fontul se alege pe FIECARE bloc (cerut de el
 * pe 25.09.2026: „font per text, nu la nivel de pagina”), deci pagina incarca
 * exact fonturile pe care le poarta blocurile ei.
 */
export const CHEI_FONT_BLOC = ["font", "titleFont", "subtitleFont", "questionFont", "answerFont"] as const;

/** Fonturile folosite de o lista de blocuri (deja aplatizata, cu tot cu coloanele). */
export function fonturiDinBlocuri(blocuri: readonly object[]): CheieFont[] {
  const gasite = new Set<CheieFont>();
  for (const b of blocuri) {
    const o = b as Record<string, unknown>;
    for (const k of CHEI_FONT_BLOC) if (esteFontPagina(o[k])) gasite.add(o[k] as CheieFont);
  }
  return [...gasite];
}
