"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cutiaSectiunii, sectiuneaDeSub, type Cutie } from "@/lib/storefront/design/contur-editor";
import {
  ACTIUNE_ATTR,
  ACTIUNE_ID_ATTR,
  ADAUGA_ATTR,
  ETICHETA_ATTR,
  MARGINE_ATTR,
  MENIU_ATTR,
  PREVIEW_MESSAGE,
  type IntrareMeniu,
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
 * Meniul de clic dreapta (08.11.2026): clicul dreapta pe un element il anunta editorului (`meniu`), care raspunde cu
 * intrarile lui (`meniuActiuni`); aici doar se deseneaza, iar alegerea o citeste `useDesignPreview`, ca pe „+”. Cat
 * e deschis, conturul subtire ramane pe elementul meniului, nu pe ce atinge mouse-ul in drum spre el.
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
  const meniu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dinMouse: string | null = null;
    let dinArbore: string | null = null;
    let idSelectat: string | null = null;
    /** Elementele cu „+”, si daca au si „deasupra”; le trimite editorul in `evidentiere`. */
    let puncte = new Map<string, boolean>();
    let cadru = 0;
    /** Elementul meniului deschis; tine conturul subtire pe el. */
    let idMeniu: string | null = null;

    function inchideMeniul() {
      if (!idMeniu) return;
      idMeniu = null;
      if (meniu.current) meniu.current.style.display = "none";
      programeaza();
    }

    function deschideMeniul(id: string, x: number, y: number, actiuni: IntrareMeniu[]) {
      const el = meniu.current;
      if (!el || actiuni.length === 0) return;
      const marcaj = document.querySelector<HTMLElement>(selectorMarcaj(id));
      el.replaceChildren();
      const titlu = document.createElement("div");
      titlu.textContent = marcaj?.getAttribute(ETICHETA_ATTR) || "Element";
      Object.assign(titlu.style, stilTitluMeniu());
      el.appendChild(titlu);
      for (const a of actiuni) {
        // „Șterge” sta deoparte, sub o linie: sa nu se apese din greseala in locul vecinului.
        if (a.cheie === "sterge") {
          const linie = document.createElement("div");
          Object.assign(linie.style, { height: "1px", margin: "4px 0", background: "#e2e8f0" });
          el.appendChild(linie);
        }
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = a.eticheta;
        b.setAttribute("role", "menuitem");
        b.setAttribute(ACTIUNE_ATTR, a.cheie);
        b.setAttribute(ACTIUNE_ID_ATTR, id);
        if (a.dezactivata) b.setAttribute("aria-disabled", "true");
        Object.assign(b.style, stilIntrareMeniu(a.cheie === "sterge", !!a.dezactivata));
        if (!a.dezactivata) {
          const fundal = a.cheie === "sterge" ? "#fef2f2" : "#f1f5f9";
          b.addEventListener("pointerenter", () => { b.style.background = fundal; });
          b.addEventListener("pointerleave", () => { b.style.background = "transparent"; });
        }
        el.appendChild(b);
      }
      idMeniu = id;
      el.style.display = "block";
      // Masurat dupa umplere; intors spre stanga sau in sus cand nu incape langa cursor.
      const { width, height } = el.getBoundingClientRect();
      const stanga = Math.max(4, Math.min(x, window.innerWidth - width - 4));
      const sus = y + height > window.innerHeight - 4 ? Math.max(4, y - height) : y;
      el.style.transform = `translate(${stanga}px, ${sus}px)`;
      programeaza();
    }

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
      const idPeste = idMeniu ?? dinMouse ?? dinArbore;
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
      if (meniu.current?.contains(e.target as Node | null)) return;
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
      if (e.data[PREVIEW_MESSAGE] === "meniuActiuni") {
        const { id, x, y, actiuni } = e.data;
        deschideMeniul(id, x, y, actiuni);
        return;
      }
      // Designul schimbat (dupa o actiune din meniu, dupa Anulează) muta elementele: meniul vechi nu mai e al lor.
      if (e.data[PREVIEW_MESSAGE] === "design") inchideMeniul();
      if (e.data[PREVIEW_MESSAGE] !== "evidentiere") return;
      idSelectat = e.data.selectat;
      dinArbore = e.data.peste;
      puncte = new Map((e.data.adaugare ?? []).map((p) => [p.id, p.sus === true]));
      programeaza();
    }

    /** Clic dreapta: meniul elementului de sub cursor, nu cel al browserului. In afara oricarui element, al browserului. */
    function laMeniu(e: MouseEvent) {
      if (meniu.current?.contains(e.target as Node | null)) {
        e.preventDefault();
        return;
      }
      const id = sectiuneaDeSub(e.target as Element | null)?.id;
      if (!id) return;
      e.preventDefault();
      inchideMeniul();
      window.parent.postMessage({ [PREVIEW_MESSAGE]: "meniu", id, x: e.clientX, y: e.clientY }, window.location.origin);
    }
    /*
     * Orice clic inchide meniul. DUPA clic, nu inainte: alegerea o citeste `useDesignPreview` din acelasi clic. Pe
     * fereastra, in faza de captura: inaintea opririi din `useDesignPreview`, care sta pe document.
     */
    const laClic = () => { if (idMeniu) setTimeout(inchideMeniul, 0); };
    function laApasare(e: PointerEvent) {
      if (idMeniu && e.button !== 2 && !meniu.current?.contains(e.target as Node | null)) inchideMeniul();
    }
    function laTasta(e: KeyboardEvent) {
      if (e.key === "Escape") inchideMeniul();
    }
    /*
     * Doar derularea PAGINII muta elementul de sub meniu. Nu orice derulare: un carusel sau o bara de anunt care se
     * misca singure trimit derulari tot timpul, iar meniul se inchidea imediat ce aparea (vazut la proba din 08.11).
     */
    function laDerulare(e: Event) {
      if (e.target === document || e.target === document.documentElement || e.target === document.scrollingElement) inchideMeniul();
    }

    document.addEventListener("contextmenu", laMeniu);
    window.addEventListener("click", laClic, true);
    window.addEventListener("pointerdown", laApasare, true);
    window.addEventListener("keydown", laTasta);
    window.addEventListener("scroll", laDerulare, { passive: true, capture: true });
    window.addEventListener("blur", inchideMeniul);
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
      if (schimbari.some((s) => !radacina.current?.contains(s.target) && !plusuri.current?.contains(s.target) && !meniu.current?.contains(s.target))) programeaza();
    });
    observator.observe(document.body, { childList: true, subtree: true });
    const redimensionare = new ResizeObserver(programeaza);
    redimensionare.observe(document.body);
    // Stratul se monteaza dupa „ready”: cere singur evidentierea curenta.
    window.parent.postMessage({ [PREVIEW_MESSAGE]: "conturGata" }, window.location.origin);

    return () => {
      document.removeEventListener("contextmenu", laMeniu);
      window.removeEventListener("click", laClic, true);
      window.removeEventListener("pointerdown", laApasare, true);
      window.removeEventListener("keydown", laTasta);
      window.removeEventListener("scroll", laDerulare, { capture: true });
      window.removeEventListener("blur", inchideMeniul);
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
      {/* Meniul de clic dreapta: il umple `deschideMeniul`, din intrarile trimise de editor. */}
      <div ref={meniu} role="menu" aria-label="Acțiuni" {...{ [MENIU_ATTR]: "" }} style={stilMeniu()} />
    </>,
    document.body,
  );
}

/** Meniul de clic dreapta: culori fixe, ale editorului, ca si conturul. */
function stilMeniu(): CSSProperties {
  return {
    display: "none",
    position: "fixed",
    top: 0,
    left: 0,
    minWidth: 180,
    padding: 4,
    zIndex: 2147483647,
    pointerEvents: "auto",
    background: "#fff",
    borderRadius: 10,
    boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.08), 0 10px 30px rgba(15, 23, 42, 0.18)",
    font: "500 13px/1.2 system-ui, -apple-system, Segoe UI, sans-serif",
    color: "#0f172a",
    textAlign: "left",
  };
}

function stilTitluMeniu(): Partial<CSSStyleDeclaration> {
  return {
    padding: "6px 10px",
    font: "600 11px/1.3 system-ui, -apple-system, Segoe UI, sans-serif",
    color: "#64748b",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "240px",
  };
}

function stilIntrareMeniu(periculoasa: boolean, stinsa: boolean): Partial<CSSStyleDeclaration> {
  return {
    display: "block",
    width: "100%",
    padding: "8px 10px",
    margin: "0",
    border: "0",
    borderRadius: "6px",
    background: "transparent",
    textAlign: "left",
    font: "inherit",
    color: stinsa ? "#cbd5e1" : periculoasa ? "#dc2626" : "#0f172a",
    cursor: stinsa ? "default" : "pointer",
    whiteSpace: "nowrap",
  };
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
