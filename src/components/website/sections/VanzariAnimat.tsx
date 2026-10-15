"use client";

import { useRef } from "react";
import {
  BUCLA_S,
  COMENZI,
  INALTIMI_IMPLICITE,
  MOMENTE_DISCRETE,
  NOTIFICARI,
  NUMAR_PRIMA_COMANDA,
  PISTE,
  PORNIRE_S,
  STATIC_S,
  pisteCuInaltimi,
  stareaDiscreta,
  sumaComenzii,
} from "@/lib/website/vanzari-animat";
import { ScenaAnimata } from "./ScenaAnimata";
import { decodeazaImaginile, facatorDeTinte } from "./tinteAnimate";
import { useAnimatieInBucla, type Bucla } from "./useAnimatieInBucla";
/* Vine cu componenta, după ramă (vezi `ScenaAnimata.tsx`). */
import "@/app/vanzari-animat.css";

/**
 * Imaginea cardului cu vânzări din „Soluția”: telefonul clientului. Pe ecranul de blocare vin
 * notificările campaniilor automate, iar în panoul „Comenzi noi” intră comenzile pe care le aduc,
 * cu veniturile din marketing. Cronologia și de ce merge pe compozitor sunt în
 * `lib/website/vanzari-animat.ts`; desenul, în `app/vanzari-animat.css`. Pornirea, oprirea și
 * pregătirea sunt comune cu celelalte machete: `useAnimatieInBucla`.
 *
 * Cadrul din HTML e clipa `PORNIRE_S`: telefonul și panoul intrate, nimic venit.
 *
 * `prefers-reduced-motion`: rămâne clipa cu toate notificările și comenzile venite.
 */

const SIGLA_IMESSAGE = "/features/sigle/imessage.svg";
const SIGLA_GMAIL = "/mentenanta/gmail.svg";

/** `data-evz` și stilul de start al unui element animat, socotit din pista lui. */
const tinta = facatorDeTinte("evz", PISTE, PORNIRE_S);
const D0 = stareaDiscreta(PORNIRE_S);

const CUPON = (
  <svg viewBox="0 0 24 24">
    <path d="M3 12V4h8l10 10-8 8z" />
    <circle cx="7.5" cy="8.5" r="1.3" />
  </svg>
);

/**
 * Numărătorile pe surse, scrise numai la intrarea unei comenzi (de șase ori pe buclă). Totalul NU se
 * scrie de aici: e contorul cu role, pe compozitor (nota 4 din `vanzari-animat.ts`).
 */
function scriitor(radacina: HTMLElement) {
  const surse = [".evz-s1", ".evz-s2", ".evz-s3"].map((s) => radacina.querySelector<HTMLElement>(s));
  return (t: number) => {
    const s = stareaDiscreta(t);
    surse.forEach((e, i) => {
      const v = String(s.surse[i]);
      if (e && e.textContent !== v) e.textContent = v;
    });
  };
}

/** Cifrele 0-9, câte una pe rând (`white-space: pre`). */
const BANDA = "0123456789".split("").join("\n");

/** O cifră a contorului: fereastra de un rând și banda 0-9 din ea. */
function Cifra({ i }: { i: number }) {
  return (
    <span className="evz-cf" {...(i < 2 ? tinta(`total-cifra-${i}`) : {})}>
      <span className="evz-cs" {...tinta(`total-banda-${i}`)}>
        {BANDA}
      </span>
    </span>
  );
}

/**
 * Înălțimea fiecărei notificări, măsurată în pagină (depinde de fontul sistemului), în unități de
 * scenă, cu tot cu distanța de 0,7 dintre ele. Dacă scena nu e încă așezată, rămân cele implicite.
 */
function pisteMasurate(radacina: HTMLElement, scena: HTMLElement) {
  const u = scena.offsetWidth / 100;
  const inaltimi = NOTIFICARI.map((_, i) => {
    const e = radacina.querySelector<HTMLElement>(`[data-evz="notificare-${i}"]`);
    return e && u > 0 ? e.offsetHeight / u + 0.7 : NaN;
  });
  return pisteCuInaltimi(inaltimi.every((h) => Number.isFinite(h) && h > 1) ? inaltimi : INALTIMI_IMPLICITE);
}

const BUCLA: Bucla = {
  atribut: "evz",
  buclaS: BUCLA_S,
  piste: PISTE,
  momente: MOMENTE_DISCRETE,
  scriitor,
  /* Avatarurile și siglele, descărcate și decodate înainte de pornire. */
  pregateste: decodeazaImaginile,
  pisteMasurate,
  pornireS: PORNIRE_S,
  staticS: STATIC_S,
};

export function VanzariAnimat({ eticheta }: { eticheta: string }) {
  const radacina = useRef<HTMLDivElement>(null);
  useAnimatieInBucla(radacina, BUCLA);

  return (
    <ScenaAnimata radacina={radacina} clasa="evz" eticheta={eticheta}>
      {/* ── Telefonul clientului ── */}
      <div className="evz-dev" {...tinta("telefon")}>
        <i className="evz-bt evz-bt1" />
        <i className="evz-bt evz-bt2" />
        <i className="evz-bt evz-bt3" />
        <i className="evz-bt evz-bt4" />
        <i className="evz-bt evz-bt5" />
        <div className="evz-bz">
          <div className="evz-sc">
            <div className="evz-wp">
              <i className="evz-w3" />
              <i className="evz-w2" />
              <i className="evz-w1" />
              <i className="evz-w4" />
              <i className="evz-w5" />
            </div>
            <div className="evz-sb">
              <span />
              <span className="evz-ri">
                <svg viewBox="0 0 18 12">
                  <rect x="0" y="8" width="3" height="4" rx=".9" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx=".9" />
                  <rect x="10" y="3" width="3" height="9" rx=".9" />
                  <rect x="15" y="0" width="3" height="12" rx=".9" />
                </svg>
                <svg viewBox="0 0 17 12">
                  <path d="M8.5 11.6 6.2 9.2a3.3 3.3 0 0 1 4.6 0zM3.6 6.6a6.9 6.9 0 0 1 9.8 0l-1.5 1.5a4.8 4.8 0 0 0-6.8 0zM1 4a10.6 10.6 0 0 1 15 0l-1.5 1.5a8.5 8.5 0 0 0-12 0z" />
                </svg>
                <i className="evz-bat" />
              </span>
            </div>
            <div className="evz-dt">Vineri 17 octombrie</div>
            <div className="evz-tm">18:02</div>
            <div className="evz-ns">
              {NOTIFICARI.map((n, i) => (
                <div key={n.la} className="evz-nl" {...tinta(`notificare-loc-${i}`)}>
                  <div className="evz-nt" {...tinta(`notificare-${i}`)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={n.sursa === "sms" ? SIGLA_IMESSAGE : SIGLA_GMAIL}
                      className={n.sursa === "email" ? "g" : undefined}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <div>
                      <div className="evz-nh">
                        <b>eSAFE</b>
                        <small>acum</small>
                      </div>
                      {n.subiect ? <p className="s">{n.subiect}</p> : null}
                      <p>{n.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <i className="evz-qb evz-qb1">
              <svg viewBox="0 0 24 24">
                <path d="M8.2 2.6h7.6v3.1l-1.5 2.5v12.3a1.4 1.4 0 0 1-1.4 1.4h-1.8a1.4 1.4 0 0 1-1.4-1.4V8.2L8.2 5.7z" />
                <path d="M8.2 5.7h7.6" />
                <circle cx="12" cy="12.6" r=".95" fill="#fff" stroke="none" />
              </svg>
            </i>
            <i className="evz-qb evz-qb2">
              <svg viewBox="0 0 24 24">
                <path d="M3.4 8.6A1.6 1.6 0 0 1 5 7h2.6l1.4-2.1h6l1.4 2.1H19a1.6 1.6 0 0 1 1.6 1.6v9A1.6 1.6 0 0 1 19 19.2H5a1.6 1.6 0 0 1-1.6-1.6z" />
                <circle cx="12" cy="12.9" r="3.5" />
              </svg>
            </i>
            <b className="evz-hi" />
            <i className="evz-di">
              <b />
            </i>
          </div>
        </div>
      </div>

      {/* ── Panoul cu comenzile ── */}
      <div className="evz-pn" {...tinta("panou")}>
        <div className="evz-hd">
          <div>
            <strong>Comenzi noi</strong>
            <small>azi, din campaniile automate</small>
          </div>
          <span className="evz-live">
            <i />
            live
          </span>
        </div>
        <div className="evz-rows">
          {COMENZI.map((c, i) => (
            <div key={c.la} className="evz-or" {...tinta(`comanda-${i}`)}>
              <i className="evz-orf" {...tinta(`comanda-fond-${i}`)} />
              <span className="evz-av" style={{ background: c.culoare }}>
                {c.initiale}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/features/vanzari-animat/${c.avatar}.webp`} alt="" loading="lazy" decoding="async" />
              </span>
              <div>
                <b>{c.nume}</b>
                <small>Comanda #{NUMAR_PRIMA_COMANDA + i} · acum</small>
              </div>
              <em>
                {c.sursa === 2 ? (
                  CUPON
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.sursa === 0 ? SIGLA_IMESSAGE : SIGLA_GMAIL} alt="" loading="lazy" decoding="async" />
                )}
                {c.sursa === 0 ? "din SMS" : c.sursa === 1 ? "din email" : "cupon ZIUA15"}
              </em>
              <strong>{sumaComenzii(c.suma)}</strong>
            </div>
          ))}
        </div>
        <div className="evz-ft">
          <div>
            <small>Venituri din marketing azi</small>
            <b className="evz-tv">
              <span className="evz-tvc" {...tinta("total-loc")}>
                <span className="evz-tvr">
                  <Cifra i={0} />
                  <Cifra i={1} />
                  <Cifra i={2} />
                  <span className="evz-cv">,</span>
                  <Cifra i={3} />
                  <Cifra i={4} />
                  <span className="evz-tvl">{" lei"}</span>
                </span>
              </span>
            </b>
          </div>
          <div className="evz-src">
            <span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SIGLA_IMESSAGE} alt="" loading="lazy" decoding="async" />
              <b className="evz-s1">{D0.surse[0]}</b>
            </span>
            <span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SIGLA_GMAIL} alt="" loading="lazy" decoding="async" />
              <b className="evz-s2">{D0.surse[1]}</b>
            </span>
            <span className="evz-cpn">
              {CUPON}
              <b className="evz-s3">{D0.surse[2]}</b>
            </span>
          </div>
        </div>
      </div>
    </ScenaAnimata>
  );
}
