import { FONT_KEYS, type FontKey } from "./types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  FONTURILE MAGAZINULUI, ALESE DIN „EDITEAZA MAGAZINUL"           (01.10.2026)
  ═══════════════════════════════════════════════════════════════════════════

  `StoreStyle` avea de mult `fontHeading` si `fontBody`, dar niciun ecran nu le
  scria (masurat pe 01.10.2026: 0 din 136 de magazine aveau vreun stil salvat),
  iar vitrina nici nu le citea pentru titluri si text: ajungeau doar in meniu si
  in contul clientului.

  Alegerea se tine in `page_content` (`font_titluri`, `font_text`), langa culoarea
  de fundal, si se salveaza ca orice alt camp din editor. `resolveStyle` o
  citeste cand designul nu are propriul font, deci un font ales vreodata din
  editorul de design ramane mai tare.

  Cum ajunge pe ecran: `StorefrontThemeScope` (vezi acolo).
*/

export const CHEIE_FONT_TITLURI = "font_titluri";
export const CHEIE_FONT_TEXT = "font_text";

/** Un font valid din `page_content`, sau undefined (atunci ramane Geist). */
export function fontDinPageContent(valoare: unknown): FontKey | undefined {
  return typeof valoare === "string" && (FONT_KEYS as readonly string[]).includes(valoare)
    ? (valoare as FontKey)
    : undefined;
}
