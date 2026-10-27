"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BlockRenderer } from "@/components/pages/BlockRenderer";
import { SlotBlocuri } from "@/components/storefront/SloturiBlocuri";
import { useStoreChromeOptional } from "@/components/storefront/StorefrontProvider";
import { blocuriLaCale, caleInText, type CaleContinut } from "@/lib/storefront/design/edit";
import {
  PREVIEW_MESSAGE,
  isPreviewMessage,
  type DatePrevizualizarePagina,
} from "@/lib/storefront/design/preview-protocol";
import type { StoreDesign } from "@/lib/storefront/design/types";

/**
 * Un „Conținut liber” in magazin (etapa 9 din `docs/editor-magazin/PLAN.md`): pe pagina principala,
 * sub produs sau pe Pagina Magazin.
 *
 * Pe magazinul public (si in editor, pana sosesc datele): slotul randat pe SERVER, cu blocurile
 * curatate (`sloturiContinutLiber`), cu tot cu interogarile lor. In editor, odata sosite designul si
 * datele trimise de editor, blocurile se randeaza aici, pe loc, nesalvate inca, ca la paginile proprii
 * (`PaginaVie`).
 *
 * ⚠⚠ Pe loc se randeaza NUMAI blocurile venite prin mesajul editorului, niciodata designul primit ca
 * prop. In modul editor acela e ciorna citita pe server, necuratata: un `<img onerror>` scris direct
 * in baza ar fi rulat aici, pe originea panoului, inclusiv la un admin intrat prin impersonare.
 * Editorul isi curata blocurile la incarcare (`curataHtmlPentruEditor`), deci ce trimite e curat.
 */

interface StareVie {
  design: StoreDesign | null;
  date: DatePrevizualizarePagina | null;
}

let stare: StareVie = { design: null, date: null };
const ascultatori = new Set<() => void>();

/*
 * Ascultatorul se pune la incarcarea modulului, nu la montarea primului continut: o sectiune
 * „Conținut liber” adaugata din editor se monteaza DUPA primul mesaj de design, iar acela s-ar fi
 * pierdut. Originea se verifica: mesajele vin numai de la editor, de pe aceeasi origine.
 */
if (typeof window !== "undefined") {
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.origin !== window.location.origin || !isPreviewMessage(e.data)) return;
    const mesaj = e.data;
    if (mesaj[PREVIEW_MESSAGE] === "design") stare = { ...stare, design: mesaj.design };
    else if (mesaj[PREVIEW_MESSAGE] === "dateBlocuri") stare = { ...stare, date: mesaj.date };
    else return;
    for (const f of ascultatori) f();
  });
}

function abonare(f: () => void) {
  ascultatori.add(f);
  return () => { ascultatori.delete(f); };
}
const citeste = () => stare;
const FARA: StareVie = { design: null, date: null };
const peServer = () => FARA;

export function ContinutLiber({ cale }: { cale: CaleContinut }) {
  const chrome = useStoreChromeOptional();
  const editor = chrome?.esteEditorDesign === true;
  const viu = useSyncExternalStore(abonare, citeste, peServer);
  const cheie = caleInText(cale);

  // In editor, datele blocurilor se cer o data, cand exista un continut care le foloseste.
  useEffect(() => {
    if (!editor || viu.date) return;
    window.parent.postMessage({ [PREVIEW_MESSAGE]: "cereDateBlocuri" }, window.location.origin);
  }, [editor, viu.date]);

  if (!editor || !chrome || !viu.design || !viu.date) return <SlotBlocuri cheie={cheie} />;
  const blocuri = blocuriLaCale(viu.design, cale) ?? [];
  return (
    <BlockRenderer
      blocks={blocuri}
      ctx={{
        color: chrome.color,
        basePath: chrome.basePath,
        storeSlug: chrome.business.slug,
        social: chrome.social,
        businessId: chrome.business.id,
        products: viu.date.products,
        bundles: viu.date.bundles,
        forms: viu.date.forms,
        plati: viu.date.plati,
        curieri: viu.date.curieri,
        preview: true,
        caleDesign: cheie,
        h1Id: null,
      }}
    />
  );
}
