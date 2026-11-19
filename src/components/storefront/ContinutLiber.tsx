"use client";

import { Suspense, lazy, useEffect, useSyncExternalStore } from "react";
import { SlotBlocuri } from "@/components/storefront/SloturiBlocuri";
import { useStoreChromeOptional } from "@/components/storefront/StorefrontProvider";
import { caleInText, type CaleContinut } from "@/lib/storefront/design/cale-continut";
import { PREVIEW_MESSAGE, isPreviewMessage, type DatePrevizualizarePagina } from "@/lib/storefront/design/preview-protocol";
import type { StoreDesign } from "@/lib/storefront/design/types";

/**
 * Un „Conținut liber” in magazin (etapa 9 din `docs/editor-magazin/PLAN.md`): pe pagina principala,
 * sub produs sau pe Pagina Magazin.
 *
 * Pe magazinul public (si in editor, pana sosesc datele): slotul randat pe SERVER, cu blocurile
 * curatate (`sloturiContinutLiber`), cu tot cu interogarile lor. In editor, odata sosite designul si
 * datele trimise de editor, blocurile se randeaza pe loc, nesalvate inca, ca la paginile proprii
 * (`PaginaVie`), fiecare cu marcajul lui (`<cale>/<bloc>`), ca un clic sa-l deschida in panou.
 *
 * ⚠⚠ Pe loc se randeaza NUMAI blocurile venite prin mesajul editorului, niciodata designul primit ca
 * prop. In modul editor acela e ciorna citita pe server, necuratata: un `<img onerror>` scris direct
 * in baza ar fi rulat aici, pe originea panoului, inclusiv la un admin intrat prin impersonare.
 * Editorul isi curata blocurile la incarcare (`curataContinutulPentruEditor`), deci ce trimite e curat.
 *
 * ⚠ Randarea pe loc sta in `ContinutLiberViu`, incarcat la nevoie (19.11.2026). Fisierul asta se incarca pe FIECARE
 * magazin, deci nu importa nimic din randatorul de blocuri si nici din operatiile editorului: doar ascultatorul de
 * mesaje, starea lui si slotul de pe server.
 */

interface StareVie {
  design: StoreDesign | null;
  date: DatePrevizualizarePagina | null;
  /** „Redă animația”, pe id de bloc (vezi `cheieAnimatie`). */
  reluari: Record<string, number>;
}

let stare: StareVie = { design: null, date: null, reluari: {} };
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
    else if (mesaj[PREVIEW_MESSAGE] === "reluari") stare = { ...stare, reluari: mesaj.reluari };
    else return;
    for (const f of ascultatori) f();
  });
}

function abonare(f: () => void) {
  ascultatori.add(f);
  return () => { ascultatori.delete(f); };
}
const citeste = () => stare;
const FARA: StareVie = { design: null, date: null, reluari: {} };
const peServer = () => FARA;

/** Randarea pe loc, doar in editor: bucata ei de JavaScript se cere abia cand editorul trimite designul. */
const ContinutLiberViu = lazy(() => import("./ContinutLiberViu"));

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
  // Cat se incarca bucata editorului (o singura data), ramane slotul de pe server, ca pana sosesc datele.
  return (
    <Suspense fallback={<SlotBlocuri cheie={cheie} />}>
      <ContinutLiberViu cale={cale} cheie={cheie} chrome={chrome} design={viu.design} date={viu.date} reluari={viu.reluari} />
    </Suspense>
  );
}
