"use client";

import { useId, useRef, useState } from "react";
import { ExternalLink, ShieldCheck, X } from "lucide-react";
import { ETICHETA_GARANTIE, NOTIFICARE_GARANTIE, TEXT_NOTIFICARE_GARANTIE } from "@/lib/storefront/garantie-legala";

/*
 * Linkul catre notificarea armonizata si fereastra care o arata intreaga.
 * Regulile si temeiul legal: `lib/storefront/garantie-legala.ts`.
 *
 * ⚠ `<dialog>` NATIV: tine focusul in fereastra, se inchide cu Esc si pune restul
 * paginii in spate fara nicio biblioteca. Imaginea se incarca abia la prima deschidere,
 * ca linkul din subsol sa nu aduca 88 KB pe fiecare pagina a magazinului.
 *
 * ⚠ `<img>`, NU `next/image`: optimizatorul ar fi convertit fisierul oficial in WebP,
 * iar ghidul Comisiei interzice orice conversie de format in afara fisierelor date.
 */
export function ButonGarantieLegala({
  className,
  cuIconita = false,
  eticheta = ETICHETA_GARANTIE,
}: {
  className?: string;
  cuIconita?: boolean;
  eticheta?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const continutRef = useRef<HTMLDivElement>(null);
  const [deschisaOdata, setDeschisaOdata] = useState(false);
  /* Pe telefon: intreaga (implicit) sau marita pentru citit, la o atingere. */
  const [marita, setMarita] = useState(false);
  /* Butonul apare de mai multe ori pe aceeasi pagina (subsol + produs), deci id-urile nu pot fi fixe. */
  const id = useId();
  const idTitlu = `${id}-titlu`;
  const idText = `${id}-text`;

  function deschide() {
    setDeschisaOdata(true);
    setMarita(false);
    dialogRef.current?.showModal();
    /* Mereu de sus: altfel fereastra redeschisa pastra derularea de data trecuta, iar omul intra la jumatatea notificarii. */
    requestAnimationFrame(() => { if (continutRef.current) continutRef.current.scrollTop = 0; });
  }

  return (
    <>
      <button type="button" onClick={deschide} className={className} aria-haspopup="dialog">
        {cuIconita && <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />}
        {eticheta}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={idTitlu}
        /* Clic pe fundalul intunecat (in afara continutului) inchide fereastra. */
        onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current?.close(); }}
        className="m-auto w-[calc(100%-1rem)] max-w-[760px] max-h-[92vh] overflow-hidden rounded-2xl bg-white p-0 text-[#18181b] shadow-2xl backdrop:bg-black/60"
      >
        <div className="flex max-h-[92vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
            <h2 id={idTitlu} className="text-base font-semibold">Garanția legală</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Închide"
              autoFocus
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {/*
            ⚠ INTREAGA SAU CITIBILA, PE TELEFON NU AMANDOUA. Notificarea e o pagina A4: la latimea
            unui telefon (~330 px) textul iese de ~6 px. O zi s-a afisat marita (720 px, text de
            ~14 px) cu derulare laterala; el a cerut s-o vada intreaga (28.09.2026). Acum porneste
            intreaga, iar o atingere o mareste pentru citit (si inapoi). Pe ecrane late fereastra are
            760 px: textul iese pe la 14 px, intreaga, fara nimic de apasat.
          */}
          <div ref={continutRef} className="overflow-auto p-4">
            <p className="mb-2 text-xs text-black/60 sm:hidden" aria-live="polite">
              {marita ? "Atinge din nou ca s-o vezi întreagă." : "Atinge notificarea ca s-o mărești."}
            </p>
            {deschisaOdata && (
              <button
                type="button"
                onClick={() => setMarita((m) => !m)}
                aria-pressed={marita}
                aria-label={marita ? "Arată notificarea întreagă" : "Mărește notificarea"}
                className="block w-full cursor-zoom-in sm:pointer-events-none sm:cursor-default"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- fisierul oficial, fara conversie (vezi mai sus) */}
                <img
                  src={NOTIFICARE_GARANTIE.src}
                  width={NOTIFICARE_GARANTIE.latime}
                  height={NOTIFICARE_GARANTIE.inaltime}
                  alt="Notificarea Uniunii Europene privind garanția legală de conformitate"
                  aria-describedby={idText}
                  className={`h-auto w-full ${marita ? "min-w-[720px] max-w-none sm:min-w-0" : ""}`}
                />
              </button>
            )}
            <div id={idText} className="sr-only">
              {TEXT_NOTIFICARE_GARANTIE.map((p) => <p key={p}>{p}</p>)}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
              <a
                href={NOTIFICARE_GARANTIE.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
              >
                Mai multe despre drepturile tale: {NOTIFICARE_GARANTIE.urlAfisat}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              {/* Fisierul insusi, intr-o fila noua: acolo omul il poate mari cu degetele cat vrea. */}
              <a
                href={NOTIFICARE_GARANTIE.src}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-black/70 underline underline-offset-4"
              >
                Deschide la mărime mare
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
