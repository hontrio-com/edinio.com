/*
  Datele paginii de Decontări.

  O DECONTARE e un colet cu ramburs pe care curierul l-a incasat la livrare si i l-a virat
  comerciantului (`courier_settlements`, un rand pe AWB). O VIRARE e ce vede omul pe extrasul de
  banca: toate coletele virate de un curier intr-o zi, intr-o singura suma. Tabelul nu tine
  virarile; pagina doar le numara (zile si curieri diferiti), ca totalul sa spuna in cate a venit.

  ⚠ Modul PUR: nimic de aici nu citeste si nu scrie in baza. Socoteala (cate colete are fiecare
  curier, in cate virari, cati bani) sta aici, nu in pagina, ca sa poata fi probata.
*/

import { siglaCurierului } from "@/lib/integrari/parteneri";
import type { Sigla } from "@/lib/integrari/sigle";

/** Coloanele usoare: cu ele se numara si se aduna TOT filtrul. */
export const COLOANE_USOARE = "id, courier, transfer_date, amount_collected";
/** Coloanele unui colet aratat pe pagina. */
export const COLOANE_COLET =
  "id, courier, awb_number, transfer_date, transaction_date, amount_collected, return_awb_number, recipient_name, recipient_locality, order_id";

export interface Colet {
  id: string;
  /** Cheia curierului, cum sta in baza. */
  curier: string;
  awb: string;
  /** AWB-ul de retur, cand coletul s-a intors. */
  awbRetur: string | null;
  /** Ziua virarii, „YYYY-MM-DD". */
  viratPe: string;
  /** Ziua in care curierul a incasat banii de la client. */
  incasatPe: string | null;
  suma: number;
  destinatar: string | null;
  localitate: string | null;
  /** Comanda din Edinio; `null` cand AWB-ul a fost emis din afara platformei. */
  comanda: { id: string; numar: string | null } | null;
}

/** Un curier din filtru: sigla, numele si cate colete decontate are. */
export interface CurierDecont {
  cheie: string;
  nume: string;
  sigla: Sigla | null;
  numar: number;
}

/** Totalul filtrului curent, pe toate paginile. */
export interface Rezumat {
  colete: number;
  /** In cate virari au venit: perechi diferite de zi si curier. */
  virari: number;
  suma: number;
  /** Cate colete are filtrul in baza; mai multe decat `colete` cand lista a fost taiata la `limita`. */
  inBaza: number;
  limita: number;
}

type Rand = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/**
 * ⚠ `numeric` vine ca SIR prin PostgREST la unele configurari, iar `Number(null)` e ZERO: o suma
 * lipsa ar deveni o suma adevarata. Ce nu e numar ramane zero doar aici, la adunat.
 */
export function sumaDinRand(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Numele si sigla unui curier dupa cheia din baza. Un curier necunoscut isi arata cheia. */
export function curierDecont(cheie: string): { nume: string; sigla: Sigla | null } {
  const sigla = siglaCurierului(cheie);
  return sigla ? { nume: sigla.nume, sigla } : { nume: cheie, sigla: null };
}

/** Aduce un rand din `courier_settlements` la forma pe care o deseneaza pagina. */
export function coletDinRand(r: Rand, numereComenzi: Record<string, string>): Colet {
  const idComanda = text(r.order_id);
  return {
    id: String(r.id),
    curier: String(r.courier ?? ""),
    awb: String(r.awb_number ?? ""),
    awbRetur: text(r.return_awb_number),
    viratPe: String(r.transfer_date ?? ""),
    incasatPe: text(r.transaction_date),
    suma: sumaDinRand(r.amount_collected),
    destinatar: text(r.recipient_name),
    localitate: text(r.recipient_locality),
    comanda: idComanda ? { id: idComanda, numar: numereComenzi[idComanda] ?? null } : null,
  };
}

/* ── Socoteala filtrului ──────────────────────────────────────────────────── */

/** Un colet in coloanele usoare: atat cat trebuie ca sa fie numarat si adunat. */
export interface ColetUsor {
  id: string;
  curier: string;
  /** Ziua virarii, „YYYY-MM-DD". */
  zi: string;
  suma: number;
}

/** Aduce un rand citit cu `COLOANE_USOARE` la forma de socotit. */
export function coletUsor(r: Rand): ColetUsor {
  return { id: String(r.id), curier: String(r.courier ?? ""), zi: String(r.transfer_date ?? ""), suma: sumaDinRand(r.amount_collected) };
}

export interface Socoteala {
  /** Filele: curierii care au colete in filtru (cautare si perioada), cei cu mai multe intai. */
  curieri: CurierDecont[];
  /** Coletele curierului ales (toate, daca nu e ales niciunul), in ordinea primita. */
  aleCurierului: ColetUsor[];
  /** In cate virari au venit coletele curierului ales. */
  virari: number;
  /** Cat insumeaza coletele curierului ales. */
  suma: number;
}

/**
 * Din coletele filtrului (cautare si perioada, FARA curier) scoate filele curierilor si totalul
 * curierului ales.
 *
 * ⚠ Filele se numara FARA filtrul de curier: altfel, cu un curier ales, ceilalti ar arata zero
 * si n-ar mai fi de unde alege altul. Totalul se socoteste CU el: e totalul listei de dedesubt.
 *
 * ⚠ Banii se aduna in BANI intregi. Adunate ca fractii, cateva mii de sume cu doua zecimale
 * strang o eroare de rotunjire care, la o suma comparata cu extrasul de banca, se vede.
 */
export function socotesteDecontarile(colete: readonly ColetUsor[], curierAles: string): Socoteala {
  const peCurier = new Map<string, number>();
  for (const c of colete) peCurier.set(c.curier, (peCurier.get(c.curier) ?? 0) + 1);
  /* Curierul ales ramane pe file si cand cautarea nu-i mai lasa niciun colet: altfel n-ar mai avea de unde fi scos. */
  if (curierAles !== "all" && !peCurier.has(curierAles)) peCurier.set(curierAles, 0);

  const curieri: CurierDecont[] = [...peCurier.entries()]
    .map(([cheie, numar]) => ({ cheie, numar, ...curierDecont(cheie) }))
    .sort((a, b) => b.numar - a.numar || a.nume.localeCompare(b.nume, "ro"));

  const aleCurierului = curierAles === "all" ? [...colete] : colete.filter((c) => c.curier === curierAles);
  /* O virare e ce apare pe extrasul de banca: toate coletele unui curier dintr-o zi. */
  const virari = new Set(aleCurierului.map((c) => `${c.zi}|${c.curier}`)).size;
  const bani = aleCurierului.reduce((s, c) => s + Math.round(c.suma * 100), 0);

  return { curieri, aleCurierului, virari, suma: bani / 100 };
}
