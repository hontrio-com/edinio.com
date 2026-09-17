// GA4 Measurement Protocol — server-side purchase/refund events. Complements the
// client-side gtag events: captures conversions when the browser tag never fires
// (the buyer paid by card and didn't come back to the confirmation page), and
// enables refund tracking (refunds happen in the dashboard, never in the
// customer's browser). GA4 keeps one purchase per transaction_id, so a server
// event alongside the gtag one never double-counts.
//
// Documentatie: developers.google.com/analytics/devguides/collection/protocol/ga4
// (citita cap la cap pe 17.09.2026: trimitere, referinta, validare).

import type { StareConsimtamant } from "./comanda-ga4";

/**
 * ⚠ CAPATUL DIN UE. Documentatia: „If you want your data to be collected in the EU, use
 * https://region1.google-analytics.com/mp/collect". Toti comerciantii si cumparatorii platformei sunt
 * in Romania; raspunsul si formatul sunt aceleasi.
 */
export const MP_CAPAT = "https://region1.google-analytics.com/mp/collect";

const MONEDA = "RON";

/**
 * „Parameter values including item parameter values must be 100 characters or fewer for a standard
 * Google Analytics property." Cu validarea implicita (RELAXED), un parametru mai lung e IGNORAT, nu
 * taiat: un nume de produs de 101 caractere ar fi disparut din raport fara nicio eroare.
 */
const LUNGIME_MAXIMA = 100;

export interface MpItem { item_id?: string; item_name: string; price: number; quantity: number }

export interface MpEveniment {
  transactionId: string;
  value: number;
  shipping?: number;
  tax?: number;
  items: MpItem[];
  clientId?: string;
  sessionId?: string;
  consent?: { ad_user_data: StareConsimtamant; ad_personalization: StareConsimtamant };
}

const taiat = (s: string | undefined): string | undefined =>
  s === undefined ? undefined : String(s).slice(0, LUNGIME_MAXIMA);

/**
 * Un `client_id` valid sintactic (`<aleator>.<secunde>`) pentru cand cel adevarat lipseste.
 *
 * ⚠ Se foloseste NUMAI dupa ce `verdictTrimitere` a spus ca omul a acceptat analiza (sau ca magazinul
 * n-are banner): de pilda un ad-blocker care a oprit tag-ul. Nu mai e o cale de a raporta pe cine a
 * refuzat. La rambursare ajunge si el: acolo conteaza doar `transaction_id`.
 */
function clientIdDeRezerva(): string {
  return `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
}

/** Corpul cererii, fara retea. Separat ca sa poata fi probat exact asa cum pleaca. */
export function corpGa4(nume: "purchase" | "refund", e: MpEveniment): Record<string, unknown> {
  const params: Record<string, unknown> = {
    currency: MONEDA,
    transaction_id: taiat(e.transactionId),
    value: e.value,
    items: e.items.map((i) => ({
      ...(i.item_id ? { item_id: taiat(i.item_id) } : {}),
      item_name: taiat(i.item_name),
      price: i.price,
      quantity: i.quantity,
    })),
  };
  if (e.shipping !== undefined) params.shipping = e.shipping;
  if (e.tax !== undefined) params.tax = e.tax;
  /*
   * ⚠ Sesiunea doar la ACHIZITIE. Documentatia o cere impreuna cu `engagement_time_msec` ca evenimentul
   * sa se lege de sesiune; o rambursare vine zile mai tarziu, iar sesiunea se leaga doar in 24 de ore.
   */
  if (nume === "purchase" && e.sessionId) {
    params.session_id = e.sessionId;
    params.engagement_time_msec = 1;
  }

  const corp: Record<string, unknown> = {
    client_id: e.clientId || clientIdDeRezerva(),
    events: [{ name: nume, params }],
  };
  if (e.consent) corp.consent = e.consent;
  return corp;
}

export interface RezultatMp { ok: boolean; status: number }

/**
 * Trimite corpul. NU arunca.
 *
 * ⚠ Documentatia: raspunsul e 2xx daca cererea a fost PRIMITA, chiar daca continutul e gresit si chiar
 * daca `api_secret` e gresit. Un non-2xx inseamna o cerere stricata: „Don't retry the same request.”
 * Deci se intoarce ca atare, iar apelantul il scrie in jurnal. Inainte raspunsul nu se citea deloc.
 */
export async function trimiteGa4(
  cfg: { measurementId: string; apiSecret: string },
  corp: Record<string, unknown>,
): Promise<RezultatMp> {
  try {
    const url = `${MP_CAPAT}?measurement_id=${encodeURIComponent(cfg.measurementId)}&api_secret=${encodeURIComponent(cfg.apiSecret)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corp),
      cache: "no-store",
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
