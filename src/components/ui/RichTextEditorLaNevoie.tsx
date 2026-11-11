"use client";

import dynamic from "next/dynamic";

/*
  Etapa 25.15 (11.11.2026): editorul de text bogat, adus abia cand se deschide un camp care il foloseste.

  Masurat pe build-ul de productie: TipTap cu ProseMirror (`RichTextEditor`) era cel mai mare fisier al editorului de
  magazin, 124 KB gzip (409 KB necomprimat), descarcat si evaluat la fiecare deschidere a editorului, desi apare doar in
  panoul unui bloc „Text” sau al coloanelor clasice din „Conținut liber” (`BlockSettings`).

  Aparitia nu se schimba: `RichTextEditor` intoarce oricum `null` pana se monteaza (`immediatelyRender: false`), deci
  campul aparea si inainte cu o clipa mai tarziu decat restul panoului. Acum, in clipa aceea, sta un chenar de aceeasi
  forma, iar cititorul de ecran aude ca se incarca.

  Restul locurilor care il folosesc (fisa produsului, setarile, panoul de administrare) il au pe ecran de la inceput,
  deci il importa direct, ca inainte.
*/
export const RichTextEditor = dynamic(() => import("./RichTextEditor").then((m) => m.RichTextEditor), {
  ssr: false,
  loading: () => (
    <div role="status" className="min-h-[150px] rounded-xl border border-border bg-muted/30">
      <span className="sr-only">Se încarcă editorul de text</span>
    </div>
  ),
});
