// SCRIS de `scripts/teme/capturi-telefon.mjs`, nu de mana: capturile pe telefon ale temelor, din `public/teme-capturi/mobil`.

/** Dimensiunile capturii pe telefon a fiecarei teme (primul ecran, la 390 px, densitate 2, micsorat). */
export const CAPTURI_TELEFON: Readonly<Record<string, { latime: number; inaltime: number }>> = {
  jupiter: { latime: 300, inaltime: 649 },
  mercur: { latime: 300, inaltime: 649 },
  venus: { latime: 300, inaltime: 649 },
  terra: { latime: 300, inaltime: 649 },
  marte: { latime: 300, inaltime: 649 },
  saturn: { latime: 300, inaltime: 649 },
  uranus: { latime: 300, inaltime: 649 },
  neptun: { latime: 300, inaltime: 649 },
  sirius: { latime: 300, inaltime: 649 },
  vega: { latime: 300, inaltime: 649 },
  altair: { latime: 300, inaltime: 649 },
  rigel: { latime: 300, inaltime: 649 },
  polaris: { latime: 300, inaltime: 649 },
  antares: { latime: 300, inaltime: 649 },
  arcturus: { latime: 300, inaltime: 649 },
  aldebaran: { latime: 300, inaltime: 649 },
  capella: { latime: 300, inaltime: 649 },
  deneb: { latime: 300, inaltime: 649 },
  spica: { latime: 300, inaltime: 649 },
  procyon: { latime: 300, inaltime: 649 },
  canopus: { latime: 300, inaltime: 649 },
  regulus: { latime: 300, inaltime: 649 },
  bellatrix: { latime: 300, inaltime: 649 },
  betelgeuse: { latime: 300, inaltime: 649 },
  achernar: { latime: 300, inaltime: 649 },
  mira: { latime: 300, inaltime: 649 },
  alnilam: { latime: 300, inaltime: 649 },
  mintaka: { latime: 300, inaltime: 649 },
  electra: { latime: 300, inaltime: 649 },
  maia: { latime: 300, inaltime: 649 },
};

/** Adresa capturii pe telefon a temei, din `public/`. */
export function adresaCapturiiTelefon(cheie: string): string {
  return `/teme-capturi/mobil/${cheie}.webp`;
}
