/**
 * Latimile la care se randeaza previzualizarea, pe dispozitiv.
 *
 * Numere REALE de viewport, nu cat loc a ramas pe ecranul editorului (vezi `RamaPreview`).
 */
export const LATIMI_DISPOZITIV = { mobil: 390, tableta: 768, desktop: 1280 } as const;

export type Dispozitiv = keyof typeof LATIMI_DISPOZITIV;

/**
 * Latimea la care se randeaza magazinul in chenarul de `latimeCutie` pixeli.
 *
 * „Calculator” ia tot chenarul cand acesta e mai lat de 1280 px: centrat la 1280, lasa benzi goale in
 * stanga si in dreapta (lista lui, 27.10.2026: „trebuie sa fie full width pe tot chenarul”). Sub 1280
 * ramane 1280 si se micsoreaza, ca pragurile CSS sa ramana cele de calculator. Telefonul si tableta
 * raman la latimea lor, centrate: acolo chenarul mai lat chiar arata un telefon.
 */
export function latimeaRandarii(dispozitiv: Dispozitiv, latimeCutie: number): number {
  const reala = LATIMI_DISPOZITIV[dispozitiv];
  return dispozitiv === "desktop" ? Math.max(reala, Math.floor(latimeCutie)) : reala;
}
