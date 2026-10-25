"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cutiaSectiunii, sectiuneaDeSub } from "@/lib/storefront/design/contur-editor";
import { ETICHETA_ATTR, PREVIEW_MESSAGE, SECTION_ATTR, isPreviewMessage } from "@/lib/storefront/design/preview-protocol";

/**
 * Conturul sectiunilor in previzualizarea editorului unic (etapa 3 din
 * `docs/editor-magazin/PLAN.md`).
 *
 * Doua contururi: „peste”, subtire, cu numele sectiunii, pentru cea de sub mouse
 * (aici) sau de sub randul din arbore (din editor); „selectat”, gros, pentru
 * nodul deschis in panou. Selectia o tine editorul si o trimite prin
 * `evidentiere`; aici doar se deseneaza.
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

export default function ConturEditor() {
  const radacina = useRef<HTMLDivElement>(null);
  const peste = useRef<HTMLDivElement>(null);
  const selectat = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dinMouse: string | null = null;
    let dinArbore: string | null = null;
    let idSelectat: string | null = null;
    let cadru = 0;

    function pune(strat: HTMLDivElement | null, id: string | null) {
      if (!strat) return;
      const marcaj = id ? document.querySelector<HTMLElement>(`[${SECTION_ATTR}="${CSS.escape(id)}"]`) : null;
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
    }
    const programeaza = () => {
      if (!cadru) cadru = requestAnimationFrame(deseneaza);
    };

    function laMiscare(e: PointerEvent) {
      // Doar mouse-ul: pe ecranul tactil nu exista „peste”, iar un deget care
      // deruleaza ar fi aprins si stins contururi pe toata pagina.
      if (e.pointerType !== "mouse") return;
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
      if (schimbari.some((s) => !radacina.current?.contains(s.target))) programeaza();
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
    <div ref={radacina} aria-hidden="true">
      <div ref={peste} style={strat(1, "rgba(37, 99, 235, 0.04)")}>
        <span style={eticheta(false)} />
      </div>
      <div ref={selectat} style={strat(2, "transparent")}>
        <span style={eticheta(true)} />
      </div>
    </div>,
    document.body,
  );
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
