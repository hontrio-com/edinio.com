"use client";

import { useEffect } from "react";

/** Mesajul prin care miniatura isi anunta inaltimea reala catre editor. */
export const PREVIEW_HEIGHT_MESSAGE = "__edinioPreviewHeight";

/**
 * Anunta parintele cat de inalta a iesit sectiunea.
 *
 * Fara asta, cardul din galerie ar trebui sa stie dinainte inaltimea fiecarei
 * variante, la fiecare latime de ecran — un numar scris de mana in registry,
 * care se strica la prima modificare a componentei si pe care nimeni nu-si
 * aminteste sa-l actualizeze. Asa, cardul afla inaltimea adevarata si se
 * potriveste singur, si pe telefon si pe desktop.
 *
 * `previewHeight` din registry ramane, dar doar ca estimare initiala, ca sa nu
 * sara layout-ul pana se incarca iframe-ul.
 */
export function PreviewHeightReporter() {
  useEffect(() => {
    /**
     * Marginea de jos a continutului, nu inaltimea documentului.
     *
     * Fereastra iframe-ului e exact inaltimea pe care i-o da parintele, iar
     * parintele o ia de aici. Masurat pe document, numarul nu poate cobori
     * niciodata sub fereastra: o sectiune mai scurta decat estimarea initiala ar
     * ramane cu o banda goala dedesubt, si si-ar confirma la nesfarsit propria
     * greseala. Masurata pe elementele randate, valoarea si creste si scade.
     */
    const trimite = () => {
      const copii = Array.from(document.body?.children ?? []);
      const jos = copii.reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom), 0);
      const h = Math.ceil(jos > 0 ? jos : document.documentElement.scrollHeight);
      if (h > 0) window.parent?.postMessage({ [PREVIEW_HEIGHT_MESSAGE]: h }, window.location.origin);
    };
    trimite();

    // Continutul, nu radacina: radacina e tinuta la inaltimea ferestrei.
    const ro = new ResizeObserver(trimite);
    if (document.body) ro.observe(document.body);
    // Fonturile si imaginile schimba inaltimea dupa montare.
    window.addEventListener("load", trimite);
    const tarziu = setTimeout(trimite, 600);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", trimite);
      clearTimeout(tarziu);
    };
  }, []);

  return null;
}
