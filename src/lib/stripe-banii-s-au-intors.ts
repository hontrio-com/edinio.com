import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/types/database.types";
import { getStripe } from "@/lib/stripe";
import type { ComandaAtinsa } from "@/lib/plati/banii-s-au-intors";

type Admin = SupabaseClient<Database>;

/**
 * De la o plata a lor, la o comanda de-a noastra.
 *
 * ⚠ DOUA DRUMURI, SI AL DOILEA NU E DE PRISOS. `order-checkout` pune `{orderId, businessId}` pe
 * PaymentIntent dinadins (sesiunile de checkout NU se pot cauta dupa metadata). Dar comenzile create
 * INAINTE de acea adaugare n-au metadata, iar ele sunt tocmai cele vechi, adica exact cele pentru
 * care o rambursare tarzie e mai probabila. Pentru ele se cauta sesiunea dupa PaymentIntent si se
 * potriveste `stripe_session_id`, coloana pe care o avem de la inceput.
 */
export async function comandaPlatiiStripe(
  admin: Admin,
  paymentIntentId: string,
  accountId: string,
): Promise<ComandaAtinsa | null> {
  const CAMPURI = "id, business_id, order_number, status, payment_status, total";
  const stripe = getStripe();

  let pi: Stripe.PaymentIntent | null = null;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: accountId });
  } catch (e) {
    console.error("[stripe] PaymentIntent necitibil:", { paymentIntentId, e });
  }

  const orderId = pi?.metadata?.orderId;
  const businessId = pi?.metadata?.businessId;
  if (orderId && businessId) {
    const { data } = await admin
      .from("orders").select(CAMPURI).eq("id", orderId).eq("business_id", businessId).maybeSingle();
    if (data) return data as unknown as ComandaAtinsa;
  }

  try {
    const sesiuni = await stripe.checkout.sessions.list(
      { payment_intent: paymentIntentId, limit: 3 },
      { stripeAccount: accountId },
    );
    for (const s of sesiuni.data) {
      const { data } = await admin
        .from("orders").select(CAMPURI).eq("stripe_session_id", s.id).maybeSingle();
      if (data) return data as unknown as ComandaAtinsa;
    }
  } catch (e) {
    console.error("[stripe] sesiunile PaymentIntent-ului nu s-au putut citi:", { paymentIntentId, e });
  }

  return null;
}
