"use client";

import { useSyncExternalStore } from "react";

/** Adresa nu se schimba fara o navigare completa, deci n-avem la ce ne abona. */
const faraAbonare = () => () => {};

const inPreviewAcum = () => new URLSearchParams(window.location.search).get("preview") === "1";

/**
 * Pe server si la hidratare raspundem „da, e previzualizare".
 *
 * Dinadins pesimist: raspunsul „nu" ar fi randat pixelii pe server, iar ei trag
 * `PageView` la montare — deci s-ar fi numarat vizita FALSA exact pe care o
 * reparam, si abia apoi ar fi disparut de pe pagina.
 */
const laHidratare = () => true;

/**
 * Randeaza continutul doar in magazinul REAL, nu si in previzualizarea din
 * editor.
 *
 * ⚠ LAYOUT-UL PUBLIC NU STIE NIMIC DESPRE `?preview=1`, SI DE ASTA RULA INTREG
 * IN IFRAME.
 *
 * Sub el se randau, neconditionat, bannerul de cookie-uri, captarea de atribuire
 * si cei trei pixeli. In previzualizare asta insemna doua lucruri, amandoua
 * proaste: un val de banner peste cadru — in varianta centrata, peste tot ce
 * voia comerciantul sa vada — si cate un `PageView` FALS in Facebook Pixel,
 * TikTok si Google la FIECARE reincarcare a iframe-ului. Iar iframe-ul se
 * reincarca la fiecare salvare, deci o dupa-amiaza de reglat magazinul umfla
 * statisticile cu zeci de vizite care n-au existat.
 *
 * Exact motivul pentru care ruta de miniaturi a fost scoasa dinadins din
 * `[slug]` — vezi comentariul din `preview-sectiune/[slug]/page.tsx`.
 *
 * Verificarea e pe CLIENT fiindca un layout nu primeste parametrii adresei. Nu
 * costa nimic: tot ce inveleste aici e oricum client, si oricum nu face nimic
 * inainte de hidratare — bannerul isi asteapta citirea din `localStorage`
 * (`mounted`), pixelii isi injecteaza scriptul intr-un efect, iar captarea de
 * atribuire e un efect gol la randare.
 */
export function DoarInMagazinReal({ children }: { children: React.ReactNode }) {
  const inPreview = useSyncExternalStore(faraAbonare, inPreviewAcum, laHidratare);
  if (inPreview) return null;
  return <>{children}</>;
}
