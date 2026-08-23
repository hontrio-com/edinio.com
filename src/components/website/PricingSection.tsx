"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  type BillingInterval,
  getAnnualPrice,
  getAnnualMonthlyEquivalent,
  ANNUAL_FREE_MONTHS,
} from "@/lib/plans";
import {
  PRICING_EYEBROW,
  PRICING_LEAD,
  PRICING_PLANS,
  PRICING_TITLE,
  pretIntermediar,
  pretLunar,
  type PricingPlan,
} from "@/lib/website/pricing";
import { SectionEyebrow } from "./sections/SectionEyebrow";
import { butonAlb, butonVerde } from "@/lib/website/buton";
import { VERDE_CITIBIL } from "@/lib/website/linii";

/**
 * Secțiunea de prețuri, adusă în limbajul vizual al site-ului refăcut.
 *
 * ═══ CE S-A SCHIMBAT ȘI CE NU ═══
 *
 * NU s-a atins conținutul: aceleași patru planuri, aceleași prețuri, aceleași
 * beneficii, aceleași etichete de buton, același comutator lunar/anual. Cererea a
 * fost limpede — „conținutul rămâne identic și prețurile la fel, doar schimbi
 * puțin design-ul". Singurele lucruri scoase sunt cele două garanții de sub
 * grilă, cerute explicit.
 *
 * S-a schimbat DESENUL, ca să nu mai fie singura secțiune scrisă în tokenii
 * vechi (`bg-card`, `text-muted-foreground`, colțuri de pastilă) pe o pagină
 * unde restul folosește `ink` / `hairline` / `tint`.
 *
 * ═══ TREI DECIZII CARE NU SUNT DE GUST ═══
 *
 * 1. **Capul secțiunii e al perechii.** Aceeași etichetă (13px, semibold,
 *    0.18em), același titlu (32/44px), aceeași descriere (16/18px) ca la
 *    „Problema", „Soluția" și „Comparație". Când se schimbă unul, se schimbă
 *    toate — numai fiindcă arată identic se citesc ca o serie.
 *
 * 2. **Planul recomandat se ridică prin UMBRĂ, nu prin scalare.** Era
 *    `lg:scale-105`, care mărește și textul: pe un card cu prețuri, cifrele ies
 *    ușor neclare, iar ochiul o citește ca „ceva e mișcat". Acum e aceeași placă
 *    ridicată ca la casetele de la Integrări — alb curat, deosebit de pagină
 *    doar prin umbră.
 *
 * 3. **Un singur buton verde plin, cel de la planul recomandat.** Patru butoane
 *    verzi unul lângă altul ar concura între ele și cu cel din hero, care
 *    trebuie să rămână singurul verde plin de pe pagină. Același motiv și
 *    aceeași soluție ca la cardurile din „Soluția".
 *
 * ⚠ Eticheta „Recomandat" NU mai e o pastilă lipită pe muchia cardului. E scrisă
 * ca text mărunt cu majuscule, în aceeași familie cu etichetele de secțiune —
 * pastilele plutitoare sunt exact tiparul pe care clientul l-a tăiat de fiecare
 * dată când l-a văzut.
 */

/* Verdele pentru TEXT, luat din `lib/website/linii.ts`.

   Era declarat aici, si in inca patru fisiere, cu acelasi comentariu copiat
   langa fiecare: `#12874A`, ales fiindca verdele de marca (#1AB554) are pe alb
   2,70:1, sub prag. Alegerea era buna, dar `--primary` era deja acolo si are
   4,95:1. Doctrina celor doi verzi ramasi e in capul lui `globals.css`. */
const GREEN_TEXT = VERDE_CITIBIL;

export function PricingSection({ cuAntet = true }: { cuAntet?: boolean }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  /*
   * Fara antet, si spatiul de sus se strange.
   *
   * Cu antetul stins, sectiunea sta sub capul paginii, care isi aduce deja
   * marginea lui de jos: adunate, ieseau ~170px de alb intre fraza si primul
   * pret, adica un gol care se citeste ca o sectiune lipsa. Marginea de JOS
   * ramane intreaga — sub ea urmeaza alta sectiune, nu un cap de pagina.
   */
  return (
    <section
      id="preturi"
      className={cn("bg-white pb-20 lg:pb-28", cuAntet ? "pt-20 lg:pt-28" : "pt-8 lg:pt-10")}
    >
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        {/*
          Pe `/preturi` capul se ascunde: pagina aia are deja un `<h1>Prețuri</h1>`
          cu descrierea lui, iar puse cap la cap ar fi ieșit trei blocuri de text
          unul sub altul înainte de primul preț.
        */}
        {cuAntet && (
          <div className="mx-auto max-w-[720px] text-center">
            <SectionEyebrow label={PRICING_EYEBROW} />

            <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
              {PRICING_TITLE.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>

            <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
              {PRICING_LEAD}
            </p>
          </div>
        )}

        {/*
          Comutatorul lunar/anual. Colțuri de 10px afară și 6px înăuntru: ca două
          colțuri concentrice să pară paralele, raza interioară trebuie să fie cea
          exterioară minus distanța dintre ele. Nu e pastilă — butoanele din tot
          site-ul au colț, nu formă de bomboană.
        */}
        <div className={cn("flex justify-center", cuAntet ? "mt-12" : "mt-0")}>
          <div className="inline-flex items-center gap-1 rounded-[10px] border border-hairline bg-tint p-1">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              aria-pressed={interval === "monthly"}
              className={cn(
                "rounded-[6px] px-4 py-2 text-[13.5px] font-semibold transition-colors sm:px-5",
                interval === "monthly"
                  ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,20,40,0.08)]"
                  : "text-ink-2 hover:text-ink",
              )}
            >
              Lunar
            </button>
            <button
              type="button"
              onClick={() => setInterval("annual")}
              aria-pressed={interval === "annual"}
              className={cn(
                "flex items-center gap-2 rounded-[6px] px-4 py-2 text-[13.5px] font-semibold transition-colors sm:px-5",
                interval === "annual"
                  ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,20,40,0.08)]"
                  : "text-ink-2 hover:text-ink",
              )}
            >
              Anual
              {/*
                Oferta stă în VERDE, nu într-o pastilă plină: pe un comutator
                mic, un dreptunghi colorat trage ochiul mai tare decât starea
                aleasă și nu se mai vede care buton e apăsat.
              */}
              <span className="text-[11.5px] font-bold" style={{ color: GREEN_TEXT }}>
                {ANNUAL_FREE_MONTHS} luni gratis
              </span>
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4 lg:gap-6">
          {PRICING_PLANS.map((plan) => (
            <CardPlan key={plan.id} plan={plan} interval={interval} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Prețul, care URCĂ sau COBOARĂ până la valoarea nouă când se schimbă intervalul.
 *
 * ═══ DE CE AȘA, ȘI NU ALTFEL ═══
 *
 * Fără bibliotecă: e un `requestAnimationFrame` de treizeci de rânduri. Un pachet
 * de animație adus pentru o singură cifră ar fi ajuns în pachetul trimis fiecărui
 * vizitator al paginii de start — aceeași socoteală pentru care fasciculele din
 * hero sunt gradiente, nu WebGL.
 *
 * **Nu pornește la prima randare.** Starea începe chiar pe valoarea finală, deci
 * ce trimite serverul e ce vede omul: fără o clipă de „0" înainte de preț, și
 * fără nepotrivire de hidratare. Animația se declanșează abia când `valoare`
 * chiar se schimbă, adică la apăsarea comutatorului.
 *
 * **Se pleacă de la ce e PE ECRAN**, nu de la prețul precedent din date: dacă
 * omul apasă lunar/anual repede de două ori, a doua animație continuă de unde a
 * ajuns prima, în loc să sară înapoi.
 *
 * `tabular-nums` nu e cosmetic: cu cifre de lățimi diferite, numărul se lățește
 * și se îngustează la fiecare cadru și tot rândul tremură. Cu ele egale, doar
 * cifrele se schimbă.
 *
 * `prefers-reduced-motion` sare direct la valoarea finală. Nimeni nu pierde
 * informație — cifra e acolo, doar că nu se mai plimbă până la ea.
 */
const DURATA_CIFRA_MS = 520;

function PretAnimat({ valoare, className }: { valoare: number; className?: string }) {
  const [afisat, setAfisat] = useState(valoare);
  /* Ce e chiar pe ecran acum. Ținut într-un `ref`, ca efectul de mai jos să nu
     depindă de `afisat` — altfel s-ar reporni la fiecare cadru. */
  const peEcran = useRef(valoare);
  const cadru = useRef(0);

  useEffect(() => {
    const deLa = peEcran.current;
    if (deLa === valoare) return;

    /*
     * O SINGURĂ cale, și pentru mișcarea oprită.
     *
     * Varianta evidentă — `if (reduceMotion) { setAfisat(valoare); return; }` —
     * e o scriere de stare direct în efect, pe care regula `set-state-in-effect`
     * a proiectului o interzice, și pe bună dreptate: randează de două ori și
     * poate scăpa un cadru cu valoarea veche. Cu durata zero, aceeași buclă
     * termină din primul cadru, deci codul are un singur drum și nicio excepție
     * de întreținut.
     */
    const durata =
      typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : DURATA_CIFRA_MS;

    const pornit = performance.now();
    const pas = (acum: number) => {
      const p = durata === 0 ? 1 : Math.min(1, (acum - pornit) / durata);
      /* Regula e în `pricing.ts`, unde e și probată: aici rămâne doar ceasul. */
      const v = pretIntermediar(deLa, valoare, p);
      peEcran.current = v;
      setAfisat(v);
      if (p < 1) cadru.current = requestAnimationFrame(pas);
    };
    cadru.current = requestAnimationFrame(pas);

    /*
     * ⚠ PLASĂ DE SIGURANȚĂ: cifra trebuie să ajungă la valoarea nouă chiar dacă
     * animația nu rulează niciodată.
     *
     * În fila din FUNDAL, Chrome oprește `requestAnimationFrame` cu totul.
     * Măsurat: cu fila ascunsă, apăsarea pe „Anual" lăsa prețul pe 99 la
     * nesfârșit — nu doar fără animație, ci cu CIFRA GREȘITĂ. Iar dacă omul
     * schimbă fila la mijlocul animației, ea îngheață pe o valoare intermediară,
     * care nu e prețul niciunui plan.
     *
     * Aici nu vorbim de un efect, ci de BANI pe o pagină comercială. Ceasurile
     * merg și în filele ascunse (încetinite, dar merg), deci după durata
     * animației se scrie valoarea finală oricum. Dacă animația s-a terminat
     * normal, scrie aceeași valoare și nu se vede nimic.
     */
    const plasa = window.setTimeout(() => {
      peEcran.current = valoare;
      setAfisat(valoare);
    }, durata + 80);

    return () => {
      cancelAnimationFrame(cadru.current);
      window.clearTimeout(plasa);
    };
  }, [valoare]);

  return <span className={cn("tabular-nums", className)}>{afisat}</span>;
}

function CardPlan({ plan, interval }: { plan: PricingPlan; interval: BillingInterval }) {
  const lunar = pretLunar(plan.id);
  const gratuit = lunar === 0;
  const anual = getAnnualPrice(plan.id);
  const peLuna = interval === "annual" ? getAnnualMonthlyEquivalent(plan.id) : lunar;

  return (
    <div
      className={cn(
        "flex flex-col rounded-[16px] p-6",
        /*
          Planul recomandat: placa ridicată (`.placa` aduce alb + umbra de patru
          straturi). NU primește și `border`: umbra are deja un contur de 1px, iar
          două contururi peste același colț se văd ca o linie groasă.
        */
        plan.popular ? "placa" : "border border-hairline bg-white",
      )}
    >
      {/*
        Rândul etichetei există la TOATE cardurile, chiar gol: fără el, cardul
        recomandat ar fi cu ~22px mai înalt decât vecinii și titlurile n-ar mai
        cădea pe aceeași linie.
      */}
      <p
        className="h-[18px] text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: GREEN_TEXT }}
      >
        {plan.popular ? "Recomandat" : ""}
      </p>

      <h3 className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ink">{plan.name}</h3>
      <p className="mt-1 text-[13.5px] leading-[1.5] text-ink-2">{plan.description}</p>

      {/*
        Înălțime fixă pentru blocul de preț: planul gratuit are alt cuprins
        („Gratuit / 15 zile") decât celelalte („249 lei/lună / Facturat lunar"),
        iar fără ea listele de beneficii ar porni de la înălțimi diferite și
        cardurile n-ar mai arăta ca o serie.
      */}
      <div className="mb-6 mt-6 min-h-[92px]">
        {gratuit ? (
          <>
            <span className="text-[38px] font-bold leading-none tracking-[-0.03em] text-ink">
              Gratuit
            </span>
            <span className="mt-2 block text-[13px] text-ink-2">15 zile</span>
          </>
        ) : (
          <>
            <PretAnimat
              valoare={peLuna}
              className="text-[38px] font-bold leading-none tracking-[-0.03em] text-ink"
            />
            <span className="ml-1.5 text-[13px] text-ink-2">lei/lună</span>
            <p className="mt-2 text-[12px] leading-[1.5] text-ink-3">
              {interval === "annual" ? (
                <>
                  Facturat anual: <PretAnimat valoare={anual} /> lei.{" "}
                  <span className="font-semibold" style={{ color: GREEN_TEXT }}>
                    {ANNUAL_FREE_MONTHS} luni gratis
                  </span>
                </>
              ) : (
                "Facturat lunar"
              )}
            </p>
          </>
        )}
      </div>

      <ul className="mb-8 flex-1 space-y-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-[13.5px] leading-[1.5]">
            {/*
              Bifa e aliniată cu PRIMA linie de text (`mt-[3px]`), nu centrată pe
              rând: la un beneficiu care se rupe pe două rânduri, o bifă centrată
              plutește în dreptul spațiului dintre ele. Același motiv și aceeași
              valoare ca în cardurile din „Soluția".
            */}
            <Check className="mt-[3px] h-4 w-4 shrink-0" style={{ color: GREEN_TEXT }} strokeWidth={2.5} />
            <span className="text-ink-2">{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/register"
        /* Perechea verde/alb, din aceeasi reteta: puse pe carduri alaturate,
           cele doua butoane trebuie sa stea pe aceeasi linie de sus si de jos. */
        className={cn("w-full", plan.popular ? butonVerde() : butonAlb())}
      >
        {plan.cta}
      </Link>
    </div>
  );
}
