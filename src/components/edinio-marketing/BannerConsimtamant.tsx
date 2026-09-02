"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  scrieHotararea, useConsimtamant, EVENIMENT_DESCHIDE_SETARI,
} from "@/lib/edinio-marketing/consimtamant-browser";
import { PanouConsimtamant, ALEGERE_GOALA, type Alegere } from "./PanouConsimtamant";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PRIMA INTREBARE, SI SINGURA DATA CAND O PUNEM
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ TREI CAI, TOATE PE ACELASI ECRAN, FIECARE LA UN CLIC. „Accepta toate" si
  „Respinge optionalele" au ACELEASI clase — aceeasi marime, aceeasi culoare,
  acelasi contrast. Un „accepta" verde si un „respinge" scris gri, marunt, sub
  pliu, e tiparul pentru care autoritatile europene au dat amenzi: alegerea nu mai
  e libera daca una din cai e mai grea.

  ⚠ SI NU BLOCHEAZA PAGINA. O bara jos, nu un zid peste continut. Cine vrea sa
  citeasca inainte sa aleaga are voie — a nu alege inseamna a nu fi urmarit, ceea
  ce e oricum starea de plecare, deci nu pierdem nimic tinandu-l ostatic.
*/

const CLASE_BUTON_PRINCIPAL =
  "flex-1 rounded-[10px] bg-primary px-4 py-2.5 text-[14px] font-semibold text-white " +
  "transition-opacity duration-200 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40";

export function BannerConsimtamant() {
  const c = useConsimtamant();
  const [deschisDeOm, setDeschisDeOm] = useState(false);
  const [detaliat, setDetaliat] = useState(false);

  /*
    ⚠ HOTARAREA SE CITESTE PRIN `useConsimtamant`, nu cu un efect care pune stare.
    Un `setState` sincron la montare inseamna o a doua randare la fiecare
    incarcare de pagina, pentru toata lumea, inclusiv pentru cine a ales demult.
  */
  useEffect(() => {
    /* Numai ascultatorul sta in efect; starea se schimba abia cand omul apasa. */
    const deschide = () => { setDetaliat(true); setDeschisDeOm(true); };
    window.addEventListener(EVENIMENT_DESCHIDE_SETARI, deschide);
    return () => window.removeEventListener(EVENIMENT_DESCHIDE_SETARI, deschide);
  }, []);

  const initiala: Alegere = c.stare
    ? { statistici: c.stare.statistici, marketing: c.stare.marketing }
    : ALEGERE_GOALA;

  /*
    ⚠ SE ARATA DOAR DUPA HIDRATARE. `c.mounted` e fals si pe server, si la prima
    trecere din browser — deci cele doua randari ies identice si hidratarea tine.
    Cine n-a ales inca vede bannerul; cine a ales, doar daca il cere el.
  */
  const arata = c.mounted && (!c.stare || deschisDeOm);

  if (!arata) return null;

  const inchide = () => { setDeschisDeOm(false); setDetaliat(false); };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Alegerea ta despre cookie-uri"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-hairline bg-white/95 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-[880px] px-4 py-4 sm:px-6 sm:py-5">
        {!detaliat ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-relaxed text-ink">
                Folosim cookie-uri ca sa intelegem cum e folosit site-ul si ca sa masuram reclamele.
                Nu pornim nimic pana nu alegi tu.{" "}
                <Link href="/cookies" className="underline underline-offset-2 hover:text-primary">
                  Politica de cookie-uri
                </Link>
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:w-[420px] sm:flex-row">
              <button
                type="button"
                className={CLASE_BUTON_PRINCIPAL}
                onClick={() => { scrieHotararea({ statistici: true, marketing: true }, "t"); inchide(); }}
              >
                Accepta toate
              </button>
              <button
                type="button"
                className={CLASE_BUTON_PRINCIPAL}
                onClick={() => { scrieHotararea({ statistici: false, marketing: false }, "r"); inchide(); }}
              >
                Respinge optionalele
              </button>
              <button
                type="button"
                onClick={() => setDetaliat(true)}
                className="rounded-[10px] border border-hairline px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors duration-200 hover:bg-ink/[0.04] focus:outline-none focus:ring-2 focus:ring-ink/20 sm:w-auto"
              >
                Personalizeaza
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold text-ink">Alege ce ai voie sa masuram</p>
                <p className="mt-1 text-[13px] text-ink-3">
                  Iti poti schimba alegerea oricand din{" "}
                  <Link href="/cookies/setari" className="underline underline-offset-2 hover:text-primary">
                    Setari Cookies
                  </Link>
                  , in subsolul paginii.
                </p>
              </div>
              <button
                type="button"
                onClick={inchide}
                aria-label="Inchide"
                className="shrink-0 rounded-full p-1 text-ink-3 transition-colors hover:bg-ink/[0.06] hover:text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <PanouConsimtamant
              initiala={initiala}
              onAcceptaTot={() => { scrieHotararea({ statistici: true, marketing: true }, "t"); inchide(); }}
              onSalveaza={(a) => { scrieHotararea(a, "p"); inchide(); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
