"use client";

import { useRef, type ReactNode } from "react";
import {
  BUCLA_S,
  MASURATORI_IMPLICITE,
  MESAJE,
  MOMENTE_DISCRETE,
  PANZA,
  PISTE,
  PORNIRE_S,
  STATIC_S,
  masuratoriDinPagina,
  pisteCuMasuratori,
} from "@/lib/website/tehnic-animat";
import { ScenaAnimata } from "./ScenaAnimata";
import { decodeazaImaginile, facatorDeTinte } from "./tinteAnimate";
import { useAnimatieInBucla, type Bucla } from "./useAnimatieInBucla";
/* Vine cu componenta, după ramă (vezi `ScenaAnimata.tsx`). */
import "@/app/tehnic-animat.css";

/**
 * Imaginea cardului cu partea tehnică din „Soluția”: asistența Edinio pe WhatsApp, care îi pornește
 * unei cliente facturarea automată cu SmartBill. Cronologia și de ce merge pe compozitor sunt în
 * `lib/website/tehnic-animat.ts`; desenul, în `app/tehnic-animat.css`. Pornirea, oprirea și
 * pregătirea sunt comune cu celelalte machete: `useAnimatieInBucla`.
 *
 * Cadrul din HTML e clipa `PORNIRE_S`: conversația goală, asistența „online”.
 *
 * `prefers-reduced-motion`: rămâne clipa cu toată conversația și facturarea pornită.
 */

/**
 * Imaginile raster sunt micșorate cât cere cel mai mare ecran: scena de ~850 px (chiar sub pragul
 * `lg`) pe un telefon cu densitatea 3,5 ținut orizontal. Avatarul (40 px de pânză) cere atunci 152 px,
 * deci 160; sigla SmartBill (28 px înălțime) cere 106, deci 88 × 114, cu raportul originalului.
 */
const AVATAR = "/features/tehnic-animat/asistenta.webp";
/** Fâșia de sus a fundalului WhatsApp: din cei 1.396 px ai lui se văd primii 429. */
const FUNDAL = "/features/tehnic-animat/fundal-whatsapp.webp";
/**
 * Semnul Edinio al machetei, tăiat strâns pe desen. Nu `/semn.svg` al site-ului: acela are o casetă
 * pătrată cu margine goală, iar la lățimea de 18 px semnul ieșea vizibil mai mic (comparat pixel cu
 * pixel cu macheta, 16.10.2026).
 */
const SEMN = "/features/tehnic-animat/edinio.svg";
/**
 * Sigla din captură e a machetei, nu `smartbill-mic.webp` a site-ului: aceea iese cu 1,5 px mai lată
 * și mai moale la 22 px (comparat pixel cu pixel cu macheta, 16.10.2026).
 */
const SIGLA_SMARTBILL = "/features/tehnic-animat/smartbill.webp";

/** `data-eth` și stilul de start al unui element animat, socotit din pista lui. */
const tinta = facatorDeTinte("eth", PISTE, PORNIRE_S);

const VERIFICAT = (
  <path d="M12 2.5 14.3 4.6l3.1-.4.9 3 2.7 1.6-1.1 2.9 1.1 2.9-2.7 1.6-.9 3-3.1-.4L12 21.5l-2.3-2.1-3.1.4-.9-3-2.7-1.6 1.1-2.9-1.1-2.9 2.7-1.6.9-3 3.1.4z" />
);

/** Ce scrie în fiecare mesaj, în ordinea din `MESAJE`, cu ora lui. */
const CONTINUT: ReadonlyArray<{ text: ReactNode; ora: string }> = [
  { text: "Bună ziua! Cum pot activa facturarea automată cu SmartBill?", ora: "10:24" },
  {
    text: (
      <>
        Bună ziua, Elena! Durează mai puțin de un minut. Intri la <b>Integrări → SmartBill</b> și apeși pe comutator.
        Ți-am activat-o deja eu, uite:
      </>
    ),
    ora: "10:25",
  },
  { text: null, ora: "10:25" },
  {
    text: "Gata! De acum, la fiecare comandă plătită factura se emite automat în SmartBill și ajunge la client pe email și în SPV.",
    ora: "10:26",
  },
  { text: "Super, mulțumesc mult! Văd deja prima factură emisă.", ora: "10:27" },
];

/** Al câtelea mesaj e captura integrării. */
const CAPTURA = 2;

/** Captura integrării SmartBill, pe care o trimite asistența. */
function Captura() {
  return (
    <div className="eth-shot">
      <div className="eth-sbh">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SEMN} alt="" loading="lazy" decoding="async" />
        <b>Integrări</b>
        <span>Facturare</span>
      </div>
      <div className="eth-sbr">
        <i className="eth-sbf" {...tinta("rand-fond")} />
        <span className="eth-sbl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SIGLA_SMARTBILL} alt="" loading="lazy" decoding="async" />
        </span>
        <div>
          <b>SmartBill</b>
          <small>Facturi și e-Factura</small>
        </div>
        <span className="eth-sbw">
          <em className="eth-sbs" {...tinta("insigna-inactiv")}>
            Inactiv
          </em>
          <em className="eth-sbs on" {...tinta("insigna-conectat")}>
            Conectat
          </em>
        </span>
        <i className="eth-sw">
          <i className="eth-swg" {...tinta("comutator-gri")} />
          <i className="eth-swv" {...tinta("comutator-verde")} />
          <b {...tinta("comutator-buton")} />
        </i>
      </div>
      <div className="eth-sbo" {...tinta("optiuni")}>
        <span>Emitere</span>
        <b>la plata comenzii</b>
        <span>e-Factura (SPV)</span>
        <b>trimisă automat</b>
      </div>
      <div className="eth-sbt" {...tinta("activ")}>
        <svg viewBox="0 0 16 16">
          <path d="m3.5 8.5 3 3 6-6.5" />
        </svg>
        Facturarea automată este activă
      </div>
    </div>
  );
}

/**
 * Geometria firului, măsurată în pagină: înălțimea bulelor depinde de fontul sistemului. Regula și
 * ce se întâmplă cât firul nu e așezat stau în `masuratoriDinPagina`.
 */
function pisteMasurate(radacina: HTMLElement) {
  const m = masuratoriDinPagina(
    radacina.querySelector<HTMLElement>(".eth-biz"),
    MESAJE.map((_, i) => radacina.querySelector<HTMLElement>(`[data-eth="mesaj-${i}"]`)),
    radacina.querySelector<HTMLElement>(".eth-pane"),
  );
  return pisteCuMasuratori(m ?? MASURATORI_IMPLICITE);
}

const BUCLA: Bucla = {
  atribut: "eth",
  buclaS: BUCLA_S,
  piste: PISTE,
  momente: MOMENTE_DISCRETE,
  /* Nimic de scris din JavaScript: tot ce se schimbă e o pistă (nota 2 din `tehnic-animat.ts`). */
  scriitor: () => () => {},
  /* Avatarul, fundalul și siglele, descărcate și decodate înainte de pornire, ca să nu clipească goale.
     Înălțimile măsurate nu depind de ele (casetele imaginilor sunt fixe), nici de fontul capturii: textul
     ei moștenește rândul bulei, de 21 px. MĂSURAT: aceleași înălțimi cu Inter și fără. */
  pregateste: decodeazaImaginile,
  pisteMasurate,
  pornireS: PORNIRE_S,
  staticS: STATIC_S,
  scaraPanzei: (scena, latime) => {
    for (const ui of scena.querySelectorAll<HTMLElement>(".eth-ui")) {
      ui.style.transform = `scale(${(latime * PANZA.cat) / 100 / PANZA.latime})`;
    }
  },
};

export function TehnicAnimat({ eticheta }: { eticheta: string }) {
  const radacina = useRef<HTMLDivElement>(null);
  useAnimatieInBucla(radacina, BUCLA);

  return (
    <ScenaAnimata radacina={radacina} clasa="eth" eticheta={eticheta}>
      <div className="eth-card" {...tinta("card")}>
        <div className="eth-ui">
          {/* ── Bara de sus ── */}
          <header className="eth-nav">
            <span className="eth-back">
              <svg viewBox="0 0 12 20">
                <path d="M10 2 2 10l8 8" />
              </svg>
              <b>12</b>
            </span>
            <span className="eth-ca">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATAR} alt="" loading="lazy" decoding="async" />
            </span>
            <div className="eth-nt">
              <b>
                Asistență Edinio{" "}
                <svg className="eth-vf" viewBox="0 0 24 24">
                  {VERIFICAT}
                  <path
                    d="m8.6 12.2 2.3 2.3 4.6-4.9"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </b>
              <small className="eth-stt">
                <span {...tinta("stare-online")}>online</span>
                <span className="eth-stt2" {...tinta("stare-scrie")}>
                  scrie…
                </span>
              </small>
            </div>
            <span className="eth-hic">
              <svg viewBox="0 0 24 24">
                <rect x="2" y="6.5" width="13.5" height="11" rx="2.6" />
                <path d="m15.5 10.6 6-3.6v10l-6-3.6" />
              </svg>
              <svg viewBox="0 0 24 24">
                <path d="M5 3.5h3.5l1.8 4.6-2.4 1.6a11 11 0 0 0 6.4 6.4l1.6-2.4 4.6 1.8V19a1.8 1.8 0 0 1-1.9 1.8C10 20.3 3.7 14 3.2 5.4A1.8 1.8 0 0 1 5 3.5z" />
              </svg>
            </span>
          </header>

          {/* ── Firul ── */}
          <div className="eth-pane">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="eth-bgi" src={FUNDAL} alt="" loading="lazy" decoding="async" />
            <div className="eth-msgs" {...tinta("fir")}>
              <div className="eth-day">
                <span>Azi</span>
              </div>
              <div className="eth-biz">
                <svg viewBox="0 0 24 24">{VERIFICAT}</svg>
                Acesta este un cont de business oficial.
              </div>
              {MESAJE.map((m, i) => {
                const client = m.de === "client";
                /* Coada bulei: la primul mesaj din fiecare șir al aceluiași om. */
                const coada = i === 0 || MESAJE[i - 1].de !== m.de;
                const clase = ["eth-m", client ? "eth-o" : "eth-i", coada ? "eth-tl" : "", i === CAPTURA ? "eth-img" : ""];
                return (
                  <div key={m.la} className={clase.filter(Boolean).join(" ")} {...tinta(`mesaj-${i}`)}>
                    {i === CAPTURA ? (
                      <Captura />
                    ) : (
                      <>
                        <p>{CONTINUT[i].text}</p>
                        <span className="eth-ts">
                          {CONTINUT[i].ora}
                          {client ? (
                            <span className="eth-tk">
                              <i className="eth-tk1" {...tinta(`bifa-una-${i}`)} />
                              <i className="eth-tk2" {...tinta(`bifa-doua-${i}`)} />
                              <i className="eth-tk3" {...tinta(`bifa-citit-${i}`)} />
                            </span>
                          ) : null}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Bara de jos ── */}
          <footer className="eth-ft">
            <svg className="eth-plus" viewBox="0 0 24 24">
              <path d="M12 4v16M4 12h16" />
            </svg>
            <span className="eth-inp">
              <svg viewBox="0 0 24 24">
                <path d="M14.5 3.5H8A4.5 4.5 0 0 0 3.5 8v8A4.5 4.5 0 0 0 8 20.5h5.5l7-7V8A4.5 4.5 0 0 0 16 3.5" />
                <path d="M13.5 20.5v-3a4 4 0 0 1 4-4h3" />
              </svg>
            </span>
            <svg viewBox="0 0 24 24">
              <path d="M3.5 8.6A1.6 1.6 0 0 1 5.1 7h2.6l1.4-2.1h5.8L16.3 7h2.6a1.6 1.6 0 0 1 1.6 1.6v9a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z" />
              <circle cx="12" cy="12.9" r="3.4" />
            </svg>
            <svg viewBox="0 0 24 24">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </footer>
        </div>
      </div>
    </ScenaAnimata>
  );
}
