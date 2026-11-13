/*
  ═══════════════════════════════════════════════════════════════════════════
  CATE PRODUSE PE UN RAND (13.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cererea lui: „Vreau la Randurile de produse din Editor sa poti selecta cate produse sa se vada pe rand.” Reglajul
  `coloane` al randului de produse (`registry.ts`, ambele variante): 2-6 pe calculator, sau „Automat”, adica exact ce era
  pana atunci: 4, iar pe panoul gri (`banda`, tema Jupiter) 5. Lipsa cheii e tot „Automat”, deci niciun magazin nu se
  schimba pana nu alege.

  Pe telefon raman 2 pe rand (in carusel ~2,2, ca sa se vada ca mai urmeaza), pe tableta cel mult 3. La 6, pe ecranele de
  1024-1279 px se vad 5: acolo cardul ar fi avut ~150 px, prea ingust pentru nume si pret.

  ⚠ Clasele sunt scrise intregi, nu compuse din numar: Tailwind le gaseste doar asa in sursa.
*/

export const COLOANE_RAND = [2, 3, 4, 5, 6] as const;
export type ColoaneRand = (typeof COLOANE_RAND)[number];

/** Cate produse pe rand s-au ales, sau `null` pentru „Automat” (cheia lipsa, „auto” sau orice altceva). */
export function coloaneRand(v: unknown): ColoaneRand | null {
  const n = typeof v === "string" && /^\d$/.test(v) ? Number(v) : typeof v === "number" ? v : NaN;
  return (COLOANE_RAND as readonly number[]).includes(n) ? (n as ColoaneRand) : null;
}

/** Cate se vad pe calculator: alegerea, sau implicitul randului (4; 5 pe panoul gri). */
export function coloaneEfective(coloane: ColoaneRand | null, banda: boolean): ColoaneRand {
  return coloane ?? (banda ? 5 : 4);
}

/** Coloanele grilei. 4 si 5 sunt exact clasele de dinainte (randul obisnuit, respectiv panoul gri). */
const GRILA: Record<ColoaneRand, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6",
};

export function claseGrila(coloane: ColoaneRand | null, banda: boolean): string {
  return GRILA[coloaneEfective(coloane, banda)];
}

/**
 * Latimea unui card in carusel. Intre carduri sunt 16 px (`sm:gap-4`), deci la N pe rand: (100% - (N-1) rem) / N.
 * „Automat” pastreaza ce era: 23% pe randul obisnuit (al cincilea card se vede pe jumatate), cinci intregi pe panoul gri.
 */
const LATIME_CARD: Record<ColoaneRand, string> = {
  2: "w-[44%] sm:w-[calc((100%-1rem)/2)]",
  3: "w-[44%] sm:w-[30%] lg:w-[calc((100%-2rem)/3)]",
  4: "w-[44%] sm:w-[30%] lg:w-[calc((100%-3rem)/4)]",
  5: "w-[44%] sm:w-[30%] lg:w-[calc((100%-4rem)/5)]",
  6: "w-[44%] sm:w-[30%] lg:w-[calc((100%-4rem)/5)] xl:w-[calc((100%-5rem)/6)]",
};

export function latimeCardCarusel(coloane: ColoaneRand | null, banda: boolean): string {
  if (coloane) return LATIME_CARD[coloane];
  return `w-[44%] sm:w-[30%] ${banda ? "lg:w-[calc((100%-4rem)/5)]" : "lg:w-[23%]"}`;
}
