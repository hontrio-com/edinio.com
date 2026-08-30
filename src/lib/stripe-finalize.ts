import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeazaPlataComenzii } from "@/lib/orders/finalizare-plata";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { poateAvansaLaConfirmat } from "@/lib/order-progress";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import { factureazaDupaPlata } from "@/lib/invoice-on-payment";
import { logError } from "@/lib/error-logger";

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

  /*
   * ═══ NEPOTRIVIREA DE SUMA: SE MARCHEAZA PLATIT, DAR NU IN TACERE ═══
   *
   * Marcarea NU se opreste, si asta ramane decizia corecta: sesiunea e creata de
   * noi, id-ul ei e salvat pe comanda si e citita de pe contul conectat al
   * comerciantului, deci clientul n-are cum s-o falsifice — iar banii SUNT deja
   * capturati la Stripe. Un refuz aici ar lasa comanda `unpaid` cu banii incasati,
   * adica exact incidentul din 29.07 pentru care s-au scris `/api/stripe/return`
   * si cronul de reconciliere. Mai rau: cronul polleaza `stripe_session_id`-ul
   * CURENT, iar a doua lui trecere filtreaza `.is("stripe_session_id", null)` —
   * o comanda cu sesiune noua n-ar mai intra in niciuna, deci plata ar deveni
   * definitiv nerecuperabila automat.
   *
   * Ce era gresit: `console.warn` nu ajunge nicaieri. Diferenta e o problema de
   * BANI si trebuie sa apara in `/admin/logs`, cu `business_id`, ca sa poata fi
   * reconciliata de un om. Sursa ei reala e editarea comenzii dupa initierea
   * platii — inchisa acum si la sursa, in `order-checkout` si in `updateOrder`.
   *
   * Doua precautii, altfel alarma devine zgomot si nimeni n-o mai citeste:
   *   * `no_payment_required` are `amount_total` 0 prin definitie (linia de mai
   *     sus il accepta explicit), deci se sare peste verificare;
   *   * toleranta de UN BAN, ca la Netopia: `Math.round(total * 100)` si
   *     rotunjirea Stripe pot diferi cu un ban pe preturi cu TVA inclus.
   */
  const asteptat = Math.round((Number(order.total) || 0) * 100);
  if (
    session.payment_status !== "no_payment_required" &&
    typeof session.amount_total === "number" &&
    Math.abs(session.amount_total - asteptat) > 1
  ) {
    await logError({
      action: "stripe.sumaNepotrivita",
      message: `Sesiunea Stripe a incasat ${session.amount_total} bani, comanda are ${asteptat}. Comanda a fost marcata platita; diferenta cere verificare.`,
      details: { orderId: order.id, sessionId, asteptat, incasat: session.amount_total },
      businessId: order.businessId,
      severity: "critical",
    });
  }

  // Aceeasi regula ca la toate celelalte procesatoare: vezi `finalizare-plata.ts`.
  // Purtarea de aici a fost modelul — verificarea `error`, `.select()` pentru
  // idempotenta si avansarea doar din `pending` — doar ca acum e intr-un loc.
  const r = await finalizeazaPlataComenzii(admin, { id: order.id, businessId: order.businessId });
  if (r.fel === "esuat") return { status: "failed", error: r.error };
  return { status: "paid" };
}

/** Contul Stripe conectat al magazinului, daca plata cu cardul e activa. */
export function stripeAccountId(config: unknown): string | null {
  const cfg = config as { account_id?: string; enabled?: boolean } | null;
  return cfg?.account_id ?? null;
}
