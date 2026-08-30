import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeazaPlataComenzii } from "@/lib/orders/finalizare-plata";
import { logError } from "@/lib/error-logger";
import {
  placeOrder, captureOrder, getOmOrder, toMinor,
  type KlarnaConfig, type KlarnaOrderInput,
} from "@/lib/klarna";

export type KlarnaFinalizeResult =
  | { status: "paid" }
  | { status: "pending" }
  | { status: "failed"; error: string };

/**
 * Turn a Klarna authorization into a paid order: place the order, then (on
 * ACCEPTED) capture the full amount immediately and mark the Edinio order paid.
 * Shared by the browser return route and the HPP status_update callback, so it is
 * idempotent — every DB write guards with `.neq("payment_status", "paid")`, and a
 * second call re-using the same (single-use) authorization token fails harmlessly
 * at place_order.
 */
export async function finalizeKlarnaOrder(
  admin: SupabaseClient,
  cfg: KlarnaConfig,
  order: KlarnaOrderInput,
  authToken: string,
  confirmationUrl: string,
): Promise<KlarnaFinalizeResult> {
  // 1) Create the Klarna order-management order from the authorization.
  const placed = await placeOrder(cfg, authToken, order, confirmationUrl);
  if (!placed.ok || !placed.data?.order_id) {
    return { status: "failed", error: placed.error || "Nu am putut finaliza comanda la Klarna." };
  }
  const klarnaOrderId = placed.data.order_id;
  const fraud = placed.data.fraud_status;

  /*
   * ⚠ DE AICI INCOLO EXISTA O COMANDA REALA LA KLARNA.
   *
   * `placeOrder` a consumat autorizarea; `klarna_order_id` e SINGURA legatura
   * dintre ea si comanda noastra. Pe fiecare iesire de mai jos el trebuie sa ajunga
   * in baza — altfel avem o comanda Klarna orfana, eventual deja capturata, si
   * nimic local care s-o gaseasca. Klarna nu expune cautare dupa
   * `merchant_reference`, si nu exista cron de reconciliere Klarna.
   *
   * Erau CINCI iesiri si niciuna nu se uita la rezultatul scrierii. Doua nici macar
   * nu scriau: nepotrivirea de suma (mai jos) si calea fericita, unde id-ul
   * calatorea in acelasi UPDATE cu `payment_status`.
   */
  const leagaComanda = async (unde: string, campuri: Record<string, unknown> = {}) => {
    const { error, data } = await admin
      .from("orders")
      .update({ klarna_order_id: klarnaOrderId, ...campuri })
      .eq("id", order.id)
      .neq("payment_status", "paid")
      .select("id");
    /*
     * Zero randuri NU e o eroare aici: `neq("payment_status","paid")` inseamna ca
     * plata fusese deja marcata pe alta cale, iar aceea a scris si id-ul. Doar o
     * eroare propriu-zisa lasa comanda Klarna fara legatura.
     */
    if (error) {
      await logError({
        action: "klarna.legaturaPierduta",
        message: `Comanda Klarna ${klarnaOrderId} EXISTA (${unde}), dar id-ul nu s-a putut scrie pe comanda: ${error.message}`,
        details: { orderId: order.id, klarnaOrderId, unde, code: error.code },
        businessId: order.business_id,
        severity: "critical",
      });
    }
    return !error && !!data;
  };

  if (fraud === "REJECTED") {
    await leagaComanda("fraud REJECTED");
    return { status: "failed", error: "Plata a fost respinsa de Klarna." };
  }

  if (fraud === "PENDING") {
    // Klarna is reviewing the purchase — keep the order confirmed but not yet paid.
    await leagaComanda("fraud PENDING", { status: "confirmed", updated_at: new Date().toISOString() });
    return { status: "pending" };
  }

  // fraud === "ACCEPTED": verify the placed amount, then capture in full.
  const expected = toMinor(Number(order.total) || 0);
  const om = await getOmOrder(cfg, klarnaOrderId);
  if (om.ok && typeof om.data?.order_amount === "number" && om.data.order_amount !== expected) {
    console.error("[klarna] amount mismatch:", { orderId: order.id, expected, got: om.data.order_amount });
    /*
     * Ramura asta NU scria nimic — cea mai grava dintre cele cinci: comanda e deja
     * PLASATA la Klarna (autorizarea consumata), iar id-ul se pierdea complet.
     * Diferenta de suma ramane o decizie de produs, dar legatura se salveaza oricum.
     */
    await leagaComanda("nepotrivire de suma");
    await logError({
      action: "klarna.sumaNepotrivita",
      message: `Comanda Klarna ${klarnaOrderId} plasata pe ${om.data.order_amount} bani, dar comanda are ${expected}. NU s-a incasat.`,
      details: { orderId: order.id, klarnaOrderId, asteptat: expected, primit: om.data.order_amount },
      businessId: order.business_id,
      severity: "critical",
    });
    return { status: "failed", error: "Suma platii nu corespunde comenzii. Te rugam contacteaza magazinul." };
  }

  const cap = await captureOrder(cfg, klarnaOrderId, expected);
  if (!cap.ok) {
    // Authorized but not captured — store the id, log, and leave the order unpaid.
    await leagaComanda("capture esuat");
    console.error("[klarna] capture failed:", { orderId: order.id, error: cap.error });
    return { status: "failed", error: cap.error || "Plata a fost autorizata dar nu a putut fi incasata." };
  }

  // Vezi `finalizare-plata.ts`: aceleasi doua gauri ca la Revolut — `confirmed`
  // neconditionat si `paid` raportat chiar cand baza n-a scris.
  const r = await finalizeazaPlataComenzii(
    admin,
    { id: order.id, businessId: order.business_id },
    { klarna_order_id: klarnaOrderId },
  );
  if (r.fel === "esuat") {
    /*
     * A CINCEA iesire, si cea mai scumpa: `captureOrder` a REUSIT, deci banii sunt
     * incasati. `finalizeazaPlataComenzii` scrie id-ul in acelasi UPDATE cu
     * `payment_status`, deci daca acela pica se pierd amandoua — si comanda ramane
     * „neplatita" fara nicio urma care sa duca la incasarea de la Klarna.
     *
     * Marcarea platii ramane esuata (apelantul NU are voie sa-i spuna clientului
     * „platit"), dar legatura se salveaza separat: ea e tot ce trebuie ca un om sa
     * poata inchide cazul manual.
     */
    await leagaComanda("marcarea platii a esuat dupa capture");
    return { status: "failed", error: r.error };
  }
  return { status: "paid" };
}
