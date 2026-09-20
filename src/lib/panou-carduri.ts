/*
  ═══════════════════════════════════════════════════════════════════════════
  CELE PATRU CARDURI DIN CAPUL PANOULUI: intelesurile
  ═══════════════════════════════════════════════════════════════════════════

  Cifrele vin dintr-o singura functie din baza, `panou_carduri` (vezi
  migrations/2026-09-20-panou-carduri.sql). Aici stau doar forma raspunsului si
  cele doua impartiri de afisare: media pe comanda si rata de conversie.

  ⚠ Amandoua se fac din SUMELE lunii, nu din alte medii. Media zilelor si media
  comenzilor nu dau acelasi numar, iar cea care se vede pe card trebuie sa fie
  chiar „cati lei aduce, in medie, o comanda".
*/

import { crestere, ziua } from "@/lib/vanzari";

export type FereastraCarduri = {
  vanzari: number;
  comenzi: number;
  vizite: number;
  de_la: string;
  pana_la: string;
};

export type DateCarduri = {
  azi: { comenzi: number };
  /** Ieri, dar numai pana la ora de acum. Vezi nota de mai jos. */
  ieri_pana_acum: { comenzi: number; ora: string };
  luna: FereastraCarduri;
  /** Aceleasi zile din luna trecuta (1 - aceeasi zi), nu luna intreaga. */
  luna_trecuta: FereastraCarduri;
};

/** Cati lei aduce in medie o comanda. `null` cand nu exista nicio comanda. */
export function valoareMedie(f: { vanzari: number; comenzi: number }): number | null {
  return f.comenzi > 0 ? f.vanzari / f.comenzi : null;
}

/**
 * Din cati vizitatori au si comandat, in procente. `null` cand nu exista vizite.
 *
 * ⚠ `null`, nu `0`: „0%" inseamna „au venit oameni si n-a cumparat niciunul",
 * iar lipsa vizitelor inseamna cu totul altceva. Un magazin nou ar fi citit
 * primul mesaj si ar fi crezut ca are o problema de vanzare, cand de fapt n-are
 * inca trafic.
 */
export function rataConversie(f: { comenzi: number; vizite: number }): number | null {
  return f.vizite > 0 ? (f.comenzi / f.vizite) * 100 : null;
}

/** Cresterea intre doua valori care pot lipsi. */
export function cresterePosibila(acum: number | null, inainte: number | null): number | null {
  if (acum === null || inainte === null) return null;
  return crestere(acum, inainte);
}

/**
 * Citeste raspunsul functiei din baza, aparandu-se de orice alta forma.
 *
 * ⚠ Raspunsul vine ca `Json`, adica „orice". Un `as` ar fi trecut de TypeScript
 * si ar fi cazut abia in fata comerciantului.
 */
export function citesteDateCarduri(brut: unknown): DateCarduri | null {
  const o = brut as Partial<DateCarduri> | null;
  if (!o || typeof o !== "object") return null;
  if (!o.azi || !o.ieri_pana_acum || !o.luna || !o.luna_trecuta) return null;
  if (!o.luna.de_la || !o.luna_trecuta.de_la) return null;

  const fereastra = (f: unknown): FereastraCarduri => {
    const x = f as Partial<FereastraCarduri>;
    return {
      vanzari: Number(x?.vanzari ?? 0),
      comenzi: Number(x?.comenzi ?? 0),
      vizite: Number(x?.vizite ?? 0),
      de_la: String(x?.de_la ?? ""),
      pana_la: String(x?.pana_la ?? ""),
    };
  };

  return {
    azi: { comenzi: Number(o.azi.comenzi ?? 0) },
    ieri_pana_acum: {
      comenzi: Number(o.ieri_pana_acum.comenzi ?? 0),
      ora: String(o.ieri_pana_acum.ora ?? ""),
    },
    luna: fereastra(o.luna),
    luna_trecuta: fereastra(o.luna_trecuta),
  };
}

/**
 * Aceleasi zile ale lunii trecute, scrise scurt: „1 - 20 aug.".
 *
 * Forma lunga („1 aug. - 20 aug. 2026") rupea randul de sub cifra in doua si se
 * lovea de „Vezi detalii". Sub cifra incape doar o amintire scurta; explicatia
 * intreaga sta in tooltip.
 */
export function zileScurt(de_la: string, pana_la: string): string {
  const a = ziua(de_la);
  const b = ziua(pana_la);
  if (!a || !b) return "";
  const luna = b.toLocaleDateString("ro-RO", { month: "short" });
  return a.getDate() === b.getDate()
    ? `${b.getDate()} ${luna}`
    : `${a.getDate()} - ${b.getDate()} ${luna}`;
}
