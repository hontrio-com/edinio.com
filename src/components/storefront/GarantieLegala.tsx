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
  /* Butonul apare de mai multe ori pe aceeasi pagina (subsol + produs), deci id-urile nu pot fi fixe. */
  const id = useId();
  const idTitlu = `${id}-titlu`;
  const idText = `${id}-text`;

  function deschide() {
    setDeschisaOdata(true);
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
        className="m-auto w-[calc(100%-2rem)] max-w-[640px] max-h-[90vh] overflow-hidden rounded-2xl bg-white p-0 text-[#18181b] shadow-2xl backdrop:bg-black/60"
      >
        <div className="flex max-h-[90vh] flex-col">
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
          <div ref={continutRef} className="overflow-y-auto p-4">
            {deschisaOdata && (
              // eslint-disable-next-line @next/next/no-img-element -- fisierul oficial, fara conversie (vezi mai sus)
              <img
                src={NOTIFICARE_GARANTIE.src}
                width={NOTIFICARE_GARANTIE.latime}
                height={NOTIFICARE_GARANTIE.inaltime}
                alt="Notificarea Uniunii Europene privind garanția legală de conformitate"
                aria-describedby={idText}
                className="h-auto w-full"
              />
            )}
            <div id={idText} className="sr-only">
              {TEXT_NOTIFICARE_GARANTIE.map((p) => <p key={p}>{p}</p>)}
            </div>
            <a
              href={NOTIFICARE_GARANTIE.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
            >
              Mai multe despre drepturile tale: {NOTIFICARE_GARANTIE.urlAfisat}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
