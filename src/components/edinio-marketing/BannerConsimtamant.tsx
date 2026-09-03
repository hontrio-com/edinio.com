"use client";

import { useState } from "react";
import Link from "next/link";
import { scrieHotararea, useConsimtamant } from "@/lib/edinio-marketing/consimtamant-browser";
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
  const [detaliat, setDetaliat] = useState(false);

  /*
    ═══ ⚠ AICI A STAT UN MECANISM DE REDESCHIDERE, SCOS PE 03.09.2026 ═══

    Bannerul asculta un eveniment (`edinio-deschide-setari-cookie`) prin care
    putea fi readus in pagina dupa ce omul alesese o data. Numai ca nimeni nu-l
    striga: `deschideSetari()` n-avea niciun apelant in tot repo-ul — numai
    definitia si ascultatorul asta.

    ⚠ DE CE E MAI RAU DECAT „ceva nefolosit". Eu insumi m-am pacalit cu el: am
    reprodus un defect dispecerizand evenimentul din consola si am scris in
    comentarii ca defectul se vede „pe `/preturi`". Un om nu putea ajunge acolo.
    Codul mort nu doar ca ocupa loc — el minte despre ce se poate intampla.

    ⚠ CUM SE SCHIMBA HOTARAREA ACUM: din subsol, „Setari Cookies" duce la
    `/cookies/setari`, unde panoul e permanent. O navigare, nu o fereastra peste
    pagina — si nimic care sa se strice in tacere.

    ⚠ HOTARAREA SE CITESTE PRIN `useConsimtamant`, nu cu un efect care pune stare.
    Un `setState` sincron la montare inseamna o a doua randare la fiecare
    incarcare de pagina, pentru toata lumea, inclusiv pentru cine a ales demult.
  */

  const initiala: Alegere = c.stare
    ? { statistici: c.stare.statistici, marketing: c.stare.marketing }
    : ALEGERE_GOALA;

  /*
    ⚠ SE ARATA DOAR DUPA HIDRATARE. `c.mounted` e fals si pe server, si la prima
    trecere din browser — deci cele doua randari ies identice si hidratarea tine.
    Bannerul e pentru cine n-a ales inca; cine a ales isi schimba alegerea din
    `/cookies/setari`.
  */
  if (!c.mounted || c.stare) return null;

  const inchide = () => setDetaliat(false);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Alegerea ta despre cookie-uri"
      /*
        ⚠ CARTELA JOS-STANGA, NU BARA PE TOATA LATIMEA.

        Prima forma era `inset-x-0 bottom-0` cu `bg-white/95` si acoperea butoanele
        plutitoare de telefon si WhatsApp (`StickyContact`, `fixed bottom-6
        right-6`). Iar fundalul semi-transparent lasa textul paginii sa razbata
        prin el — arata a defect, nu a alegere.

        Acum: fundal OPAC, si latime marginita ancorata la stanga, deci pe ecran
        mare nu ajunge niciodata unde stau butoanele.

        ⚠ IAR PE TELEFON STA DEASUPRA LOR: `bottom-[138px]` = doua butoane de 48px
        plus spatiul dintre ele plus `bottom-6`. Cifra e legata de `StickyContact`
        (`fixed bottom-6 right-6`, doua ancore `h-12` cu `gap-2.5`) — daca se
        adauga acolo un al treilea buton, aici trebuie crescuta.

        ⚠ SI DE CE ASA, si nu ridicand butoanele cat timp bannerul e afisat:
        `StickyContact` e dinadins FARA `"use client"`, scos pe 31.08.2026 dupa ce
        s-a masurat. Ar fi trebuit sa-l fac componenta de client ca sa asculte
        consimtamantul — adica sa stric o optimizare dovedita ca sa-mi repar mie
        asezarea. Bannerul se muta, nu ele.

        ⚠ `z-[60]` ramane: peste `z-40` (bara de meniu) n-are voie nimic altceva,
        dar o intrebare la care omul TREBUIE sa poata raspunde e exceptia.
      */
      className="fixed bottom-[138px] left-4 right-4 z-[60] rounded-[14px] border border-hairline bg-white shadow-[0_8px_40px_rgba(0,0,0,0.14)] sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-[640px]"
    >
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        {!detaliat ? (
          <div className="flex flex-col gap-4">
            <div className="min-w-0">
              <p className="text-[14px] leading-relaxed text-ink">
                Folosim cookie-uri ca sa intelegem cum e folosit site-ul si ca sa masuram reclamele.
                Nu pornim nimic pana nu alegi tu.{" "}
                <Link href="/cookies" className="underline underline-offset-2 hover:text-primary">
                  Politica de cookie-uri
                </Link>
              </p>
            </div>

            {/*
              ⚠ BUTOANELE SUB TEXT, nu langa el. Alaturi, „Personalizeaza" iesea
              din cartela si se taia la marginea ecranului — un buton pe jumatate
              vizibil nu e o alegere oferita.
            */}
            <div className="flex flex-col gap-2 sm:flex-row">
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
                className="rounded-[10px] border border-hairline px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors duration-200 hover:bg-ink/[0.04] focus:outline-none focus:ring-2 focus:ring-ink/20"
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
