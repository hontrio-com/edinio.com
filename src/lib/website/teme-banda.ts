/**
 * Temele din banda dubla a hero-ului paginii „/teme” (16.11.2026, varianta C, aleasa de el dintre cinci): doua randuri
 * de cate 10, care curg in sensuri opuse. 20 din 30, ca primul ecran sa nu care toate capturile (~18 KB fiecare,
 * `scripts/teme/capturi-banda.mjs`); pe fiecare rand, temele pe fond inchis stau printre cele deschise.
 */
export const RANDURI_BANDA = [
  ["jupiter", "marte", "mercur", "neptun", "venus", "saturn", "sirius", "terra", "aldebaran", "rigel"],
  ["polaris", "canopus", "capella", "vega", "deneb", "electra", "uranus", "betelgeuse", "mintaka", "regulus"],
] as const;

/** Adresa capturii mici a unei teme, din banda. */
export function adresaTigla(cheie: string): string {
  return `/teme-capturi/banda/${cheie}.webp`;
}
