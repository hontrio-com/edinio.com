import { PLAN_PRICES } from "@/lib/plans";

/**
 * Secțiunea de prețuri de pe site-ul de prezentare.
 *
 * ═══ TEXTELE SUNT ALE CLIENTULUI ═══
 *
 * Titlul și descrierea au fost date cuvânt cu cuvânt (2026-08-09). Numele
 * planurilor, descrierile lor, lista de beneficii și etichetele butoanelor sunt
 * cele dinainte, NESCHIMBATE: cererea a fost explicit „conținutul rămâne identic
 * și prețurile la fel", doar desenul se potrivește cu restul site-ului.
 *
 * ═══ PREȚURILE NU SE SCRIU AICI ═══
 *
 * Vin din `PLAN_PRICES` (`lib/plans.ts`), care e sursa folosită de aplicație la
 * facturare. Erau copiate de mână în componentă — aceleași valori, dar două
 * locuri: la prima scumpire, site-ul de prezentare ar fi rămas în urmă și ar fi
 * anunțat un preț pe care platforma nu-l mai practică. Acum nu se pot despărți.
 */
export const PRICING_EYEBROW = "Prețuri";

export const PRICING_TITLE = ["Tot magazinul tău,", "într-un singur abonament."];

export const PRICING_LEAD =
  "Platformă, integrări, mentenanță și asistență, fără grija costurilor tehnice care apar separat.";

export interface PricingPlan {
  /** Trebuie să existe în `PLAN_PRICES`, altfel prețul iese 0. */
  id: string;
  name: string;
  description: string;
  features: string[];
  cta: string;
  popular: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "trial",
    name: "Testare",
    description: "Testează platforma fără obligații",
    features: [
      "Acces complet 15 zile",
      "Până la 10 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
    ],
    cta: "Începe testarea",
    popular: false,
  },
  {
    id: "basic",
    name: "Basic",
    description: "Pentru afaceri în creștere",
    features: [
      "Până la 500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanță gratuită pe viață",
    ],
    cta: "Alege Basic",
    popular: false,
  },
  {
    id: "premium",
    name: "Premium",
    description: "Cel mai popular",
    features: [
      "Până la 2.500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanță gratuită pe viață",
      "Manager dedicat magazinului tău",
    ],
    cta: "Alege Premium",
    popular: true,
  },
  {
    id: "ultra",
    name: "Ultra",
    description: "Pentru afaceri mari",
    features: [
      "Produse nelimitate",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanță gratuită pe viață",
      "Manager dedicat magazinului tău",
    ],
    cta: "Alege Ultra",
    popular: false,
  },
];

/** Prețul lunar al unui plan, din sursa aplicației. */
export function pretLunar(planId: string): number {
  return PLAN_PRICES[planId] ?? 0;
}

/*
 * ⚠ CELE DOUĂ GARANȚII DE SUB CARDURI AU FOST SCOASE, la cerere (2026-08-09):
 * „Anulezi oricând, fără costuri sau penalități" și „Prețul tău rămâne fix pe
 * viață, fără scumpiri".
 *
 * Erau un rând de două promisiuni cu iconițe sub grilă — exact forma pe care
 * clientul a tăiat-o și în hero („fără rânduri de bife"). Scrise aici ca să se
 * știe ce anume nu se mai spune pe pagină, dacă vreodată se caută.
 */

/**
 * Valoarea afișată a prețului la un moment dat din animația de urcare/coborâre.
 *
 * Stă aici, nu în componentă, ca să poată fi PROBATĂ: animația se poate uita cu
 * ochiul doar pe un ecran adevărat — într-o filă din fundal Chrome oprește
 * `requestAnimationFrame` cu totul, deci nicio verificare automată nu o vede
 * mișcându-se. Ce se poate proba e chiar regula: de unde pleacă, unde ajunge și
 * cum se așază.
 *
 * `progres` merge de la 0 la 1. Curba e ease-out cubic: pleacă repede și se
 * așază lin. Liniar, cifra pare că se oprește brusc; ease-in-out pare că ezită
 * la plecare, iar pe un număr care se schimbă asta se citește ca lag.
 *
 * ⚠ La `progres = 1` întoarce EXACT ținta, nu o rotunjire aproape de ea: e un
 * preț, nu o poziție pe ecran.
 */
export function pretIntermediar(deLa: number, pana: number, progres: number): number {
  const p = Math.min(1, Math.max(0, progres));
  if (p === 1) return pana;
  const eased = 1 - Math.pow(1 - p, 3);
  return Math.round(deLa + (pana - deLa) * eased);
}
