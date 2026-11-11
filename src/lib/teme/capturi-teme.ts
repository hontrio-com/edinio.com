// SCRIS de `scripts/teme/capturi-teme.mjs`, nu de mana: capturile temelor din `public/teme-capturi`.

/** Dimensiunile capturii fiecarei teme (prima pagina intreaga, la 1440 px, micsorata). */
export const CAPTURI_TEME: Readonly<Record<string, { latime: number; inaltime: number }>> = {
  jupiter: { latime: 720, inaltime: 1808 },
  mercur: { latime: 720, inaltime: 1807 },
  venus: { latime: 720, inaltime: 1670 },
  terra: { latime: 720, inaltime: 1527 },
  marte: { latime: 720, inaltime: 1662 },
  saturn: { latime: 720, inaltime: 1387 },
  uranus: { latime: 720, inaltime: 1696 },
  neptun: { latime: 720, inaltime: 1406 },
  sirius: { latime: 720, inaltime: 1572 },
  vega: { latime: 720, inaltime: 1617 },
  altair: { latime: 720, inaltime: 1581 },
  rigel: { latime: 720, inaltime: 1701 },
  polaris: { latime: 720, inaltime: 1244 },
  antares: { latime: 720, inaltime: 1801 },
  arcturus: { latime: 720, inaltime: 1587 },
  aldebaran: { latime: 720, inaltime: 1707 },
  capella: { latime: 720, inaltime: 1229 },
  deneb: { latime: 720, inaltime: 1598 },
  spica: { latime: 720, inaltime: 1654 },
  procyon: { latime: 720, inaltime: 1780 },
  canopus: { latime: 720, inaltime: 1596 },
  regulus: { latime: 720, inaltime: 1484 },
  bellatrix: { latime: 720, inaltime: 1677 },
  betelgeuse: { latime: 720, inaltime: 1627 },
  achernar: { latime: 720, inaltime: 1702 },
  mira: { latime: 720, inaltime: 1362 },
  alnilam: { latime: 720, inaltime: 1568 },
  mintaka: { latime: 720, inaltime: 1585 },
  electra: { latime: 720, inaltime: 1696 },
  maia: { latime: 720, inaltime: 1430 },
};

/** Adresa capturii temei, din `public/`. */
export function adresaCapturii(cheie: string): string {
  return `/teme-capturi/${cheie}.webp`;
}
