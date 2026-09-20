import type { FelPerioada } from "@/lib/vanzari";

/*
  ═══════════════════════════════════════════════════════════════════════════
  INTELESURILE PAGINII STATISTICI
  ═══════════════════════════════════════════════════════════════════════════

  Modul curat, citit si de server si de browser. Socoteala sta in baza
  (`vanzari_panou`, `trafic_panou`, `comenzi_pe_judet`); aici stau numele
  perioadelor, formele raspunsurilor si cele doua impartiri de afisare.
*/

/** Perioadele cerute de proprietar, 20.09.2026. `fereastra_vanzari` le stie pe toate. */
export const PERIOADE_STATISTICI: { fel: FelPerioada | "azi" | "ieri"; eticheta: string }[] = [
  { fel: "azi", eticheta: "Astazi" },
  { fel: "ieri", eticheta: "Ieri" },
  { fel: "7z", eticheta: "7 zile" },
  { fel: "30z", eticheta: "30 zile" },
  { fel: "90z", eticheta: "90 zile" },
  { fel: "luna", eticheta: "Luna aceasta" },
  { fel: "an", eticheta: "Anul acesta" },
  { fel: "custom", eticheta: "Personalizat" },
];

export type FelPerioadaStatistici = (typeof PERIOADE_STATISTICI)[number]["fel"];

export type TotalTrafic = {
  vizitatori: number;
  sesiuni: number;
  afisari: number;
  sesiuni_cu_comanda: number;
};

export type PunctTrafic = TotalTrafic & { bucata: string };

export type DateTrafic = {
  interval: { de_la: string; pana_la: string };
  interval_anterior: { de_la: string; pana_la: string };
  total: TotalTrafic;
  total_anterior: TotalTrafic;
  serie: PunctTrafic[];
};

const TRAFIC_GOL: TotalTrafic = { vizitatori: 0, sesiuni: 0, afisari: 0, sesiuni_cu_comanda: 0 };

/**
 * Rata de conversie ADEVARATA: sesiuni cu comanda / sesiuni.
 *
 * ⚠ NU comenzi / afisari, cum era pana acum. O persoana care vede patru pagini
 * si cumpara o data facea rata sa arate de patru ori mai mica decat e: la 100
 * de oameni cu cate 4 pagini si 5 comenzi, adevarul e 5%, iar cifra veche 1,25%.
 *
 * `null` cand nu exista nicio sesiune: „0%" ar spune ca au venit oameni si n-a
 * cumparat niciunul, ceea ce e cu totul altceva decat „n-a venit nimeni".
 */
export function rataConversieSesiuni(t: TotalTrafic): number | null {
  return t.sesiuni > 0 ? (t.sesiuni_cu_comanda / t.sesiuni) * 100 : null;
}

/** Cate pagini deschide, in medie, o sesiune. `null` fara sesiuni. */
export function paginiPeSesiune(t: TotalTrafic): number | null {
  return t.sesiuni > 0 ? t.afisari / t.sesiuni : null;
}

/**
 * Citeste raspunsul lui `trafic_panou`, aparandu-se de orice alta forma.
 *
 * ⚠ Raspunsul vine ca `Json`. Un `as` ar fi trecut de TypeScript si ar fi cazut
 * abia in fata comerciantului, la primul `.map` peste ceva care nu e tablou.
 */
export function citesteDateTrafic(brut: unknown): DateTrafic | null {
  const o = brut as Partial<DateTrafic> | null;
  if (!o || typeof o !== "object") return null;
  if (!o.interval?.de_la || !o.interval_anterior?.de_la) return null;
  if (!Array.isArray(o.serie)) return null;

  const total = (t: unknown): TotalTrafic => {
    const x = (t ?? {}) as Partial<TotalTrafic>;
    return {
      vizitatori: Number(x.vizitatori ?? 0),
      sesiuni: Number(x.sesiuni ?? 0),
      afisari: Number(x.afisari ?? 0),
      sesiuni_cu_comanda: Number(x.sesiuni_cu_comanda ?? 0),
    };
  };

  return {
    interval: o.interval,
    interval_anterior: o.interval_anterior,
    total: o.total ? total(o.total) : TRAFIC_GOL,
    total_anterior: o.total_anterior ? total(o.total_anterior) : TRAFIC_GOL,
    serie: o.serie.map((p) => ({ ...total(p), bucata: String((p as PunctTrafic)?.bucata ?? "") })),
  };
}

export type RandJudet = { judet: string; comenzi: number; vanzari: number; medie: number };

/** Ce arata harta pe judete. Toate trei vin din aceeasi cerere. */
export type MasuraHarta = "comenzi" | "vanzari" | "medie";

export const MASURI_HARTA: { masura: MasuraHarta; eticheta: string; bani: boolean }[] = [
  { masura: "comenzi", eticheta: "Comenzi", bani: false },
  { masura: "vanzari", eticheta: "Vanzari", bani: true },
  { masura: "medie", eticheta: "Valoare medie", bani: true },
];
