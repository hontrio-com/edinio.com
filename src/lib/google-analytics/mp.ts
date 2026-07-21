// GA4 Measurement Protocol — server-side purchase/refund events. Complements the
// client-side gtag events: captures conversions when the browser tag is blocked,
// and enables refund tracking (refunds happen in the dashboard, never in the
// customer's browser). GA4 dedupes purchases by transaction_id, so a server event
// alongside the gtag one never double-counts; using the visitor's real _ga client
// id (captured at checkout) keeps attribution consistent between the two.

const MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const CURRENCY = "RON";

export interface MpItem { item_id?: string; item_name: string; price: number; quantity: number; }
interface MpConfig { measurementId: string; apiSecret: string; }
interface MpOrder { transactionId: string; value: number; clientId?: string; items: MpItem[]; }

// A syntactically valid GA client id ("<rand>.<epochSeconds>") for when the real
// one wasn't captured. Purchase attribution suffers, but transaction_id dedup and
// revenue still work; refunds only need the transaction_id to offset revenue.
function fallbackClientId(): string {
  return `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
}

function mapItems(items: MpItem[]) {
  return items.map((i) => ({ item_id: i.item_id, item_name: i.item_name, price: i.price, quantity: i.quantity }));
}

async function send(cfg: MpConfig, clientId: string, name: string, params: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${MP_ENDPOINT}?measurement_id=${encodeURIComponent(cfg.measurementId)}&api_secret=${encodeURIComponent(cfg.apiSecret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId || fallbackClientId(), events: [{ name, params }] }),
      cache: "no-store",
    });
  } catch {
    // best-effort; must never break the order/refund flow
  }
}

export function sendGa4Purchase(cfg: MpConfig, o: MpOrder): Promise<void> {
  return send(cfg, o.clientId || fallbackClientId(), "purchase", {
    currency: CURRENCY, value: o.value, transaction_id: o.transactionId, items: mapItems(o.items),
  });
}

export function sendGa4Refund(cfg: MpConfig, o: MpOrder): Promise<void> {
  return send(cfg, o.clientId || fallbackClientId(), "refund", {
    currency: CURRENCY, value: o.value, transaction_id: o.transactionId, items: mapItems(o.items),
  });
}
