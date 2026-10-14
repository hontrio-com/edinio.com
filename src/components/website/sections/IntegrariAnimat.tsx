"use client";

import { useRef, type CSSProperties } from "react";
import {
  BUCLA_S,
  INTEGRARI,
  MOMENTE_DISCRETE,
  PASI,
  PISTE,
  PORNIRE_S,
  RAND_INALTIME,
  RAND_SUS,
  SIGLE,
  STATIC_S,
  mijlocRand,
  stareaDiscreta,
} from "@/lib/website/integrari-animat";
import { ScenaAnimata } from "./ScenaAnimata";
import { useAnimatieInBucla, type Bucla } from "./useAnimatieInBucla";
/* Vine cu componenta, după ramă (vezi `ScenaAnimata.tsx`). */
import "@/app/integrari-animat.css";

/**
 * Imaginea cardului cu integrări din „Soluția”: panoul de integrări din Edinio. Patru integrări se
 * pornesc dintr-un clic, panoul se strânge în coloana siglelor, apoi o comandă nouă trece singură
 * prin plată, livrare, factură și stoc. Cronologia și de ce merge pe compozitor sunt în
 * `lib/website/integrari-animat.ts`; desenul, în `app/integrari-animat.css`. Pornirea, oprirea și
 * pregătirea sunt comune cu iMac-ul din primul card: `useAnimatieInBucla`.
 *
 * Cadrul din HTML e clipa `PORNIRE_S`: panoul intrat, nimic pornit. Valorile de start ale fiecărui
 * element animat se scriu chiar din pistele lui (`tinta`), ca HTML-ul să nu se poată depărta de ce
 * desenează animația în prima ei clipă.
 *
 * `prefers-reduced-motion`: rămâne clipa cu toate conectate și comanda procesată.
 */

/** Rândul NETOPIA: fișierul e alb, deci se desenează ca mască (vezi `.eic-nt`). */
const RAND_NETOPIA = 1;
/** Semnul Edinio, același fișier ca în `Logo.tsx`. */
const SEMN = "/semn.svg";

const RANDURI = [0, 1, 2, 3] as const;

/** Ce arată fiecare element animat în clipa din HTML, socotit din pista lui. */
const INITIAL = new Map(PISTE.map((p) => [p.tinta, p.scrie(p.valori(PORNIRE_S))]));
const D0 = stareaDiscreta(PORNIRE_S, 0);

/** `data-eic` și stilul de start al unui element animat. */
function tinta(nume: string, stilFix?: CSSProperties): { "data-eic": string; style: CSSProperties } {
  const k = INITIAL.get(nume);
  return {
    "data-eic": nume,
    style: {
      ...stilFix,
      ...(typeof k?.transform === "string" ? { transform: k.transform } : {}),
      ...(k?.opacity !== undefined && k.opacity !== null ? { opacity: Number(k.opacity) } : {}),
    },
  };
}

/** O lungime în unitățile scenei. */
const u = (n: number) => `calc(var(--u) * ${Number(n.toFixed(3))})`;

/** Textele și clasele, scrise numai în clipele în care se schimbă. */
function scriitor(radacina: HTMLElement) {
  const stari = Array.from(radacina.querySelectorAll<HTMLElement>(".eic-st"));
  const pasi = Array.from(radacina.querySelectorAll<HTMLElement>(".eic-s"));
  const contor = radacina.querySelector<HTMLElement>(".eic-cnt");
  const numar = radacina.querySelector<HTMLElement>(".eic-no");
  const eticheta = radacina.querySelector<HTMLElement>(".eic-pill");
  const text = (e: Element | null | undefined, valoare: string) => {
    if (e && e.textContent !== valoare) e.textContent = valoare;
  };
  const aprins = (e: Element | null | undefined, da: boolean) => {
    if (e && e.classList.contains("on") !== da) e.classList.toggle("on", da);
  };

  return (t: number, iteratie: number) => {
    const s = stareaDiscreta(t, iteratie);
    stari.forEach((e, i) => {
      text(e.querySelector("span"), s.stari[i]);
      aprins(e, s.conectate[i]);
    });
    text(contor?.querySelector("b"), String(s.active));
    text(contor?.querySelector("u"), s.cuvant);
    aprins(contor, s.active > 0);
    text(numar, s.numar);
    pasi.forEach((e, i) => {
      text(e.querySelector("small"), s.textePasi[i]);
      aprins(e, s.pasi[i]);
    });
    text(eticheta?.querySelector("span"), s.eticheta);
    aprins(eticheta, s.procesata);
  };
}

/** Siglele, descărcate și decodate înainte de pornire. Sunt mici și aproape toate deja în cache. */
function incarcaSiglele(radacina: HTMLElement): Promise<unknown> {
  const imagini = Array.from(radacina.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imagini) img.loading = "eager";
  return Promise.all(imagini.map((img) => img.decode().catch(() => undefined)));
}

const BUCLA: Bucla = {
  atribut: "eic",
  buclaS: BUCLA_S,
  piste: PISTE,
  momente: MOMENTE_DISCRETE,
  scriitor,
  pregateste: incarcaSiglele,
  pornireS: PORNIRE_S,
  staticS: STATIC_S,
};

const BIFA = "m3.5 8.5 3 3 6-6.5";

export function IntegrariAnimat({ eticheta }: { eticheta: string }) {
  const radacina = useRef<HTMLDivElement>(null);
  useAnimatieInBucla(radacina, BUCLA);

  return (
    <ScenaAnimata radacina={radacina} clasa="eic" eticheta={eticheta}>
      {/* ── Liniile punctate dintre comandă și sigle: câte un SVG mic pe rând, în unitățile scenei ── */}
      {RANDURI.map((i) => {
        const y = Number(mijlocRand(i).toFixed(2));
        return (
          <svg
            key={i}
            className="eic-lf"
            viewBox={`13.8 ${Number((y - 0.2).toFixed(2))} 16.4 0.4`}
            aria-hidden
            {...tinta(`fundal-${i}`, { top: u(y - 0.2) })}
          >
            <path d={`M30 ${y}H14`} />
          </svg>
        );
      })}

      {/* ── Liniile verzi și pachetul ── */}
      {RANDURI.map((i) => {
        const y = Number(mijlocRand(i).toFixed(2));
        return (
          <div key={i} className="eic-lc" style={{ top: u(y - 0.5) }}>
            <svg className="eic-lv" viewBox={`13.83 ${Number((y - 0.5).toFixed(2))} 16.34 1`} aria-hidden {...tinta(`linie-${i}`)}>
              <path d={`M30 ${y}H14`} />
            </svg>
          </div>
        );
      })}
      <div className="eic-purtator eic-pw" {...tinta("pachet-loc")}>
        <div className="eic-pk" {...tinta("pachet")}>
          <i />
          <i />
        </div>
      </div>

      {/* ── Panoul de integrări ── */}
      <div className="eic-p" {...tinta("panou")}>
        <div className="eic-pm" {...tinta("panou-mobil")}>
          <i className="eic-us" {...tinta("umbra-stanga")} />
          <i className="eic-ud" {...tinta("umbra-dreapta")} />
          <i className="eic-um" {...tinta("umbra-mijloc")} />
          <i className="eic-cs" {...tinta("corp-stanga")} />
          <i className="eic-cd" {...tinta("corp-dreapta")} />
          <i className="eic-cm" {...tinta("corp-mijloc")} />
        </div>
        <div className="eic-pn" {...tinta("panou-ingust")} />

        <div className="eic-pc" {...tinta("continut")}>
          <div className="eic-tx" {...tinta("texte")}>
            <div className="eic-ht">
              <strong className="eic-h">Integrări</strong>
              <small className="eic-hs">Activează serviciile magazinului tău</small>
            </div>
            <div className="eic-cl" {...tinta("contor-loc")}>
              <span className={D0.active > 0 ? "eic-cnt on" : "eic-cnt"}>
                <i />
                <b>{D0.active}</b>&nbsp;<u>{D0.cuvant}</u>
              </span>
            </div>
            {RANDURI.map((i) => (
              <div key={i} className="eic-rt" style={{ top: u(RAND_SUS + RAND_INALTIME * i) }}>
                <strong>{INTEGRARI[i].nume}</strong>
                <small>{INTEGRARI[i].descriere}</small>
                <em className={D0.conectate[i] ? "eic-st on" : "eic-st"}>
                  <svg viewBox="0 0 16 16">
                    <path d={BIFA} />
                  </svg>
                  <span>{D0.stari[i]}</span>
                </em>
                <span className="eic-sw">
                  <i className="eic-swv" {...tinta(`comutator-${i}`)} />
                  <i className="eic-kn" {...tinta(`buton-${i}`)}>
                    <b className="eic-sp" {...tinta(`rotita-${i}`)} />
                  </i>
                </span>
              </div>
            ))}
          </div>

          <span className="eic-ic" {...tinta("sigla-edinio")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SEMN} alt="" width={48} height={48} loading="lazy" decoding="async" />
          </span>
          {RANDURI.map((i) => (
            <div key={i} className="eic-sg" {...tinta(`sigla-${i}`, { top: u(RAND_SUS + RAND_INALTIME * i + 1.3) })}>
              <i className="eic-su" {...tinta(`umbra-sigla-${i}`)} />
              <i className="eic-sr" />
              <i className="eic-sv" {...tinta(`inel-${i}`)} />
              <span className="eic-lg">
                {i === RAND_NETOPIA ? (
                  <i className="eic-nt" style={{ "--masca": `url("${SIGLE[i]}")` } as CSSProperties} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={SIGLE[i]} alt="" loading="lazy" decoding="async" />
                )}
              </span>
              <b className="eic-dot" {...tinta(`punct-${i}`)} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Comanda ── */}
      <div className="eic-o" {...tinta("comanda")}>
        <span className={D0.procesata ? "eic-pill on" : "eic-pill"} {...tinta("eticheta")}>
          <i />
          <span>{D0.eticheta}</span>
        </span>
        <strong className="eic-no">{D0.numar}</strong>
        <small className="eic-cu">Andrei Popescu · Ploiești · Vestă Hi-Vis × 2</small>
        <div className="eic-tot">
          <small>Total</small>
          <b>189,00 lei</b>
        </div>
        {RANDURI.map((i) => (
          <div key={i} className={D0.pasi[i] ? "eic-s on" : "eic-s"} style={{ top: u(RAND_SUS + RAND_INALTIME * i) }}>
            <i className="eic-bf" {...tinta(`bifa-${i}`)}>
              <svg viewBox="0 0 16 16">
                <path d={BIFA} />
              </svg>
            </i>
            <strong>{PASI[i].nume}</strong>
            <small>{D0.textePasi[i]}</small>
            <span className="eic-vw" {...tinta(`valoare-${i}`)}>
              <em className={i === 0 ? "eic-mono" : undefined}>{PASI[i].valoare}</em>
            </span>
          </div>
        ))}
      </div>

      <div className="eic-bd" {...tinta("insigna")}>
        <span className="eic-ok">
          <svg viewBox="0 0 16 16">
            <path d={BIFA} />
          </svg>
        </span>
        Procesată automat · 0 acțiuni manuale
      </div>

      {/* ── Cursorul ── */}
      <div className="eic-purtator eic-cw" {...tinta("cursor-loc")}>
        <div className="eic-cur" {...tinta("cursor")}>
          <svg className="eic-ar" viewBox="0 0 24 24" {...tinta("cursor-sageata")}>
            <path d="M4 2.5v17.2l4.6-4.4 3 6.6 3-1.4-3-6.4h6.3z" fill="#111" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
          </svg>
          <svg className="eic-hd" viewBox="0 0 24 24" {...tinta("cursor-mana")}>
            <path
              d="M9 3.2c0-1 1.8-1 1.8 0V11l.4-.1V8.6c0-1 1.8-1 1.8 0v2.6l.4-.1V9.5c0-1 1.8-1 1.8 0v2l.4-.1v-.9c0-1 1.8-1 1.8 0v5.8c0 3-2 5.4-5 5.4h-1.2c-2 0-3.2-1-4.4-2.6L4 14.6c-.6-.8.6-1.8 1.4-1.2L9 15.6z"
              fill="#fff"
              stroke="#111"
              strokeWidth={1.3}
              strokeLinejoin="round"
            />
          </svg>
          <i className="eic-rp" {...tinta("clic")} />
        </div>
      </div>
    </ScenaAnimata>
  );
}
