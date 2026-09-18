/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE AFLA FURNIZORII DE EMAIL DESPRE SOARTA UNEI COMENZI
  ═══════════════════════════════════════════════════════════════════════════════

  Un singur loc prin care trec toate caile care schimba plata sau statusul unei comenzi
  proprii: panoul (`updateOrder`), lotul (`bulkUpdateOrderStatus`), finalizarea platii
  (toti cinci procesatorii trec prin `dupaPlata`), rambursarile confirmate de procesator
  (`banii-s-au-intors.ts`, Netopia).

  ⚠ PANA PE 18.09.2026, doua goluri:
    - anularea si rambursarea NU ajungeau la niciunul dintre cei trei. Masurat: ~18% din
      comenzile proprii din ultimele 90 de zile s-au terminat anulate sau rambursate, iar
      venitul lor ramanea atribuit emailului in Mailchimp, Brevo si Klaviyo;
    - Klaviyo nu afla deloc de plata, desi raporta „Placed Order” la creare si pentru
      cardul inca neplatit.

  ⚠ POARTA DE MARKETPLACE NU STA AICI, ci in fiecare functie a furnizorului, acolo unde se
  citeste comanda (vezi `clientDeMarketplace`). Aici se hotaraste doar CE s-a intamplat.

  Toate trei sunt idempotente pe id-ul comenzii (Mailchimp PATCH, Brevo upsert, Klaviyo
  `unique_id`), deci doua cai care anunta aceeasi rambursare nu strica nimic.
*/

import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { maybeMarkMailchimpOrderPaid, maybeMarkMailchimpOrderReturned } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid, maybeMarkBrevoOrderReturned } from "@/lib/brevo-sync";
import { maybeMarkKlaviyoOrderPaid, maybeMarkKlaviyoOrderReturned } from "@/lib/klaviyo-sync";

export type FelIntoarcere = "anulata" | "rambursata";

/**
 * Din tranzitia unei comenzi: s-a intors ceva ce trebuie scos din venitul atribuit emailului?
 *
 * Anularea castiga cand vin amandoua deodata (comanda anulata SI rambursata in aceeasi
 * salvare): e starea finala a comenzii, iar la Mailchimp `cancelled_at_foreign` o si inchide.
 */
export function intoarcereDinTranzitie(t: {
  statusNou?: string | null;
  statusSchimbat: boolean;
  plataNoua?: string | null;
  plataSchimbata: boolean;
}): FelIntoarcere | null {
  if (t.statusSchimbat && t.statusNou === "cancelled") return "anulata";
  if (t.statusSchimbat && t.statusNou === "refunded") return "rambursata";
  if (t.plataSchimbata && t.plataNoua === "refunded") return "rambursata";
  return null;
}

/** Plata s-a confirmat: Mailchimp si Brevo trec comanda pe „paid”, Klaviyo primeste „Placed Order”. */
export function anuntaEmailPlata(orderId: string, businessId?: string): void {
  dupaRaspuns(
    () => Promise.all([
      maybeMarkMailchimpOrderPaid(orderId),
      maybeMarkBrevoOrderPaid(orderId),
      maybeMarkKlaviyoOrderPaid(orderId),
    ]),
    "email.plata",
    businessId,
  );
}

/** Comanda s-a anulat sau s-a rambursat: toti trei o scot din venit. */
export function anuntaEmailIntoarcere(orderId: string, fel: FelIntoarcere, businessId?: string): void {
  dupaRaspuns(
    () => Promise.all([
      maybeMarkMailchimpOrderReturned(orderId, fel),
      maybeMarkBrevoOrderReturned(orderId, fel),
      maybeMarkKlaviyoOrderReturned(orderId, fel),
    ]),
    "email.intoarcere",
    businessId,
  );
}
