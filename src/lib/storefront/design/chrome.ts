import { HEADER_VARIANT_ACTIONS, variantMeta } from "./registry";
import { resolveActions } from "./actions";
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

/**
 * Header-ul ofera cautare, sub orice forma?
 *
 * Doua forme, aceeasi consecinta: bara permanenta (`replacesCatalogSearch`) sau
 * iconita cu lupa, care deschide un panou. Catalogul isi ascunde propriul camp
 * cand raspunsul e da — altfel magazinul are doua cautari una sub alta, si
 * clientul nu stie care e „cea adevarata".
 *
 * Iconita se poate stinge din reglajele header-ului, deci raspunsul nu poate fi
 * doar un semn din registry: se citeste si lista de actiuni salvata. Header-ul
 * stins nu ofera nimic.
 */
export function headerAreCautare(design: StoreDesign): boolean {
  const header = design.chrome.header;
  if (!header.enabled) return false;

  const meta = variantMeta("header", header.variant);
  if (meta?.replacesCatalogSearch === true) return true;

  const suportate = HEADER_VARIANT_ACTIONS[header.variant] ?? [];
  if (!suportate.includes("cautare")) return false;
  return resolveActions(header.settings.actions, suportate, suportate).includes("cautare");
}
