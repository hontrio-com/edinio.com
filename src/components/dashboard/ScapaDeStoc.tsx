"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";

import { useDialogAccesibil } from "./useDialogAccesibil";
import {
  ADRESA_SCAPA_DE_STOC, CE_FACE, CUTIA_CADRULUI, INDEMNUL, NUMELE_LOR, VERDELE_LOR,
} from "@/lib/parteneri/scapa-de-stoc";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SCAPĂ DE STOC, IN BARA DE SUS                                 (21.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Parteneriat: marketplace B2B unde comerciantul isi vinde stocul ramas. Se
  deschide INTR-O FEREASTRA din panou, cu un cadru, nu intr-o fila noua: asa
  omul nu-si pierde locul din panou pentru o privire aruncata acolo.

  ⚠ CADRUL POATE RAMANE ALB, si browserul nu spune nimic. Azi ei n-au nici
  `X-Frame-Options`, nici `Content-Security-Policy` (masurat pe 21.09.2026), deci
  merge. Daca adauga vreodata unul, cadrul se goleste in tacere. De aceea
  legatura catre fila noua sta LA VEDERE tot timpul, nu apare doar cand ceva pare
  stricat: noi n-avem cum sa aflam din afara cadrului ca s-a golit.

  ⚠ CE ARE VOIE PAGINA LOR sta in `CUTIA_CADRULUI`, cu motivele. Pe scurt: nu
  poate scoate comerciantul din panou.

  ⚠ VERDELE LOR (`#3FA88A`) E FOLOSIT DOAR IN SIGLA. Pe fundal deschis da un
  contrast de ~2,6:1, sub pragul de 4,5:1 — e o culoare de marca, nu de text.
  Butonul ramane in forma celorlalte din bara, ca sa nu tipe peste ele.
*/

/**
 * Marca lor, desenata pe loc.
 *
 * ⚠ Bara aia oblica e `#3A4147` in fisierul lor — aproape negru, deci pe tema
 * intunecata ar fi disparut in fundal. Aici mosteneste culoarea textului
 * (`currentColor`), asa ca se vede pe amandoua temele. Verdele ramane al lor,
 * neatins: el E marca.
 */
function Marca({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 100" className={className} aria-hidden="true" focusable="false">
      <path
        d="M 75 25 Q 75 15 60 15 L 35 15 Q 20 15 20 30 Q 20 45 35 45 L 60 45 Q 75 45 75 60 Q 75 75 60 75 L 35 75 Q 20 75 20 65"
        stroke={VERDELE_LOR} strokeWidth="8" strokeLinecap="round" fill="none"
      />
      <line
        x1="100" y1="8" x2="130" y2="92"
        stroke="currentColor" strokeWidth="4" strokeLinecap="round"
      />
    </svg>
  );
}

export function ButonScapaDeStoc() {
  const [deschis, setDeschis] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDeschis(true)}
        title={CE_FACE}
        /*
          ⚠ NUMELE SE SCRIE EXPLICIT, nu se lasa pe seama etichetei de langa.
          Sub `lg` eticheta e `display:none`, iar ce e ascuns asa NU intra in
          numele accesibil. Ar fi ramas numele din `title` — adica toata descrierea
          de o suta cincizeci de semne, citita cu glas tare la fiecare trecere, si
          numai atata vreme cat cineva nu scoate `title`-ul ca „nu se vede pe
          telefon oricum".
        */
        aria-label={NUMELE_LOR}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Marca className="h-3.5 w-4.5" />
        {/*
          Ascuns pe ecrane mici, ca la „Adauga": in bara de sus a unui telefon nu
          incap doua etichete, iar marca singura ramane recunoscuta. Masurat pe un
          ecran de 374 px: bara nu da pe dinafara, butonul incape intreg.
        */}
        <span className="hidden lg:inline">{NUMELE_LOR}</span>
      </button>

      {deschis && <Fereastra inchide={() => setDeschis(false)} />}
    </>
  );
}

function Fereastra({ inchide }: { inchide: () => void }) {
  /* Escape inchide, focusul ramane inauntru si se intoarce de unde a plecat. */
  const cutia = useDialogAccesibil(true, inchide);

  /*
    ═══ ⚠⚠ DE CE PRINTR-UN PORTAL, SI NU PE LOC ═══

    Bara de sus e `sticky ... backdrop-blur-sm` (`DashboardTopbar`, antetul). Orice
    element cu `backdrop-filter` (ca si `transform` sau `filter`) devine BLOC DE
    REFERINTA pentru descendentii lui `position: fixed`. Adica `fixed inset-0` de
    mai jos nu s-ar fi asezat fata de ecran, ci fata de bara de 56 de pixeli.

    ⚠ MASURAT, nu banuit: prima forma a iesit o fereastra taiata sus, inalta cat un
    sfert de ecran, lipita de bara. Se vedea DOAR pe ecran — `tsc` si probele
    treceau, fiindca nimic din cod nu e gresit acolo.

    ⚠ Celelalte ferestre ale panoului n-au patit-o fiindca toate se deschid din
    CONTINUTUL paginii, nu din bara. Prima care se deschide din bara o pateste, si
    ea e asta.

    ⚠ FARA PAZA DE „MONTAT", si nu din neglijenta fata de randarea pe server.
    Prima forma avea un `useState` + `useEffect` ca sa amane portalul pana in
    browser — tiparul obisnuit cand `document` ar putea lipsi. Aici nu poate:
    componenta asta se randeaza DOAR dupa un clic, deci numai in browser. Paza era
    o superstitie, iar regula de lint a avut dreptate sa se planga de ea.
  */
  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={inchide} />

      <div
        ref={cutia}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titlu-scapa-de-stoc"
        className="fixed left-1/2 top-1/2 z-50 flex h-[88vh] w-[min(80rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <span className="mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-muted text-foreground">
            <Marca className="h-4 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <h2 id="titlu-scapa-de-stoc" className="text-sm font-semibold text-foreground">
              {NUMELE_LOR}
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                partener
              </span>
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {INDEMNUL.join(" ")} {CE_FACE}
            </p>
          </div>

          {/*
            ⚠ IESIREA CATRE FILA NOUA, MEREU LA VEDERE. Vezi nota din capul
            fisierului: un cadru blocat se goleste fara niciun mesaj, iar asta e
            singurul lucru care il scoate pe om din fundatura.

            ⚠ `noopener noreferrer`: fara `noopener`, fila deschisa primeste
            `window.opener` si poate muta panoul nostru de sub picioarele omului.
          */}
          <a
            href={ADRESA_SCAPA_DE_STOC}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Deschide în filă nouă</span>
          </a>

          <button
            type="button"
            onClick={inchide}
            aria-label="Închide"
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/*
          ⚠ Fundal alb sub cadru, nu `bg-card`: pagina lor e pe alb, iar pe tema
          intunecata cadrul ar fi clipit intai gri si apoi alb la fiecare deschidere.
        */}
        <iframe
          src={ADRESA_SCAPA_DE_STOC}
          title={`${NUMELE_LOR}: ${CE_FACE}`}
          sandbox={CUTIA_CADRULUI}
          className="min-h-0 flex-1 border-0 bg-white"
          /* Ei au nevoie de referrer ca sa lege vizita de noi; adresa il poarta oricum. */
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    </>,
    document.body,
  );
}
