"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cutiaSectiunii, sectiuneaDeSub, type Cutie } from "@/lib/storefront/design/contur-editor";
import {
  ADAUGA_ATTR,
  ETICHETA_ATTR,
  MARGINE_ATTR,
  PREVIEW_MESSAGE,
  isPreviewMessage,
  selectorMarcaj,
} from "@/lib/storefront/design/preview-protocol";

/**
 * Conturul sectiunilor in previzualizarea editorului unic (etapa 3 din
 * `docs/editor-magazin/PLAN.md`).
 *
 * Doua contururi: „peste”, subtire, cu numele sectiunii, pentru cea de sub mouse
 * (aici) sau de sub randul din arbore (din editor); „selectat”, gros, pentru
 * nodul deschis in panou. Selectia o tine editorul si o trimite prin
 * `evidentiere`; aici doar se deseneaza.
 *
 * „+” (etapa 10): pe elementul de sub mouse (altfel pe cel selectat, ca pe ecranul
 * tactil, unde nu exista „peste”), pe marginea de jos si, la primul din lista lui,
 * si pe cea de sus. Unde are voie il spune editorul (`adaugare`); clicul il citeste
 * `useDesignPreview`, care opreste orice clic inainte de React, si il anunta editorului.
 *
 * Se incarca la cerere si DOAR in modul editor (`next/dynamic` cu `ssr: false`
 * in gazde), deci magazinul public nu primeste nimic din el, iar `document`
 * exista mereu la randare. Desenul ocoleste React: cutiile se schimba la fiecare
 * derulare, iar o randare pe cadru ar fi refacut stratul de 60 de ori pe secunda.
 */

/** Albastru fix, nu culoarea magazinului: conturul e al editorului, nu al temei. */
const ALBASTRU = "#2563eb";
/** Cat de sus sta eticheta deasupra conturului; mai aproape de margine intra in el. */
const INALTIME_ETICHETA = 20;
/** Diametrul butonului „+”. */
const PLUS = 26;
/**
 * Cat intra „+” peste element. Butonul sta in AFARA lui, lipit de margine: centrat pe ea, pe un element scund
 * (un rand din subsolul centrat, un titlu) acoperea chiar mijlocul lui, iar clicul dat ca sa-l aleaga nimerea
 * „+”-ul (vazut la proba etapei 11).
 */
const PESTE_MARGINE = 4;

export default function ConturEditor() {
  const radacina = useRef<HTMLDivElement>(null);
  const peste = useRef<HTMLDivElement>(null);
  const selectat = useRef<HTMLDivElement>(null);
  const plusuri = useRef<HTMLDivElement>(null);
  const plusSus = useRef<HTMLButtonElement>(null);
  const plusJos = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let dinMouse: string | null = null;
    let dinArbore: string | null = null;
    let idSelectat: string | null = null;
    /** Elementele cu „+”, si daca au si „deasupra”; le trimite editorul in `evidentiere`. */
    let puncte = new Map<string, boolean>();
    let cadru = 0;

    /** Un „+” la mijlocul unei margini a cutiei, in afara ei (`sus` = marginea `y` e deasupra lui); ascuns cand n-are ce arata. */
    function punePlus(buton: HTMLButtonElement | null, id: string | null, y: number | null, cutie: Cutie | null, sus: boolean) {
      if (!buton) return;
      if (!id || y === null || !cutie) {
        buton.style.display = "none";
        return;
      }
      buton.style.display = "flex";
      const varf = sus ? y - PLUS + PESTE_MARGINE : y - PESTE_MARGINE;
      buton.style.transform = `translate(${cutie.stanga + cutie.latime / 2 - PLUS / 2}px, ${varf}px)`;
      buton.setAttribute(ADAUGA_ATTR, id);
    }

    function deseneazaPlusurile() {
      // Mouse-ul are intaietate; fara el (ecran tactil, mouse-ul afara), elementul selectat.
      const id = dinMouse ? (puncte.has(dinMouse) ? dinMouse : null) : idSelectat && puncte.has(idSelectat) ? idSelectat : null;
      const marcaj = id ? document.querySelector<HTMLElement>(selectorMarcaj(id)) : null;
      const cutie = cutiaSectiunii(marcaj);
      punePlus(plusJos.current, cutie ? id : null, cutie ? cutie.sus + cutie.inaltime : null, cutie, false);
      punePlus(plusSus.current, cutie && id && puncte.get(id) ? id : null, cutie ? cutie.sus : null, cutie, true);
    }

    function pune(strat: HTMLDivElement | null, id: string | null) {
      if (!strat) return;
      // Un id de bloc (`<sectiune>/<bloc>`) isi cauta marcajul de bloc, altfel cel de sectiune.
      const marcaj = id ? document.querySelector<HTMLElement>(selectorMarcaj(id)) : null;
      const cutie = cutiaSectiunii(marcaj);
      if (!marcaj || !cutie) {
        strat.style.display = "none";
        return;
      }
      strat.style.display = "block";
      strat.style.transform = `translate(${cutie.stanga}px, ${cutie.sus}px)`;
      strat.style.width = `${cutie.latime}px`;
      strat.style.height = `${cutie.inaltime}px`;
      const eticheta = strat.firstElementChild as HTMLElement | null;
      if (!eticheta) return;
      const text = marcaj.getAttribute(ETICHETA_ATTR) || id || "";
      // Doar cand se schimba: o scriere identica tot inlocuieste nodul de text.
      if (eticheta.textContent !== text) eticheta.textContent = text;
      eticheta.style.top = `${pozitiaEtichetei(cutie.sus)}px`;
    }

    function deseneaza() {
      cadru = 0;
      const idPeste = dinMouse ?? dinArbore;
      pune(selectat.current, idSelectat);
      // Peste cel selectat nu se mai pune al doilea contur: ar dubla eticheta.
      pune(peste.current, idPeste && idPeste !== idSelectat ? idPeste : null);
      deseneazaPlusurile();
    }
    const programeaza = () => {
      if (!cadru) cadru = requestAnimationFrame(deseneaza);
    };

    function laMiscare(e: PointerEvent) {
      // Doar mouse-ul: pe ecranul tactil nu exista „peste”, iar un deget care
      // deruleaza ar fi aprins si stins contururi pe toata pagina.
      if (e.pointerType !== "mouse") return;
      // Pe „+” elementul ramane cel de dinainte: butonul sta pe granita cu vecinul,
      // iar fara asta ar fi sarit pe vecin (sau ar fi disparut) chiar sub cursor.
      if (plusuri.current?.contains(e.target as Node | null)) return;
      const id = sectiuneaDeSub(e.target as Element | null)?.id ?? null;
      if (id !== dinMouse) {
        dinMouse = id;
        programeaza();
      }
    }
    function laIesire(e: PointerEvent) {
      if (e.relatedTarget || !dinMouse) return;
      dinMouse = null;
      programeaza();
    }
    function laMesaj(e: MessageEvent) {
      if (e.origin !== window.location.origin || !isPreviewMessage(e.data)) return;
      if (e.data[PREVIEW_MESSAGE] !== "evidentiere") return;
      idSelectat = e.data.selectat;
      dinArbore = e.data.peste;
      puncte = new Map((e.data.adaugare ?? []).map((p) => [p.id, p.sus === true]));
      programeaza();
    }

    document.addEventListener("pointermove", laMiscare, { passive: true });
    document.addEventListener("pointerout", laIesire);
    window.addEventListener("scroll", programeaza, { passive: true, capture: true });
    window.addEventListener("resize", programeaza);
    window.addEventListener("message", laMesaj);
    /*
     * Pagina se schimba si fara derulare: designul trimis de editor reaseaza
     * sectiunile, o imagine se incarca, un rand isi primeste produsele. Schimbarile
     * din strat (stilul conturului, textul etichetei) nu conteaza: altfel fiecare
     * desen ar fi cerut urmatorul, la nesfarsit.
     */
    const observator = new MutationObserver((schimbari) => {
      if (schimbari.some((s) => !radacina.current?.contains(s.target) && !plusuri.current?.contains(s.target))) programeaza();
    });
    observator.observe(document.body, { childList: true, subtree: true });
    const redimensionare = new ResizeObserver(programeaza);
    redimensionare.observe(document.body);
    // Stratul se monteaza dupa „ready”: cere singur evidentierea curenta.
    window.parent.postMessage({ [PREVIEW_MESSAGE]: "conturGata" }, window.location.origin);

    return () => {
      document.removeEventListener("pointermove", laMiscare);
      document.removeEventListener("pointerout", laIesire);
      window.removeEventListener("scroll", programeaza, { capture: true });
      window.removeEventListener("resize", programeaza);
      window.removeEventListener("message", laMesaj);
      observator.disconnect();
      redimensionare.disconnect();
      if (cadru) cancelAnimationFrame(cadru);
    };
  }, []);

  // Garda pentru un import static gresit; gazdele il incarca fara server.
  if (typeof document === "undefined") return null;
  // Stratul sta in `body`, nu in arborele paginii: un stramos cu `transform`
  // (tema, animatiile variantelor) ar fi mutat `position: fixed` in el.
  return createPortal(
    <>
      <div ref={radacina} aria-hidden="true">
        <div ref={peste} style={strat(1, "rgba(37, 99, 235, 0.04)")}>
          <span style={eticheta(false)} />
        </div>
        <div ref={selectat} style={strat(2, "transparent")}>
          <span style={eticheta(true)} />
        </div>
      </div>
      {/* Butoanele „+”: in afara stratului `aria-hidden`, fiindca se apasa. */}
      <div ref={plusuri}>
        <button ref={plusSus} type="button" {...{ [MARGINE_ATTR]: "sus" }} aria-label="Adaugă deasupra" title="Adaugă deasupra" style={butonPlus()}>
          <SemnPlus />
        </button>
        <button ref={plusJos} type="button" {...{ [MARGINE_ATTR]: "jos" }} aria-label="Adaugă dedesubt" title="Adaugă dedesubt" style={butonPlus()}>
          <SemnPlus />
        </button>
      </div>
    </>,
    document.body,
  );
}

function SemnPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ pointerEvents: "none" }}>
      <path d="M7 1.5v11M1.5 7h11" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Butonul „+”: deasupra contururilor, singurul lucru din strat care primeste clicuri. */
function butonPlus(): CSSProperties {
  return {
    display: "none",
    position: "fixed",
    top: 0,
    left: 0,
    width: PLUS,
    height: PLUS,
    padding: 0,
    margin: 0,
    border: 0,
    borderRadius: "50%",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    pointerEvents: "auto",
    zIndex: 2147483647,
    background: ALBASTRU,
    boxShadow: "0 0 0 3px #fff, 0 2px 8px rgba(15, 23, 42, 0.3)",
  };
}

/**
 * Unde sta eticheta, fata de marginea de sus a conturului.
 *
 * Deasupra lui cand incape. Altfel inauntru, lipita de marginea de sus a
 * ferestrei: o sectiune derulata pe jumatate are marginea de sus deasupra
 * ecranului, iar eticheta pusa acolo disparea odata cu ea (vazut la proba din
 * 25.10.2026, pe bannerul selectat).
 */
function pozitiaEtichetei(sus: number): number {
  return sus >= INALTIME_ETICHETA ? -INALTIME_ETICHETA : Math.max(0, -sus);
}

function strat(grosime: number, fundal: string): CSSProperties {
  return {
    display: "none",
    position: "fixed",
    top: 0,
    left: 0,
    pointerEvents: "none",
    zIndex: 2147483646,
    boxShadow: `inset 0 0 0 ${grosime}px ${ALBASTRU}`,
    background: fundal,
  };
}

function eticheta(plina: boolean): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    height: INALTIME_ETICHETA,
    padding: "0 8px",
    font: "500 11px/20px system-ui, -apple-system, Segoe UI, sans-serif",
    whiteSpace: "nowrap",
    borderRadius: 4,
    color: plina ? "#fff" : ALBASTRU,
    background: plina ? ALBASTRU : "#fff",
    boxShadow: `inset 0 0 0 1px ${ALBASTRU}`,
  };
}
