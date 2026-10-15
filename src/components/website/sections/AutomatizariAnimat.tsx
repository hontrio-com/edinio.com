"use client";

import { useRef, type ReactNode } from "react";
import {
  BUCLA_S,
  ETICHETA,
  MOMENTE_DISCRETE,
  PISTE,
  PORNIRE_S,
  STATIC_S,
  ZIMTI,
  stareaDiscreta,
} from "@/lib/website/automatizari-animat";
import { ScenaAnimata } from "./ScenaAnimata";
import { decodeazaImaginile, facatorDeTinte } from "./tinteAnimate";
import { useAnimatieInBucla, type Bucla } from "./useAnimatieInBucla";
/* Vine cu componenta, după ramă (vezi `ScenaAnimata.tsx`). */
import "@/app/automatizari-animat.css";

/**
 * Imaginea cardului cu automatizări din „Soluția”: documentele unei comenzi, generate singure.
 * Patru carduri stau într-o grilă 2×2 și se măresc pe rând: factura SmartBill, eticheta AWB FAN
 * Courier care iese din imprimantă, e-mailul de confirmare în Gmail și SMS-ul pe iPhone. Cronologia
 * și de ce merge pe compozitor sunt în `lib/website/automatizari-animat.ts`; desenul, în
 * `app/automatizari-animat.css`. Pornirea, oprirea și pregătirea sunt comune cu celelalte machete:
 * `useAnimatieInBucla`.
 *
 * Cadrul din HTML e clipa `PORNIRE_S`: grila intrată, nimic generat.
 *
 * `prefers-reduced-motion`: rămâne clipa cu toate patru generate și comanda procesată.
 */

const SEMN = "/semn.svg";
const SIGLA_SMARTBILL = "/integrations/smartbill-mic.webp";
const SIGLA_FAN = "/integrations/fan-courier.svg";
const SIGLA_GMAIL = "/mentenanta/gmail.svg";
/** Comună cu cardul cu vânzări. */
const SIGLA_IMESSAGE = "/features/sigle/imessage.svg";
/*
 * Sigla magazinului, in doua marimi apropiate de cele afisate (factura si e-mailul). ⚠ MASURAT: cat
 * ruleaza o animatie pe compozitor, Chrome filtreaza imaginile din ea cu calitate redusa si le reface
 * abia dupa ce se opreste; bucla nu se opreste, iar fisierul de 275 px micsorat de 2-3 ori iesea moale
 * (rama siglei, gri in loc de neagra). Micsorat dinainte, cu filtru bun, nu mai conteaza.
 */
const SIGLA_ESAFE_FACTURA = "/features/automatizari-animat/esafe-factura.webp";
const SIGLA_ESAFE_EMAIL = "/features/automatizari-animat/esafe-email.webp";

const CARDURI = [0, 1, 2, 3] as const;

/** `data-eau` și stilul de start al unui element animat, socotit din pista lui. */
const tinta = facatorDeTinte("eau", PISTE, PORNIRE_S);
const D0 = stareaDiscreta(PORNIRE_S, 0);

const BIFA = "m3.5 8.5 3 3 6-6.5";

/** Clasa etichetei de stare a unui card, la `t`. */
const clasaStarii = (s: { generare: boolean[]; gata: boolean[] }, i: number) => (s.gata[i] ? "on" : s.generare[i] ? "run" : undefined);

/** Textele, clasele și ordinea cardurilor, scrise numai în clipele în care se schimbă. */
function scriitor(radacina: HTMLElement, elemente: ReadonlyMap<string, HTMLElement>) {
  const carduri = CARDURI.map((i) => elemente.get(`card-${i}`));
  const etichete = CARDURI.map((i) => carduri[i]?.querySelector<HTMLElement>(".eau-hd em") ?? null);
  const numar = radacina.querySelector<HTMLElement>(".eau-no");
  const stareComanda = radacina.querySelector<HTMLElement>(".eau-os");
  const total = radacina.querySelector<HTMLElement>(".eau-tot");
  const necitite = radacina.querySelector<HTMLElement>(".eau-gcnt");
  const text = (e: Element | null | undefined, valoare: string) => {
    if (e && e.textContent !== valoare) e.textContent = valoare;
  };
  const clasa = (e: Element | null | undefined, nume: string, da: boolean) => {
    if (e && e.classList.contains(nume) !== da) e.classList.toggle(nume, da);
  };

  return (t: number, iteratie: number) => {
    const s = stareaDiscreta(t, iteratie);
    for (const i of CARDURI) {
      const em = etichete[i];
      clasa(em, "run", s.generare[i] && !s.gata[i]);
      clasa(em, "on", s.gata[i]);
      text(em?.querySelector("span"), s.stari[i]);
      const c = carduri[i];
      const z = s.deasupra[i] ? "10" : "";
      if (c && c.style.zIndex !== z) c.style.zIndex = z;
    }
    text(numar, s.comanda);
    clasa(stareComanda, "on", s.procesata);
    text(stareComanda?.querySelector("span"), s.stareComanda);
    text(total, s.total);
    text(necitite, s.necitite);
  };
}

const BUCLA: Bucla = {
  atribut: "eau",
  buclaS: BUCLA_S,
  piste: PISTE,
  momente: MOMENTE_DISCRETE,
  scriitor,
  /* Siglele și sigla magazinului, descărcate și decodate înainte de pornire. */
  pregateste: decodeazaImaginile,
  pornireS: PORNIRE_S,
  staticS: STATIC_S,
  /* Fără funcții trigonometrice în CSS, scara pânzei fiecărui card (`.eau-sc`) o scrie componenta. */
  faraTrig: (scena, latime) => {
    for (const sc of scena.querySelectorAll<HTMLElement>(".eau-sc")) sc.style.transform = `scale(${(latime * 0.9) / 1200})`;
  },
};

/* ─── Bucățile desenului ──────────────────────────────────────────────────── */

function Bifa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className ?? "eau-ck"}>
      <path d={BIFA} />
    </svg>
  );
}

/** Capul unui card: sigla, titlul, subtitlul și eticheta stării. */
function Cap({ i, sigla, titlu, subtitlu, imessage }: { i: number; sigla: string; titlu: string; subtitlu: string; imessage?: boolean }) {
  return (
    <div className="eau-hd">
      <span className={imessage ? "eau-li eau-lim" : "eau-li"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sigla} alt="" loading="lazy" decoding="async" />
      </span>
      <b>{titlu}</b>
      <small>{subtitlu}</small>
      <em className={clasaStarii(D0, i)}>
        <Bifa />
        <span>{D0.stari[i]}</span>
      </em>
    </div>
  );
}

/** O bulă de confirmare; `t` e ținta ei (`tinta("bula-...")`). */
function Bula({ t, titlu, detaliu }: { t: ReturnType<typeof tinta>; titlu: string; detaliu: string }) {
  return (
    <div {...t}>
      <i />
      <span>
        {titlu}
        <br />
        <small>{detaliu}</small>
      </span>
    </div>
  );
}

/** Cardul: umbra obișnuită, umbra cu chenar verde, corpul și pânza de 1200 × 746. */
function Card({ i, children }: { i: number; children: ReactNode }) {
  return (
    <div className="eau-c" {...tinta(`card-${i}`, D0.deasupra[i] ? { zIndex: 10 } : undefined)}>
      <i className="eau-cu" {...tinta(`umbra-${i}`)} />
      <i className="eau-cv" {...tinta(`chenar-${i}`)} />
      <div className="eau-cb">
        <div className="eau-sc">{children}</div>
      </div>
    </div>
  );
}

/* Rândurile din Gmail: primul e e-mailul nou, celelalte sunt cele vechi. */
const RANDURI_GMAIL: ReadonlyArray<readonly [string, string, string, string, boolean, boolean]> = [
  ["eSAFE", "Comanda #10481 a fost confirmată", " - Bună, Andrei! Îți mulțumim pentru comandă. Factura este atașată.", "10:24", true, true],
  ["Mihai Ionescu", "Re: Weekend la munte", " - Am rezervat cabana pentru sâmbătă, vă trimit detaliile", "09:12", true, false],
  ["Banca", "Extrasul de cont pentru septembrie", " - Extrasul tău de cont este disponibil", "08:40", false, false],
  ["Calendar", "Invitație: Ședință săptămânală", " - joi, 16 oct. 10:00 - 11:00", "ieri", false, false],
  ["Asociația de proprietari", "Lista de plată octombrie", " - Bună ziua, atașat găsiți lista de plată", "13 oct.", false, false],
  ["Ana Dumitru", "Poze de la nuntă", " - Am pus toate pozele într-un album", "12 oct.", false, false],
  ["Cursuri Online", "Lecția 4 este disponibilă", " - Continuă de unde ai rămas", "11 oct.", false, false],
  ["Radu Mihăilescu", "Oferta pentru proiect", " - Revin cu detaliile discutate ieri", "10 oct.", false, false],
  ["Primăria", "Confirmare programare", " - Programarea ta a fost înregistrată", "9 oct.", false, false],
  ["Newsletter", "Noutățile săptămânii", " - Cele mai citite articole", "8 oct.", false, false],
  ["Elena Stan", "Rețeta promisă", " - Uite rețeta de cozonac", "7 oct.", false, false],
  ["Furnizor internet", "Factura ta este disponibilă", " - Suma de plată: 45,00 lei", "6 oct.", false, false],
];

const STEA = "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z";

function ContinutRand({ r }: { r: (typeof RANDURI_GMAIL)[number] }) {
  const [nume, subiect, rest, ora, , atasament] = r;
  return (
    <>
      <i className="cb" />
      <svg className="st" viewBox="0 0 24 24">
        <path d={STEA} />
      </svg>
      <span className="nm">{nume}</span>
      <span className="sb">
        {subiect}
        <span>{rest}</span>
      </span>
      {atasament ? (
        <span className="ac">
          <i>PDF</i>FC0482.pdf
        </span>
      ) : null}
      <span className="tm">{ora}</span>
    </>
  );
}

export function AutomatizariAnimat({ eticheta }: { eticheta: string }) {
  const radacina = useRef<HTMLDivElement>(null);
  useAnimatieInBucla(radacina, BUCLA);
  const [nou, ...vechi] = RANDURI_GMAIL;

  return (
    <ScenaAnimata radacina={radacina} clasa="eau" eticheta={eticheta}>
      {/* ── Comanda de sus ── */}
      <div className="eau-or" {...tinta("comanda")}>
        <span className="eau-oi">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SEMN} alt="" loading="lazy" decoding="async" />
        </span>
        <div>
          <b className="eau-no">{D0.comanda}</b>
          <small>Andrei Popescu · 189,00 lei</small>
        </div>
        <em className={D0.procesata ? "eau-os on" : "eau-os"}>
          <Bifa />
          <span>{D0.stareComanda}</span>
        </em>
      </div>

      {/* ── 1. Factura SmartBill ── */}
      <Card i={0}>
        <Cap i={0} sigla={SIGLA_SMARTBILL} titlu="Factură" subtitlu="SmartBill · e-Factura" />
        <div className="eau-pgw">
          <div className="eau-pg" {...tinta("factura")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="eau-plogo" src={SIGLA_ESAFE_FACTURA} alt="" loading="lazy" decoding="async" />
            <div className="eau-pt">FACTURA</div>
            <div className="eau-pn">FC0482</div>
            <div className="eau-pd">
              Data emiterii: <span>14/10/2026</span>
            </div>
            <div className="eau-pbox">
              <span>TOTAL PLATA</span>
              <b>
                <span className="eau-tot">{D0.total}</span> <small>Lei</small>
              </b>
            </div>
            <div className="eau-pb eau-pb1" {...tinta("factura-bloc-0")}>
              <h6>Furnizor</h6>
              <h5>ESAFE</h5>
              <p>
                CIF: <span>RO12345678</span>
              </p>
              <p>
                Reg. com.: <span>J29/1234/2019</span>
              </p>
              <p>Adresa: Str. Exemplu, Nr.10, Ploiesti, Jud.: Prahova</p>
              <p>IBAN: RO00EXMP0000000000000000</p>
              <p>Banca: BANCA EXEMPLU</p>
            </div>
            <div className="eau-pb eau-pb2" {...tinta("factura-bloc-1")}>
              <h6>Client</h6>
              <h5>ANDREI POPESCU</h5>
              <p>Adresa: Str. Republicii, Nr.10, Ploiesti, Judet: Prahova</p>
              <p>
                Tel.: <span>0740 *** 321</span>
              </p>
              <p>
                Email: <span>andrei.popescu@gmail.com</span>
              </p>
            </div>
            <div className="eau-tb">
              <div className="eau-th">
                <span className="c0">
                  Nr.
                  <br />
                  crt
                </span>
                <span className="c1">Denumirea produselor sau a serviciilor</span>
                <span className="c2">U.M.</span>
                <span className="c3">Cant.</span>
                <span className="c4">
                  Pret unitar
                  <br />
                  -Lei-
                </span>
                <span className="c5">
                  Valoarea
                  <br />
                  -Lei-
                </span>
              </div>
              <div className="eau-tr" {...tinta("factura-rand-0")}>
                <span className="c0">1</span>
                <span className="c1">Vesta reflectorizanta Hi-Vis, ORR S/M</span>
                <span className="c2">buc</span>
                <span className="c3">2</span>
                <span className="c4">87.00</span>
                <span className="c5">174.00</span>
              </div>
              <div className="eau-tr eau-alt" {...tinta("factura-rand-1")}>
                <span className="c0">2</span>
                <span className="c1">Transport FAN Courier</span>
                <span className="c2">buc</span>
                <span className="c3">1</span>
                <span className="c4">15.00</span>
                <span className="c5">15.00</span>
              </div>
            </div>
            <div className="eau-pf" {...tinta("factura-total")}>
              <span>Intocmit de: eSAFE</span>
              <b>TOTAL PLATA</b>
              <strong>
                189.00 <small>Lei</small>
              </strong>
            </div>
            <div className="eau-pft">
              <b>ESAFE</b>
              <br />
              Capital social: 200 Lei
              <br />
              Adresa web: https://esafe.ro
            </div>
            <div className="eau-pl">Factura este valabila fara semnatura si stampila, conform art. 319 alin. 29 din legea 227/2015.</div>
            <div className="eau-pl2">
              Facturez cu <u>SmartBill.ro</u>, standardul facturarii electronice <b>Cod document: K7Q2M</b>
            </div>
          </div>
        </div>
        <div className="eau-chs eau-ch1">
          <Bula t={tinta("bula-0-0")} titlu="Date client preluate" detaliu="din comanda #10481" />
          <Bula t={tinta("bula-0-1")} titlu="Produse și transport" detaliu="adăugate automat" />
          <Bula t={tinta("bula-0-2")} titlu="Factura FC0482" detaliu="emisă în SmartBill" />
          <Bula t={tinta("bula-0-3")} titlu="Trimisă în SPV" detaliu="e-Factura ANAF" />
        </div>
      </Card>

      {/* ── 2. AWB FAN Courier ── */}
      <Card i={1}>
        <Cap i={1} sigla={SIGLA_FAN} titlu="AWB" subtitlu="FAN Courier · ridicare comandată" />
        <div className="eau-prs" {...tinta("imprimanta")}>
          <i className="eau-pr-sh" />
          <i className="eau-pr-ft" style={{ left: 70 }} />
          <i className="eau-pr-ft" style={{ right: 70 }} />
          <i className="eau-pr-body" />
          <i className="eau-pr-top" />
          <i className="eau-pr-win">
            <i />
            <b />
          </i>
          <i className="eau-pr-hl" />
          <i className="eau-pr-lid" />
          <i className="eau-pr-face" />
          <i className="eau-pr-pw">
            <b />
          </i>
          <i className="eau-pr-led" />
          <i className="eau-pr-ledon" {...tinta("led")} />
          <i className="eau-pr-led2" />
          <i className="eau-pr-vent" />
          <i className="eau-pr-btn" />
          <i className="eau-pr-slot" />
        </div>
        <div className="eau-lm">
          <div className="eau-lbl" {...tinta("eticheta")}>
            <div className="eau-l" style={{ left: 0, top: 0, width: 181, height: 98 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="eau-lfl" src={SIGLA_FAN} alt="" loading="lazy" decoding="async" />
              <b className="eau-lfx">
                FAN
                <br />
                COURIER
                <br />
                EXPRESS
              </b>
              <span className="eau-ldt">Data: 14-10-2026 10:24:04</span>
            </div>
            <div className="eau-l eau-lawb" style={{ left: 0, top: 98, width: 181, height: 23 }}>
              <b>AWB</b>
              <span>2401773915</span>
            </div>
            <svg className="eau-lbc" viewBox="0 0 100 30" preserveAspectRatio="none">
              {ETICHETA.bare.map(([x, w]) => (
                <rect key={x} x={x} y={0} width={w} height={30} />
              ))}
            </svg>
            <div className="eau-lbn">240177391500 1F7A21</div>
            <div className="eau-l1">
              <b>1</b>
              <span>din</span>
              <b>1</b>
            </div>
            <div className="eau-lsnd">
              <b>ESAFE</b>
              <p>
                ESAFE
                <br />
                Exemplu (Strada), Nr. 10,
                <br />
                Cod Postal 100000
              </p>
              <p>
                <small>TELEFON</small> 0244 *** 000
              </p>
              <p>
                Ploiesti - 0 km
                <br />
                Prahova
              </p>
            </div>
            <div className="eau-lrt">R2.07-Ploiesti</div>
            <div className="eau-lrz">03-12</div>
            <div className="eau-ldst">
              <small>DESTINATAR</small>
              <b>Andrei Popescu</b>
              <p>Andrei Popescu</p>
              <p>Republicii (Strada), Nr. 10, Cod Postal 100066</p>
            </div>
            <div className="eau-lph">
              <span>0740***321</span>
              <span>Ploiesti - 0 km</span>
              <span>Prahova</span>
            </div>
            <div className="eau-lrow">
              <small>PLIC</small> <b>0</b> <small>COLET</small> <b>1</b> <small>KG</small> <b>1.20</b> <small>GVOL</small> <b>1</b>{" "}
              <b className="eau-lstd">Standard</b>
            </div>
            <div className="eau-lbox">
              <div className="eau-lb1">
                <small>RAMBURS</small> <b>---</b>
                <small className="eau-lib">IBAN:</small>
              </div>
              <div className="eau-lb2">
                <small>RESTITUIRE</small>
                <small className="eau-lpt">
                  PLATA TRANSPORT
                  <br />
                  RAMBURS/RESTITUIRE
                </small>
                <b className="eau-lpd">---</b>
              </div>
              <div className="eau-lb3">
                <small>OPTIUNI</small>
              </div>
              <div className="eau-lb4">
                <small>DOCUMENT DE PLATA</small> <b>CHITANTA</b>
                <small className="eau-lvd">VAL DECLARATA</small> <b>189.00 RON</b>
                <br />
                <small>PLATA TRANSPORT</small> <b>expeditor</b>
              </div>
            </div>
            <svg className="eau-ldm" viewBox="0 0 26 26" shapeRendering="crispEdges">
              {ETICHETA.patrate.map(([c, r]) => (
                <rect key={`${c}-${r}`} x={c} y={r} width={1} height={1} />
              ))}
            </svg>
            <div className="eau-lcf">
              <small>CONFIRMARE</small>
              <small>Am primit expeditia intacta (1 buc)</small>
              <small>Nume in clar:</small>
              <small className="eau-lsg">SEMNATURA</small>
              <small className="eau-lda">
                DATA <span>ORA</span>
              </small>
            </div>
            <div className="eau-lob">
              <small>OBSERVATII</small>
              <small>CONTINUT &nbsp;Vesta Hi-Vis x2</small>
            </div>
          </div>
        </div>
        <div className="eau-prf">
          <svg viewBox="0 0 568 12" preserveAspectRatio="none">
            <path d={ZIMTI} fill="#8F959B" />
            <path d="M0 0H568V2H0z" fill="#B5BAC0" />
          </svg>
        </div>
        <div className="eau-chs eau-ch2">
          <Bula t={tinta("bula-1-0")} titlu="AWB 2401773915" detaliu="generat automat" />
          <Bula t={tinta("bula-1-1")} titlu="Ridicare comandată" detaliu="azi, 14:00 - 17:00" />
        </div>
      </Card>

      {/* ── 3. E-mailul, în Gmail ── */}
      <Card i={2}>
        <Cap i={2} sigla={SIGLA_GMAIL} titlu="Email" subtitlu="Confirmare + factură PDF" />
        <div className="eau-gm">
          <div className="eau-gtop">
            <i className="eau-gham">
              <b />
              <b />
              <b />
            </i>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="eau-glogo" src={SIGLA_GMAIL} alt="" loading="lazy" decoding="async" />
            <span className="eau-gword">Gmail</span>
            <div className="eau-gsr">
              <svg viewBox="0 0 24 24">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
              </svg>
              Caută în e-mailuri
              <svg className="eau-gtn" viewBox="0 0 24 24">
                <path d="M4 7h16M7 12h10M10 17h4" />
              </svg>
            </div>
            <div className="eau-gic">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" />
                <circle cx="12" cy="16.8" r=".6" />
              </svg>
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
                <circle cx="12" cy="12" r="6.6" />
              </svg>
              <svg viewBox="0 0 24 24" className="eau-gapp">
                {[5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
              </svg>
              <b>A</b>
            </div>
          </div>
          <div className="eau-grail">
            <div className="eau-gcmp">
              <svg viewBox="0 0 24 24">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
              </svg>
              Scrie
            </div>
            <div className="eau-gnv on">
              <svg viewBox="0 0 24 24">
                <path d="M3 13h5l1.5 3h5l1.5-3h5M5 5h14l2 8v6H3v-6z" />
              </svg>
              Mesaje primite<b className="eau-gcnt">{D0.necitite}</b>
            </div>
            <div className="eau-gnv">
              <svg viewBox="0 0 24 24">
                <path d={STEA} />
              </svg>
              Cu stea
            </div>
            <div className="eau-gnv">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              Amânate
            </div>
            <div className="eau-gnv">
              <svg viewBox="0 0 24 24">
                <path d="M3 20.5 21 12 3 3.5l2.5 8.5zM5.5 12H12" />
              </svg>
              Trimise
            </div>
            <div className="eau-gnv">
              <svg viewBox="0 0 24 24">
                <path d="M6 3h8l4 4v14H6z" />
                <path d="M14 3v4h4" />
              </svg>
              Ciorne
            </div>
            <div className="eau-gnv">
              <svg viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
              Mai multe
            </div>
          </div>
          <div className="eau-gmain">
            <div className="eau-glist" {...tinta("mail-lista")}>
              <div className="eau-gbar">
                <i className="eau-gcb" />
                <svg viewBox="0 0 24 24">
                  <path d="M19 12a7 7 0 1 1-2-4.9M19 4v4h-4" />
                </svg>
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="5.5" r="1.2" />
                  <circle cx="12" cy="12" r="1.2" />
                  <circle cx="12" cy="18.5" r="1.2" />
                </svg>
                <span>1–50 din 1.204</span>
              </div>
              <div className="eau-gtabs">
                <span className="on">
                  <svg viewBox="0 0 24 24">
                    <path d="M3 13h5l1.5 3h5l1.5-3h5M5 5h14l2 8v6H3v-6z" />
                  </svg>
                  Principale
                </span>
                <span>
                  <svg viewBox="0 0 24 24">
                    <path d="M3 12V4h8l10 10-8 8z" />
                    <circle cx="7.5" cy="8.5" r="1.3" />
                  </svg>
                  Promoții
                </span>
                <span>
                  <svg viewBox="0 0 24 24">
                    <circle cx="9" cy="8" r="3.5" />
                    <path d="M2.5 20c.5-4 3.5-6 6.5-6s6 2 6.5 6M16 4.8a3.4 3.4 0 0 1 0 6.4M18 14c2 .6 3.3 2.6 3.5 6" />
                  </svg>
                  Social
                </span>
              </div>
              <div className="eau-grows">
                <div className="eau-gr u eau-grn" {...tinta("mail-nou")}>
                  <i className="eau-grf" {...tinta("mail-nou-fond")} />
                  <ContinutRand r={nou} />
                </div>
                <div className="eau-grv" {...tinta("mail-vechi")}>
                  {vechi.map((r, j) => (
                    <div key={r[0]} className={r[4] ? "eau-gr u" : "eau-gr"} style={{ top: j * 42 }}>
                      <ContinutRand r={r} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="eau-gread" {...tinta("mail-citit")}>
              <div className="eau-gtb">
                <svg viewBox="0 0 24 24">
                  <path d="M20 12H5M11 6l-6 6 6 6" />
                </svg>
                <svg viewBox="0 0 24 24">
                  <path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4" />
                </svg>
                <svg viewBox="0 0 24 24">
                  <path d="M12 3 2.5 20h19z" />
                  <path d="M12 10v4.5M12 17v.5" />
                </svg>
                <svg viewBox="0 0 24 24">
                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                </svg>
                <i />
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12l3 2" />
                </svg>
                <span>1 din 1.204</span>
              </div>
              <div className="eau-gsub">
                Comanda #10481 a fost confirmată{" "}
                <span>
                  Mesaje primite <b>×</b>
                </span>
              </div>
              <div className="eau-gfrom">
                <i>e</i>
                <div>
                  <b>eSAFE</b> <small>&lt;comenzi@esafe.ro&gt;</small>
                  <br />
                  <small>către mine ▾</small>
                </div>
                <span className="eau-gtm">10:24 (acum 0 minute)</span>
              </div>
              <div className="eau-gmsg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="eau-ml" src={SIGLA_ESAFE_EMAIL} alt="" loading="lazy" decoding="async" />
                <h4>Mulțumim pentru comandă, Andrei!</h4>
                <p>
                  Comanda <b>#10481</b> a fost confirmată și va fi predată astăzi curierului FAN Courier.
                </p>
                <div className="eau-mt">
                  <span>Vestă reflectorizantă Hi-Vis × 2</span>
                  <b>174,00 lei</b>
                  <span>Livrare FAN Courier</span>
                  <b>15,00 lei</b>
                  <span className="t">Total</span>
                  <b className="t">189,00 lei</b>
                </div>
                <em>Urmărește comanda</em>
              </div>
              <div className="eau-gatt" {...tinta("mail-atasament")}>
                <small>Un atașament</small>
                <div className="eau-gac">
                  <div className="eau-gath">
                    <i />
                    <i />
                    <i style={{ width: "60%" }} />
                    <i />
                    <i style={{ width: "40%" }} />
                  </div>
                  <div className="eau-gaf">
                    <b>PDF</b>FC0482.pdf
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 4. SMS, pe iPhone ── */}
      <Card i={3}>
        <Cap i={3} sigla={SIGLA_IMESSAGE} titlu="SMS" subtitlu="către client" imessage />
        <div className="eau-ip">
          <i className="eau-ib1" />
          <i className="eau-ib2" />
          <i className="eau-ib3" />
          <i className="eau-ib4" />
          <div className="eau-is">
            <div className="eau-ist">
              <b>10:24</b>
              <i className="eau-idi" />
              <span>
                <svg viewBox="0 0 18 12">
                  <rect x="0" y="8" width="3" height="4" rx=".8" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx=".8" />
                  <rect x="10" y="3" width="3" height="9" rx=".8" />
                  <rect x="15" y="0" width="3" height="12" rx=".8" />
                </svg>
                <svg viewBox="0 0 16 12">
                  <path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.4 6.8a6.5 6.5 0 0 1 9.2 0l-1.4 1.4a4.5 4.5 0 0 0-6.4 0zM1.2 4.6a9.6 9.6 0 0 1 13.6 0l-1.4 1.4a7.6 7.6 0 0 0-10.8 0z" />
                </svg>
                <em>
                  <b />
                </em>
              </span>
            </div>
            <div className="eau-inav">
              <span className="eau-iback">
                <svg viewBox="0 0 12 20">
                  <path d="M10 2 2 10l8 8" />
                </svg>
                <b>12</b>
              </span>
              <div className="eau-iav">
                <svg viewBox="0 0 40 40">
                  <circle cx="20" cy="15" r="7" />
                  <path d="M6 36c1.5-8 7.5-11 14-11s12.5 3 14 11" />
                </svg>
              </div>
              <small>
                eSAFE{" "}
                <svg viewBox="0 0 8 12">
                  <path d="m2 2 4 4-4 4" />
                </svg>
              </small>
            </div>
            <div className="eau-ibody">
              <div className="eau-imeta">
                Mesaj text
                <br />
                Azi 10:24
              </div>
              <div className="eau-ityp" {...tinta("sms-scrie")}>
                <i {...tinta("sms-punct-0")} />
                <i {...tinta("sms-punct-1")} />
                <i {...tinta("sms-punct-2")} />
              </div>
              <div className="eau-ibub" {...tinta("sms-mesaj")}>
                eSAFE: Comanda ta #10481 a fost predată către FAN Courier. AWB: 2401773915. Urmărește coletul aici: <u>esafe.ro/t/2401</u>
              </div>
            </div>
            <div className="eau-iin">
              <i className="eau-iplus">
                <svg viewBox="0 0 16 16">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </i>
              <div className="eau-ipill">
                Mesaj text
                <svg viewBox="0 0 16 20">
                  <rect x="5" y="1" width="6" height="11" rx="3" />
                  <path d="M2.5 9.5a5.5 5.5 0 0 0 11 0M8 15v4" />
                </svg>
              </div>
            </div>
            <i className="eau-ihb" />
          </div>
        </div>
        <div className="eau-chs eau-ch4a">
          <Bula t={tinta("bula-3-0")} titlu="Trimis automat" detaliu="la 10:24:05" />
        </div>
        <div className="eau-chs eau-ch4b">
          <Bula t={tinta("bula-3-1")} titlu="AWB și link de urmărire" detaliu="incluse în mesaj" />
        </div>
      </Card>
    </ScenaAnimata>
  );
}
