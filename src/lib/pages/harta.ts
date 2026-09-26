import type { MapBlock } from "./blocks.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  HARTA                                                            (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: butoane Waze si Google Maps cu siglele lor, zoom, harta sau
  satelit. Harta ramane cadrul Google fara cheie, cu pinul lor: un pin
  personalizat cere cheie Google Maps si facturare, iar el a ales sa ramana
  asa (25.09.2026). O forma cu harta OpenStreetMap si pin propriu a existat
  cateva ore in aceeasi zi si a fost scoasa.

  ⚠ Un bloc vechi ramane cu zoom-ul implicit al Google-ului: `z` nu se trimite
  deloc cand zoom-ul n-a fost ales.
*/

export const ZOOM_IMPLICIT = 15;

export const zoomul = (b: MapBlock) => Math.min(20, Math.max(3, Math.round(b.zoom ?? ZOOM_IMPLICIT)));

/** Inaltimea hartii, intre 160 si 900 px. Campul accepta pana acum si 0 sau NaN. */
export function inaltimeaHartii(b: MapBlock): number {
  const h = Number(b.height);
  return Number.isFinite(h) ? Math.min(900, Math.max(160, Math.round(h))) : 320;
}

/** Ce se cauta: adresa scrisa (sau „lat,lng”, daca asa a scris-o omul). */
function tinta(b: MapBlock): string | null {
  const q = (b.query ?? "").trim();
  return q || null;
}

/** Cadrul Google, fara cheie. */
export function embedGoogle(b: MapBlock): string | null {
  const q = tinta(b);
  if (!q) return null;
  const p = new URLSearchParams({ q, output: "embed", hl: "ro" });
  if (b.zoom != null) p.set("z", String(zoomul(b)));
  if (b.mapType === "satellite") p.set("t", "k");
  return `https://www.google.com/maps?${p.toString()}`;
}

/** Deschide navigatia in Waze, spre adresa (sau spre coordonate, daca adresa e „lat,lng”). */
export function linkWaze(b: MapBlock): string | null {
  const q = (b.query ?? "").trim();
  if (!q) return null;
  const ll = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
  return ll ? `https://waze.com/ul?ll=${ll[1]},${ll[2]}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}

/** Deschide traseul in Google Maps (aplicatia pe telefon, site-ul pe desktop). */
export function linkGoogleMaps(b: MapBlock): string | null {
  const q = tinta(b);
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null;
}
