import { variantMeta } from "./registry";
import type { SectionInstance, StoreDesign } from "./types";

/**
 * Header-ul ales isi randeaza singur banda de anunt?
 *
 * Majoritatea variantelor lasa bara de anunt deasupra lor, ca sectiune separata.
 * Cateva o poarta in interior, sub randul cu logo — vezi `hostsAnnouncement` din
 * registry. Raspunsul se calculeaza intr-un singur loc, ca decizia sa fie
 * aceeasi peste tot: si acolo unde se randeaza bara, si acolo unde header-ul isi
 * calculeaza distanta fata de marginea de sus.
 */
export function headerHostsAnnouncement(design: StoreDesign): boolean {
  const header = design.chrome.header;
  return header.enabled && variantMeta("header", header.variant)?.hostsAnnouncement === true;
}

/** Bara de anunt de randat separat — nimic, daca o poarta header-ul. */
export function standaloneAnnouncement(design: StoreDesign): SectionInstance | null {
  return headerHostsAnnouncement(design) ? null : design.chrome.announcement;
}
