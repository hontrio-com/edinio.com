import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { poateAvansaLaConfirmat } from "@/lib/order-progress";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import { factureazaDupaPlata } from "@/lib/invoice-on-payment";

export type StripeFinalizeResult =
  | { status: "paid" }
  | { status: "pending" }
  | { status: "failed"; error: string };

/**
 * Confirma o sesiune Stripe Checkout si marcheaza comanda platita.
 *
 * Folosita de TOATE cele trei cai: intoarcerea clientului din checkout
 * (`/api/stripe/return`), webhook-ul Connect si cronul de reconciliere. Pana
 * acum exista o singura cale — webhook-ul — iar cand acesta nu ajungea (endpoint
 * neconfigurat pe conturi conectate, semnatura gresita, incident de retea),
 * comanda ramanea „Neplatit" desi banii intrasera la comerciant. Vezi incidentul
 * din 29.07 (Insula Bucuriei, comanda #0010, 504,01 lei incasati la Stripe).
 *
 * Idempotenta: scrierea are `.neq("payment_status", "paid")`, deci a doua cale
 * care ajunge aici nu mai rescrie nimic si nu mai retrimite sincronizarile.
 */
export async function finalizeStripeOrder(
  admin: SupabaseClient,
  accountId: string,
  order: { id: string; businessId: string; total: number; status?: string | null },
  sessionId: string,
): Promise<StripeFinalizeResult> {
  let session: Stripe.Checkout.Session;
  try {
    // Sesiunea traieste pe contul conectat al comerciantului (plata e directa
    // acolo), deci citirea trebuie facuta cu `stripeAccount`. Al doilea argument
    // ramane gol: tipurile SDK-ului separat parametrii de optiunile cererii.
    session = await getStripe().checkout.sessions.retrieve(sessionId, {}, { stripeAccount: accountId });
  } catch (e) {
    console.error("[stripe] session retrieve failed:", { orderId: order.id, sessionId, error: e });
    return { status: "failed", error: "Nu am putut verifica plata la Stripe." };
  }

  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    // `open` = clientul inca e in checkout sau a inchis pagina fara sa plateasca;
    // `expired` = sesiunea a expirat neplatita.
    if (session.status === "open") return { status: "pending" };
    return { status: "failed", error: "Plata nu a fost finalizata la Stripe." };
  }

  // Suma incasata se compara cu totalul comenzii, dar o nepotrivire NU opreste
  // marcarea. Sesiunea e creata de noi, id-ul ei e salvat pe comanda si e citita
  // de pe contul conectat al comerciantului — deci nu exista cale prin care
  // clientul sa o falsifice. Singura sursa reala de diferenta e editarea
  // comenzii dupa initierea platii, iar acolo raspunsul corect e „banii au
  // intrat, semnaleaza diferenta", nu „lasa comanda neplatita".
  const asteptat = Math.round((Number(order.total) || 0) * 100);
  if (typeof session.amount_total === "number" && session.amount_total !== asteptat) {
    console.warn("[stripe] amount mismatch:", { orderId: order.id, asteptat, incasat: session.amount_total });
  }

  const patch: Record<string, unknown> = {
    payment_status: "paid",
    updated_at: new Date().toISOString(),
  };
  if (poateAvansaLaConfirmat(order.status)) patch.status = "confirmed";

  // `select` ne spune daca linia CHIAR s-a schimbat acum. Fara el, o re-livrare
  // de webhook ar retrimite sincronizarile si ar reincerca factura pentru o
  // comanda deja platita.
  const { data: schimbate, error } = await admin
    .from("orders")
    .update(patch)
    .eq("id", order.id)
    .neq("payment_status", "paid")
    .select("id");

  if (error) {
    console.error("[stripe] mark paid failed:", { orderId: order.id, error });
    return { status: "failed", error: "Plata a reusit dar nu am putut actualiza comanda." };
  }
  if (!schimbate || schimbate.length === 0) return { status: "paid" };

  void maybeMarkMailchimpOrderPaid(order.id);
  void maybeMarkBrevoOrderPaid(order.id);
  factureazaDupaPlata(order.businessId, order.id, (patch.status as string) ?? order.status ?? "", "paid");
  return { status: "paid" };
}

/** Contul Stripe conectat al magazinului, daca plata cu cardul e activa. */
export function stripeAccountId(config: unknown): string | null {
  const cfg = config as { account_id?: string; enabled?: boolean } | null;
  return cfg?.account_id ?? null;
}
