// Trendyol webhook helpers: subscription event set, request verification, and the
// shipment-package -> Edinio order status mapping.
//
// Trendyol authenticates its calls TO us with the credentials WE set when creating
// the webhook (there is no signature). We use the API_KEY scheme: a random secret
// we generate is sent back as the `x-api-key` header, which we compare timing-safe.

import { timingSafeEqual } from "crypto";

export const TRENDYOL_WEBHOOK_EVENTS = [
  "CREATED", "PICKING", "INVOICED", "SHIPPED", "CANCELLED", "DELIVERED",
  "UNDELIVERED", "RETURNED", "UNSUPPLIED", "AWAITING", "UNPACKED", "AT_COLLECTION_POINT", "VERIFIED",
];

export function verifyTrendyolWebhook(secret: string | undefined | null, headerApiKey: string | null): boolean {
  if (!secret || !headerApiKey) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(headerApiKey);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

// Map a Trendyol shipment-package status onto an Edinio order status.
export function edinioStatusForTrendyol(status: string | undefined): string {
  switch ((status || "").toLowerCase()) {
    case "shipped":
    case "atcollectionpoint":
      return "shipped";
    case "delivered":
      return "delivered";
    case "cancelled":
    case "unsupplied":
    /*
     * `UnPacked` = pachetul a fost SPART, iar acesta e cel vechi.
     *
     * Cand Trendyol imparte o comanda in mai multe colete, pachetul initial
     * trece pe `UnPacked` si se creeaza altele noi, pentru aceleasi linii.
     * Netratat ca terminal, pachetul mort ramanea „activ" si liniile lui
     * consumau stoc a doua oara — aceeasi comanda scadea marfa de doua ori, iar
     * produsul aparea epuizat pe toate canalele fara sa se fi vandut nimic in
     * plus. Prin definitia lor, pachetul vechi nu mai exista: e o anulare.
     */
    case "unpacked":
      return "cancelled";
    case "returned":
      return "refunded";
    case "picking":
    case "invoiced":
      return "processing";
    default:
      return "pending";
  }
}
