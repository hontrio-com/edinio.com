import { curierulDupaId, type CurierEasySales } from "./curieri";
import { idText, intreg, suma } from "./numere";
import type { ComandaEasySales } from "./tipuri";

/**
 * Starea unei comenzi la easySales, adusa in Edinio (planul, §5.2).
 *
 * ═══ NUMAI INAINTE, NICIODATA INAPOI ═══
 *
 * Recitirea aplica o stare ABSOLUTA, dar o comanda din Edinio nu coboara: o livrata nu redevine
 * expediata pentru ca o lista veche a ajuns dupa una noua, iar una anulata nu reinvie. Ceasul
 * `es_updated_at` apara banda de lista; aici apara rangul.
 *
 * ═══ CE NU SE TRADUCE IN STARE ═══
 *
 *   Return (6) sau livrarea 5      steag „retur" (D19). `refunded` ar stinge plasa „marfa a plecat
 *                                  fara bani" si ar scoate comanda din venituri;
 *   Canceled (0) CU AWB viu         steag „probabil retur", fara tranzitie;
 *   Completed (3) FARA niciun AWB   `processing` si steagul „finalizata fara AWB", niciodata
 *                                  `shipped`: n-a plecat niciun colet;
 *   `cancel_request`, `errors[]`,   steaguri, cu notificare; banii comenzii nu se rescriu.
 *   `total_value` diferit
 *
 * ⚠ Etichetele vin in forme diferite („0 -> Canceled", „Cancelled", „Canceled") [A]. Se citeste
 * intai codul numeric; textul e rezerva. O valoare necunoscuta nu schimba nimic.
 *
 * Functia e PURA si intra in `valori-permise.test.ts`: orice tinta trebuie sa incapa in
 * `orders_status_check`.
 */

export type StareEdinio = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";

const RANG: Readonly<Record<string, number>> = { pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4 };
const TERMINALE = new Set(["cancelled", "refunded"]);

const TEXT_STARE: Readonly<Record<string, number>> = {
  canceled: 0, cancelled: 0, new: 1, received: 2, completed: 3, processing: 4, incomplete: 5, return: 6, returned: 6,
};
const TEXT_LIVRARE: Readonly<Record<string, number>> = {
  ready: 1, "on route": 2, onroute: 2, delayed: 3, delivered: 4, return: 5, returned: 5, unknown: 6, canceled: 7, cancelled: 7,
};

/** Codul starii comenzii (0-6), sau `null`. */
export function codulStarii(v: unknown): number | null {
  const n = intreg(v);
  if (n !== null) return n >= 0 && n <= 6 ? n : null;
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  const cu = /^(\d+)\s*->/.exec(t);
  if (cu) {
    const k = Number(cu[1]);
    return k >= 0 && k <= 6 ? k : null;
  }
  return Object.hasOwn(TEXT_STARE, t) ? TEXT_STARE[t] : null;
}

/** Codul livrarii (1-7), din `{value}` sau din text, sau `null`. */
export function codulLivrarii(v: unknown): number | null {
  const obiect = v && typeof v === "object" && !Array.isArray(v) ? (v as { value?: unknown; description?: unknown }) : null;
  const brut = obiect ? obiect.value ?? obiect.description : v;
  const n = intreg(brut);
  if (n !== null) return n >= 1 && n <= 7 ? n : null;
  if (typeof brut !== "string") return null;
  const t = brut.trim().toLowerCase();
  return Object.hasOwn(TEXT_LIVRARE, t) ? TEXT_LIVRARE[t] : null;
}

/** Un AWB, citit tolerant din `shipments[]`. */
export interface AwbEasySales {
  numere: string[];
  curier: CurierEasySales | null;
  curierId: string | null;
  curierNume: string | null;
  livrare: number | null;
  url: string | null;
  paginaUrmarire: string | null;
}

export function awburile(c: Pick<ComandaEasySales, "shipments">): AwbEasySales[] {
  const out: AwbEasySales[] = [];
  for (const s of Array.isArray(c.shipments) ? c.shipments : []) {
    if (!s || typeof s !== "object") continue;
    const brute = Array.isArray(s.awb_id) ? s.awb_id : [s.awb_id];
    const numere = brute.map((x) => idText(x)).filter((x): x is string => x !== null);
    if (numere.length === 0) continue;
    out.push({
      numere,
      curier: curierulDupaId(s.courier?.id),
      curierId: idText(s.courier?.id),
      curierNume: typeof s.courier?.name === "string" ? s.courier.name : null,
      livrare: codulLivrarii(s.delivery_status),
      url: typeof s.awb_url === "string" ? s.awb_url : null,
      paginaUrmarire: typeof s.awb_tracking_page === "string" ? s.awb_tracking_page : null,
    });
  }
  return out;
}

/** AWB-ul viu: cel mai nou (ultimul din lista) care nu e anulat (livrarea 7). */
export function awbViu(awburi: AwbEasySales[]): AwbEasySales | null {
  for (let i = awburi.length - 1; i >= 0; i--) if (awburi[i].livrare !== 7) return awburi[i];
  return null;
}

export type SteagEasySales =
  | "fara_awb_finalizata" | "probabil_retur" | "retur" | "cerere_anulare" | "erori" | "total_diferit" | "stare_necunoscuta";

export interface Decizie {
  /** Starea spre care se trece in Edinio, sau `null` cand nu se schimba nimic. */
  tinta: StareEdinio | null;
  /** Explicit, ca la eMAG, Trendyol si About You: anularea elibereaza stocul, restul nu. */
  elibereazaStoc: boolean;
  steaguri: SteagEasySales[];
  cod: number | null;
  awbViu: AwbEasySales | null;
}

function areValoare(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return v !== false && v !== 0;
}

/**
 * Ce se face in Edinio cu o comanda citita de la ei.
 *
 * @param stareEdinio `orders.status` de acum.
 * @param totalEdinio `orders.total`, pentru steagul „modificata in easySales".
 */
export function decide(c: ComandaEasySales, stareEdinio: string, totalEdinio: number): Decizie {
  const steaguri: SteagEasySales[] = [];
  const cod = codulStarii(c.status);
  const awburi = awburile(c);
  const viu = awbViu(awburi);

  if (areValoare(c.cancel_request)) steaguri.push("cerere_anulare");
  if (areValoare(c.errors)) steaguri.push("erori");
  const totalLor = suma(c.total_value);
  if (totalLor !== null && Math.abs(totalLor - totalEdinio) > 0.01) steaguri.push("total_diferit");

  const fara = (): Decizie => ({ tinta: null, elibereazaStoc: false, steaguri, cod, awbViu: viu });
  if (cod === null) {
    steaguri.push("stare_necunoscuta");
    return fara();
  }
  /* O comanda anulata sau rambursata in Edinio nu reinvie de la ei. */
  if (TERMINALE.has(stareEdinio)) return fara();
  const rangAcum = RANG[stareEdinio] ?? 0;

  if (cod === 0) {
    if (viu) {
      steaguri.push("probabil_retur");
      return fara();
    }
    /* Anularea la ei, fara colet: numai o comanda inca nepredata. */
    if (rangAcum <= RANG.processing) return { tinta: "cancelled", elibereazaStoc: true, steaguri, cod, awbViu: viu };
    steaguri.push("probabil_retur");
    return fara();
  }
  if (cod === 6 || viu?.livrare === 5) {
    steaguri.push("retur");
    return fara();
  }

  let tinta: StareEdinio | null = null;
  if (viu?.livrare === 4) tinta = "delivered";
  else if (viu && (viu.livrare === 2 || viu.livrare === 3)) tinta = "shipped";
  else if (cod === 3 && viu) tinta = "shipped";
  else if (cod === 3) {
    steaguri.push("fara_awb_finalizata");
    tinta = "processing";
  } else if (viu) tinta = "processing";
  else if (cod === 4) tinta = "processing";

  if (tinta && (RANG[tinta] ?? -1) <= rangAcum) tinta = null;
  return { tinta, elibereazaStoc: false, steaguri, cod, awbViu: viu };
}
