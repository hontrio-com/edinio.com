"use client";

import { useRef } from "react";
import {
  BUCLA_S,
  DOSAR_IMAGINI,
  ECRAN,
  LATIME_PAGINA,
  IMAGINI,
  MOMENTE_DISCRETE,
  PAGINA_IMAGINII,
  PISTE,
  ZOOM_PE_PAGINA,
  latimeaImaginilor,
  paginiVizibile,
  stareaTextelor,
  transformCamera,
} from "@/lib/website/magazin-animat";
import { ScenaAnimata } from "./ScenaAnimata";
import { useAnimatieInBucla, type Bucla } from "./useAnimatieInBucla";
/* Vine cu componenta, după ramă (vezi `ScenaAnimata.tsx`). */
import "@/app/magazin-animat.css";

/**
 * Imaginea primului card din „Soluția”: un iMac pe care rulează un magazin făcut cu Edinio, de la
 * pagina de start până la comanda plasată. Bucla, cronologia și de ce merge pe compozitor sunt
 * scrise în `lib/website/magazin-animat.ts`; desenul, în `app/magazin-animat.css`. Pornirea,
 * oprirea și pregătirea sunt comune cu macheta integrărilor: `useAnimatieInBucla`.
 *
 * Cadrul din HTML e începutul buclei: monitorul din larg, cu pagina de start. Înainte de pornire se
 * aleg capturile pe mărimea ecranului (`latimeaImaginilor`) și se decodează toate cinci; altfel
 * prima trecere pe o pagină ar fi clipit goală cât se decodează imaginea ei.
 *
 * `prefers-reduced-motion`: rămâne momentul cu comanda plasată.
 */

/** Textele la începutul buclei: din ele se scrie HTML-ul, deci prima pictură e deja corectă. */
const INITIAL = stareaTextelor(0);
/** Cadrul static pentru „mișcare redusă”: comanda tocmai plasată. */
const STATIC_S = 18.9;
const CAMERA_LA_START = transformCamera(0);
/**
 * Cu ce pleacă pagina de start în HTML, înainte să aleagă componenta. E și alegerea ei pe un desktop
 * obișnuit (vezi `ZOOM_PE_PAGINA`), deci acolo captura se descarcă o singură dată.
 */
const LATIME_START = 1280;

const CAMPURI = [
  { top: 396 },
  { top: 478 },
  { top: 642, left: 484, ales: true },
  { top: 724 },
  { top: 806 },
] as const;

/** Textele care se schimbă și paginile stinse, scrise numai în clipele în care se schimbă. */
function scriitor(radacina: HTMLElement, elemente: ReadonlyMap<string, HTMLElement>) {
  const texte = new Map<string, HTMLElement>();
  radacina.querySelectorAll<HTMLElement>("[data-text]").forEach((e) => texte.set(e.dataset.text ?? "", e));
  const scrie = (cheie: string, valoare: string) => {
    const e = texte.get(cheie);
    if (e && e.textContent !== valoare) e.textContent = valoare;
  };

  return (t: number) => {
    const s = stareaTextelor(t);
    scrie("cantitate", s.cantitate);
    scrie("totalProdus", s.totalProdus);
    scrie("pretBucata", s.pretBucata);
    scrie("panaLaGratuit", s.panaLaGratuit);
    scrie("subtotal", s.subtotal);
    scrie("tva", s.tva);
    scrie("total", s.total);
    scrie("bulinaCos", s.bulinaCos);
    scrie("sumaCos", s.sumaCos);
    s.scris.forEach((v, i) => scrie(`scris-${i}`, v));

    const bara = texte.get("bara");
    const scara = `scaleX(${s.bara.toFixed(3)})`;
    if (bara && bara.style.transform !== scara) bara.style.transform = scara;
    const opacitate = s.activ ? "1" : "0";
    for (const e of [texte.get("minim"), elemente.get("finalizeaza")]) {
      if (e && e.style.opacity !== opacitate) e.style.opacity = opacitate;
    }

    /* Paginile stinse ies din pictură. Vezi `paginiVizibile` și nota din `pistaPagina`. */
    for (const [pagina, vizibila] of Object.entries(paginiVizibile(t))) {
      const e = elemente.get(`pagina-${pagina}`);
      const valoare = vizibila ? "visible" : "hidden";
      if (e && e.style.visibility !== valoare) e.style.visibility = valoare;
    }
  };
}

/**
 * Capturile, fiecare la lățimea potrivită ecranului ȘI zoomului la care apare pagina ei
 * (`ZOOM_PE_PAGINA`), descărcate și decodate. Sub „mișcare redusă” se vede un singur cadru, deci
 * doar paginile lui își iau capturile; dacă omul oprește setarea, motorul cheamă din nou.
 */
function incarcaImaginile(radacina: HTMLElement, scena: HTMLElement): Promise<unknown> {
  const vizibile = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? paginiVizibile(STATIC_S) : null;
  const imagini = Array.from(radacina.querySelectorAll<HTMLImageElement>("img[data-nume]")).filter((img) => {
    const nume = img.dataset.nume as (typeof IMAGINI)[number];
    return !vizibile || vizibile[PAGINA_IMAGINII[nume]];
  });
  const ecran = scena.offsetWidth * ECRAN.w;
  for (const img of imagini) {
    const nume = img.dataset.nume as (typeof IMAGINI)[number];
    const latime = latimeaImaginilor(ecran, window.devicePixelRatio, ZOOM_PE_PAGINA[PAGINA_IMAGINII[nume]]);
    const src = `${DOSAR_IMAGINI}/${nume}-${latime}.webp`;
    /* `eager`: suntem deja aproape de ecran, iar `decode()` pe o imagine leneșă ar aștepta
       să o descarce browserul când crede el. */
    img.loading = "eager";
    if (img.getAttribute("src") !== src) img.src = src;
  }
  return Promise.all(imagini.map((img) => img.decode().catch(() => undefined)));
}

const BUCLA: Bucla = {
  atribut: "emx",
  buclaS: BUCLA_S,
  piste: PISTE,
  momente: MOMENTE_DISCRETE,
  scriitor,
  pregateste: incarcaImaginile,
  pornireS: 0,
  staticS: STATIC_S,
  /* Scara capturilor (`.emx-vp`), scrisă din JavaScript în orice browser (de ce: `scaraPanzei`). */
  scaraPanzei: (scena, latime) => {
    const vp = scena.querySelector<HTMLElement>("[data-emx='vp']");
    if (vp) vp.style.transform = `scale(${(latime * ECRAN.w) / LATIME_PAGINA})`;
  },
};

export function MagazinAnimat({ eticheta }: { eticheta: string }) {
  const radacina = useRef<HTMLDivElement>(null);
  useAnimatieInBucla(radacina, BUCLA);

  return (
    <ScenaAnimata radacina={radacina} clasa="emx" eticheta={eticheta}>
      <div className="emx-cam" data-emx="camera" style={{ transform: CAMERA_LA_START }}>
        <div className="emx-shadow" />
        <div className="emx-foot" />
        <div className="emx-neck">
          <i />
        </div>
        <div className="emx-mon">
          <div className="emx-bez">
            <div className="emx-scr">
              <div className="emx-vp" data-emx="vp">
                {/* ── Pagina de start ── */}
                <div className="emx-pg" data-emx="pagina-home">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    data-nume="home"
                    src={`${DOSAR_IMAGINI}/home-${LATIME_START}.webp`}
                    alt=""
                    width={1920}
                    height={1700}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                  />
                </div>

                {/* ── Pagina de produs ── */}
                <div className="emx-pg" data-emx="pagina-prod">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-nume="produs-a" alt="" width={1920} height={1100} decoding="async" fetchPriority="low" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="emx-pb"
                    data-emx="varianta-b"
                    data-nume="produs-b"
                    alt=""
                    width={1920}
                    height={1100}
                    decoding="async"
                    fetchPriority="low"
                  />
                  <i className="emx-sw" data-emx="chenar-varianta" />
                  <div className="emx-hc" data-emx="cos-produs">
                    <b data-emx="cos-produs-bulina">1</b>
                    <span>18,99 lei</span>
                  </div>
                  <div className="emx-toast" data-emx="notificare">
                    <span className="emx-tk">
                      <svg viewBox="0 0 16 16">
                        <path d="m3.5 8.5 3 3 6-6.5" />
                      </svg>
                    </span>
                    <div>
                      <strong>Produs adăugat în coș</strong>
                      <small>Vesta Half Mesh Hi-Vis · ORR / S/M</small>
                    </div>
                  </div>
                </div>

                {/* ── Coșul ── Textele de aici acoperă cifrele din captură; sunt scrise
                    exact ca în magazin (fără diacritice), altfel s-ar vedea petecul. */}
                <div className="emx-pg" data-emx="pagina-cart">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-nume="cos" alt="" width={1920} height={1080} decoding="async" fetchPriority="low" />
                  <div className="emx-o" style={{ left: 568, top: 446, width: 24, height: 22, justifyContent: "center" }}>
                    <b data-text="cantitate" style={{ fontSize: 15, fontWeight: 600 }}>
                      {INITIAL.cantitate}
                    </b>
                  </div>
                  <div className="emx-o" style={{ left: 990, top: 365, width: 124, height: 26, justifyContent: "flex-end" }}>
                    <b data-text="totalProdus" style={{ fontSize: 17, fontWeight: 700, color: "#FE3D2E" }}>
                      {INITIAL.totalProdus}
                    </b>
                  </div>
                  <div className="emx-o" style={{ left: 518, top: 409, width: 140, height: 17 }}>
                    <span data-text="pretBucata" style={{ fontSize: 12.5, color: "#6E6E72" }}>
                      {INITIAL.pretBucata}
                    </span>
                  </div>
                  <div className="emx-o" style={{ left: 421, top: 276, width: 420, height: 20 }}>
                    <span style={{ fontSize: 14, color: "#6E6E72" }}>
                      Mai adauga{" "}
                      <b data-text="panaLaGratuit" style={{ color: "#111", fontWeight: 700 }}>
                        {INITIAL.panaLaGratuit}
                      </b>{" "}
                      pentru livrare gratuita
                    </span>
                  </div>
                  <span className="emx-bar" style={{ left: 423, top: 302 }}>
                    <i data-text="bara" style={{ transform: `scaleX(${INITIAL.bara.toFixed(3)})` }} />
                  </span>
                  <div className="emx-o" style={{ left: 1380, top: 318, width: 112, height: 20, justifyContent: "flex-end" }}>
                    <span data-text="subtotal" style={{ fontSize: 14.5, color: "#111" }}>
                      {INITIAL.subtotal}
                    </span>
                  </div>
                  <div className="emx-o" style={{ left: 1380, top: 374, width: 112, height: 20, justifyContent: "flex-end" }}>
                    <span data-text="tva" style={{ fontSize: 14.5, color: "#111" }}>
                      {INITIAL.tva}
                    </span>
                  </div>
                  <div className="emx-o" style={{ left: 1370, top: 410, width: 122, height: 26, justifyContent: "flex-end" }}>
                    <b data-text="total" style={{ fontSize: 17, fontWeight: 700, color: "#FE3D2E" }}>
                      {INITIAL.total}
                    </b>
                  </div>
                  <i className="emx-min" data-text="minim" />
                  <div className="emx-fin" data-emx="finalizeaza">
                    Finalizeaza comanda
                  </div>
                  <div className="emx-hc emx-hc2">
                    <b data-text="bulinaCos">{INITIAL.bulinaCos}</b>
                    <span data-text="sumaCos">{INITIAL.sumaCos}</span>
                  </div>
                </div>

                {/* ── Checkout ── */}
                <div className="emx-pg" data-emx="pagina-chk">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-nume="checkout" alt="" width={1920} height={1180} decoding="async" fetchPriority="low" />
                  {CAMPURI.map((camp, i) => (
                    <div
                      key={camp.top}
                      className={"ales" in camp ? "emx-in emx-sel" : "emx-in"}
                      data-emx={`camp-${i}`}
                      style={{ top: camp.top, ...("left" in camp ? { left: camp.left } : {}) }}
                    >
                      <span data-text={`scris-${i}`}>{INITIAL.scris[i]}</span>
                      <i data-emx={`caret-${i}`} />
                    </div>
                  ))}
                  <div className="emx-ok" data-emx="plasata">
                    <div className="emx-okc" data-emx="plasata-card">
                      <span className="emx-okt" data-emx="plasata-bifa">
                        <svg viewBox="0 0 24 24">
                          <path d="m6 12.5 4 4 8-9" />
                        </svg>
                      </span>
                      <strong>Comanda a fost plasată!</strong>
                      <p>
                        Comanda <b>#10482</b> · 306,13 lei
                      </p>
                      <small>Vei primi confirmarea pe email și SMS.</small>
                      <em>Continuă cumpărăturile</em>
                    </div>
                  </div>
                </div>

                {/* ── Cursorul ── */}
                <div className="emx-cur" data-emx="cursor">
                  <svg className="emx-ar" data-emx="cursor-sageata" viewBox="0 0 24 24">
                    <path
                      d="M4 2.5v17.2l4.6-4.4 3 6.6 3-1.4-3-6.4h6.3z"
                      fill="#111"
                      stroke="#fff"
                      strokeWidth={1.4}
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg className="emx-hd" data-emx="cursor-mana" viewBox="0 0 24 24">
                    <path
                      d="M9 3.2c0-1 1.8-1 1.8 0V11l.4-.1V8.6c0-1 1.8-1 1.8 0v2.6l.4-.1V9.5c0-1 1.8-1 1.8 0v2l.4-.1v-.9c0-1 1.8-1 1.8 0v5.8c0 3-2 5.4-5 5.4h-1.2c-2 0-3.2-1-4.4-2.6L4 14.6c-.6-.8.6-1.8 1.4-1.2L9 15.6z"
                      fill="#fff"
                      stroke="#111"
                      strokeWidth={1.3}
                      strokeLinejoin="round"
                    />
                  </svg>
                  <i className="emx-rp" data-emx="clic" />
                </div>
              </div>
              <i className="emx-glare" />
            </div>
          </div>
          <div className="emx-chin" />
        </div>
      </div>
    </ScenaAnimata>
  );
}
