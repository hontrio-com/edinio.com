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

/* ── Fila Vanzari ─────────────────────────────────────────────────────────── */

export type SumarVanzari = {
  comenzi: number;
  vanzari: number;
  produse: number;
  transport: number;
  reduceri: number;
  taxa_ramburs: number;
  tva: number;
  bucati: number;
  anulate: number;
  rambursate: number;
  pierdute: number;
};

export type RandProdus = {
  product_id: string | null;
  nume: string;
  bucati: number;
  vanzari: number;
  comenzi: number;
};
export type RandCategorie = { categorie: string; bucati: number; vanzari: number; comenzi: number };
export type RandCanal = { canal: string; comenzi: number; vanzari: number };
export type RandStatus = { status: string; comenzi: number; vanzari: number };

export type DetaliuVanzari = {
  sumar: SumarVanzari;
  produse: RandProdus[];
  categorii: RandCategorie[];
  canale: RandCanal[];
  statusuri: RandStatus[];
};

const SUMAR_GOL: SumarVanzari = {
  comenzi: 0, vanzari: 0, produse: 0, transport: 0, reduceri: 0,
  taxa_ramburs: 0, tva: 0, bucati: 0, anulate: 0, rambursate: 0, pierdute: 0,
};

/**
 * Citeste raspunsul lui `vanzari_detaliu`, aparandu-se de orice alta forma.
 *
 * ⚠ Ca la celelalte doua: raspunsul vine ca `Json`, iar un `as` ar fi cazut
 * abia in fata comerciantului, la primul `.map`.
 */
export function citesteDetaliuVanzari(brut: unknown): DetaliuVanzari | null {
  const o = brut as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;

  const n = (x: unknown) => Number(x ?? 0) || 0;
  const s = (x: unknown) => String(x ?? "");
  const lista = (x: unknown) => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);
  const sumarBrut = (o.sumar ?? {}) as Record<string, unknown>;

  return {
    sumar: {
      comenzi: n(sumarBrut.comenzi), vanzari: n(sumarBrut.vanzari), produse: n(sumarBrut.produse),
      transport: n(sumarBrut.transport), reduceri: n(sumarBrut.reduceri),
      taxa_ramburs: n(sumarBrut.taxa_ramburs), tva: n(sumarBrut.tva), bucati: n(sumarBrut.bucati),
      anulate: n(sumarBrut.anulate), rambursate: n(sumarBrut.rambursate), pierdute: n(sumarBrut.pierdute),
    },
    produse: lista(o.produse).map((r) => ({
      product_id: r.product_id ? s(r.product_id) : null,
      nume: s(r.nume), bucati: n(r.bucati), vanzari: n(r.vanzari), comenzi: n(r.comenzi),
    })),
    categorii: lista(o.categorii).map((r) => ({
      categorie: s(r.categorie), bucati: n(r.bucati), vanzari: n(r.vanzari), comenzi: n(r.comenzi),
    })),
    canale: lista(o.canale).map((r) => ({ canal: s(r.canal), comenzi: n(r.comenzi), vanzari: n(r.vanzari) })),
    statusuri: lista(o.statusuri).map((r) => ({ status: s(r.status), comenzi: n(r.comenzi), vanzari: n(r.vanzari) })),
  };
}

/** Sumarul gol, ca ecranul sa aiba ce arata pana sosesc datele. */
export const DETALIU_GOL: DetaliuVanzari = {
  sumar: SUMAR_GOL, produse: [], categorii: [], canale: [], statusuri: [],
};

/* ── Cardurile de jos ─────────────────────────────────────────────────────── */

export type CarduriSecundare = {
  clienti_noi: number;
  clienti_recurenti: number;
  bucati: number;
  anulate: number;
  comenzi_toate: number;
};

export type PerechiCarduri = { acum: CarduriSecundare; inainte: CarduriSecundare };

export function citesteCarduriSecundare(brut: unknown): PerechiCarduri {
  const o = (brut ?? {}) as Record<string, unknown>;
  const una = (x: unknown): CarduriSecundare => {
    const y = (x ?? {}) as Record<string, unknown>;
    return {
      clienti_noi: Number(y.clienti_noi ?? 0) || 0,
      clienti_recurenti: Number(y.clienti_recurenti ?? 0) || 0,
      bucati: Number(y.bucati ?? 0) || 0,
      anulate: Number(y.anulate ?? 0) || 0,
      comenzi_toate: Number(y.comenzi_toate ?? 0) || 0,
    };
  };
  return { acum: una(o.acum), inainte: una(o.inainte) };
}

/**
 * Cate din comenzile intrate au fost anulate, in procente.
 *
 * ⚠ SE IMPARTE LA TOATE COMENZILE, anulatele incluse. Impartit la cele bune,
 * un magazin cu 10 comenzi din care 5 anulate ar fi aratat „100% anulari".
 *
 * `null` cand n-a intrat nicio comanda: „0%" ar spune ca au fost comenzi si
 * n-a picat niciuna, ceea ce e altceva decat „n-a fost nicio comanda".
 */
export function rataAnulare(c: CarduriSecundare): number | null {
  return c.comenzi_toate > 0 ? (c.anulate / c.comenzi_toate) * 100 : null;
}
