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
        ⚠ DOUA FORME, DUPA LATIME: foaie lipita de marginea de jos pe telefon,
        cartela jos-stanga de la `sm` in sus.

        Prima forma era `inset-x-0 bottom-0` cu `bg-white/95`: latimea era buna,
        dar fundalul semi-transparent lasa textul paginii sa razbata prin el, si
        atunci arata a defect, nu a alegere. Fundalul e OPAC de atunci, si asa
        ramane.

        ⚠ PE TELEFON PORNESTE DE JOS DE TOT, si acopera butoanele plutitoare de
        telefon si WhatsApp (`StickyContact`, `fixed bottom-6 right-6`, `z-30`).
        Cerut de proprietar pe 09.09.2026, si e o alegere, nu o scapare: statea la
        `bottom-[138px]`, exact cat sa treaca peste ele, si atunci plutea in
        mijlocul ecranului, cu o dunga de pagina ramasa dedesubt.

        ⚠ SI ODATA CU EA A PLECAT O CIFRA CARE PUTEA MINTI. `138px` era inaltimea
        teancului de butoane din `StickyContact`, adica o masuratoare a ALTEI
        componente, copiata aici cu mana. Un al treilea buton adaugat acolo ar fi
        stricat asezarea in tacere, si nimic n-ar fi semnalat-o. Acum nu mai e
        nimic de tinut in acord.

        ⚠ ACOPERIREA TINE CAT INTREBAREA, si numai atat. Bannerul se arata o
        singura data, pana la primul raspuns; cele trei butoane ale lui sunt mereu
        la indemana, iar dupa raspuns dispare cu totul si dedesubt totul e liber.
        Asta e si motivul pentru care acoperirea e acceptabila: nu inchide nimic,
        doar amana pana la o apasare.

        ⚠ CE RAMANE DEASUPRA E DOAR BARA DE SUS (`z-50` in `SiteHeader`), fiindca
        e `sticky top-0`, deci sta oricum in capul ecranului. Meniul de telefon
        deschis e `z-40` (`MobileNav`, tot `fixed ... bottom-0`), deci trece PE SUB
        banner. Asa era si inainte, cu bannerul tot pe `z-[60]`; se schimba doar
        cat din meniu ramane acoperit. Un `z` mai mic aici ar fi mai rau: intrebarea
        ar putea ajunge sub meniu, iar omul n-ar mai avea cum sa raspunda.

        ⚠ DE LA `sm` IN SUS NU SE SCHIMBA NIMIC: latime marginita, ancorata la
        stanga, deci pe ecran mare nu ajunge niciodata unde stau butoanele. De
        acolo in sus se intorc si cele patru colturi, si chenarul intreg.

        ⚠ `z-[60]` ramane: peste `z-40` (bara de meniu) n-are voie nimic altceva,
        dar o intrebare la care omul TREBUIE sa poata raspunde e exceptia.
      */
      className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-[14px] border-t border-hairline bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.14)] sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-[640px] sm:rounded-[14px] sm:border sm:shadow-[0_8px_40px_rgba(0,0,0,0.14)]"
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
