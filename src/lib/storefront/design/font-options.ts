import type { FontKey } from "./types";

/**
 * Etichetele fonturilor, ca DATE PURE.
 *
 * Separate de `fonts.ts` intentionat: acolo se apeleaza `next/font/google` la
 * nivel de modul, iar apelurile acelea au efect la build (genereaza CSS si
 * fisiere de font). Editorul are nevoie doar de nume, deci importa fisierul
 * asta si nu trage dupa el intreaga familie de fonturi in bundle-ul de dashboard.
 */
export interface FontOption {
  key: FontKey;
  label: string;
  /** Stiva de rezerva folosita in listele din editor, unde webfontul nu e incarcat. */
  preview: string;
  kind: "sans" | "serif";
}

export const FONT_OPTIONS: FontOption[] = [
  { key: "geist", label: "Geist", preview: "system-ui, sans-serif", kind: "sans" },
  { key: "inter", label: "Inter", preview: "Inter, system-ui, sans-serif", kind: "sans" },
  { key: "manrope", label: "Manrope", preview: "Manrope, system-ui, sans-serif", kind: "sans" },
  { key: "jakarta", label: "Plus Jakarta Sans", preview: "'Plus Jakarta Sans', system-ui, sans-serif", kind: "sans" },
  { key: "dmsans", label: "DM Sans", preview: "'DM Sans', system-ui, sans-serif", kind: "sans" },
  { key: "sora", label: "Sora", preview: "Sora, system-ui, sans-serif", kind: "sans" },
  { key: "playfair", label: "Playfair Display", preview: "'Playfair Display', Georgia, serif", kind: "serif" },
  { key: "instrument", label: "Instrument Serif", preview: "'Instrument Serif', Georgia, serif", kind: "serif" },
];

export function fontLabel(key: FontKey): string {
  return FONT_OPTIONS.find((f) => f.key === key)?.label ?? key;
}
