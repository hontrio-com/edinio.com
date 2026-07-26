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
    const trimite = () => {
      const h = Math.ceil(document.documentElement.getBoundingClientRect().height);
      if (h > 0) window.parent?.postMessage({ [PREVIEW_HEIGHT_MESSAGE]: h }, window.location.origin);
    };
    trimite();

    const ro = new ResizeObserver(trimite);
    ro.observe(document.documentElement);
    // Fonturile si imaginile pot schimba inaltimea dupa montare.
    window.addEventListener("load", trimite);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", trimite);
    };
  }, []);

  return null;
}
