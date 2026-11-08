// SCRIS de `scripts/teme/capturi-teme.mjs`, nu de mana: capturile temelor din `public/teme-capturi`.

/** Dimensiunile capturii fiecarei teme (prima pagina intreaga, la 1440 px, micsorata). */
export const CAPTURI_TEME: Readonly<Record<string, { latime: number; inaltime: number }>> = {
  jupiter: { latime: 720, inaltime: 1808 },
  mercur: { latime: 720, inaltime: 1804 },
  venus: { latime: 720, inaltime: 1666 },
  terra: { latime: 720, inaltime: 1523 },
  marte: { latime: 720, inaltime: 1659 },
  saturn: { latime: 720, inaltime: 1384 },
  uranus: { latime: 720, inaltime: 1693 },
  neptun: { latime: 720, inaltime: 1402 },
  sirius: { latime: 720, inaltime: 1561 },
  vega: { latime: 720, inaltime: 1613 },
  altair: { latime: 720, inaltime: 1577 },
  rigel: { latime: 720, inaltime: 1698 },
  polaris: { latime: 720, inaltime: 1241 },
  antares: { latime: 720, inaltime: 1798 },
  arcturus: { latime: 720, inaltime: 1584 },
  aldebaran: { latime: 720, inaltime: 1703 },
  capella: { latime: 720, inaltime: 1225 },
  deneb: { latime: 720, inaltime: 1595 },
  spica: { latime: 720, inaltime: 1651 },
  procyon: { latime: 720, inaltime: 1777 },
  canopus: { latime: 720, inaltime: 1711 },
  regulus: { latime: 720, inaltime: 1481 },
  bellatrix: { latime: 720, inaltime: 1673 },
  betelgeuse: { latime: 720, inaltime: 1623 },
  achernar: { latime: 720, inaltime: 1699 },
  mira: { latime: 720, inaltime: 1359 },
  alnilam: { latime: 720, inaltime: 1565 },
  mintaka: { latime: 720, inaltime: 1574 },
  electra: { latime: 720, inaltime: 1693 },
  maia: { latime: 720, inaltime: 1427 },
};

/** Adresa capturii temei, din `public/`. */
export function adresaCapturii(cheie: string): string {
  return `/teme-capturi/${cheie}.webp`;
}
