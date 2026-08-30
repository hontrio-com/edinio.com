import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { stripeAccountId } from "@/lib/stripe-finalize";
import { logError } from "@/lib/error-logger";

/**
 * Inchide sesiunea Stripe deschisa a unei comenzi, dupa ce suma ei s-a schimbat.
 *
 * ═══ DE CE ═══
 *
 * O sesiune Checkout ramane platibila 24 de ore. Cand comerciantul editeaza
 * comanda dupa ce clientul a plecat la plata, sesiunea VECHE inca incaseaza
 * vechiul total:
 *
 *     comanda 100 lei -> sesiune Stripe 100 lei
 *     comerciantul editeaza -> comanda 150 lei
 *     clientul plateste sesiunea veche -> 100 lei
 *     webhook -> comanda de 150 lei devine PLATITA
 *
 * `finalizeStripeOrder` semnaleaza acum diferenta in `/admin/logs`, dar semnalul
 * vine dupa ce banii au intrat. Singura inchidere adevarata e sa nu mai existe ce
 * plati pe suma veche.
 *
 * ═══ DE CE NU SE BLOCHEAZA EDITAREA ═══
 *
 * `stripe_session_id` nu se sterge niciodata singur — nici la expirarea sesiunii,
 * nici la abandon. O garda „nu edita cat exista sesiune" ar face needitabila pe
 * veci orice comanda pentru care s-a apasat vreodata „plateste cu cardul".
 *
 * ═══ ORDINEA ═══
 *
 * Se cheama DUPA ce noul total e scris. Invers, o editare picata ar lasa clientul
 * fara sesiune valida pentru o comanda nemodificata.
 */
export async function inchideSesiuneaStripeVeche(
  admin: SupabaseClient,
  p: { businessId: string; orderId: string; sessionId: string },
): Promise<void> {
  const { data: settings, error: eCfg } = await admin
    .from("store_settings")
    .select("stripe_config")
    .eq("business_id", p.businessId)
    .maybeSingle();
  /*
   * O citire picata NU inseamna „magazinul n-are Stripe". Iesita tacut, ar lasa
   * sesiunea veche platibila pe suma veche fara nicio urma — exact starea pe care
   * functia asta exista ca s-o inchida.
   */
  if (eCfg) {
    await logError({
      action: "stripe.sesiuneNeinchisa",
      message: `Configul Stripe nu s-a putut citi, deci sesiunea veche a ramas deschisa: ${eCfg.message}`,
      details: { orderId: p.orderId, sessionId: p.sessionId },
      businessId: p.businessId,
      severity: "critical",
    });
    return;
  }
  const accountId = stripeAccountId(settings?.stripe_config);
  if (!accountId) return;

  try {
    // Al doilea argument ramane gol: tipurile SDK-ului separa parametrii de
    // optiunile cererii, iar sesiunea traieste pe contul conectat.
    const sesiune = await getStripe().checkout.sessions.retrieve(p.sessionId, {}, { stripeAccount: accountId });
    /*
     * Numai o sesiune INCA DESCHISA se inchide. Daca intre timp a fost platita,
     * `status` e `complete` — atunci nu se atinge nimic, si mai ales NU se sterge
     * `stripe_session_id`: el e legatura prin care reconcilierea gaseste plata.
     */
    if (sesiune.status !== "open") return;
    await getStripe().checkout.sessions.expire(p.sessionId, {}, { stripeAccount: accountId });
  } catch (e) {
    /*
     * „Sesiunea nu exista" nu e un incident: expira singura dupa 24 de ore, si
     * atunci nu mai e nimic de inchis. Alarma critica pe cazul asta ar suna la
     * fiecare editare de comanda mai veche de o zi si ar transforma canalul de
     * bani in zgomot.
     */
    const err = e as { code?: string; statusCode?: number };
    if (err?.code === "resource_missing" || err?.statusCode === 404) return;
    await logError({
      action: "stripe.sesiuneNeinchisa",
      message: `Comanda a fost editata, dar sesiunea Stripe veche nu s-a putut inchide: ${e instanceof Error ? e.message : String(e)}`,
      details: { orderId: p.orderId, sessionId: p.sessionId },
      businessId: p.businessId,
      severity: "critical",
    });
    return;
  }

  /*
   * Se goleste legatura abia dupa expirarea REUSITA. Comanda intra astfel in a
   * doua trecere a cronului de reconciliere (cea dupa `metadata`), care e
   * potrivita pentru o comanda fara sesiune; iar `order-checkout` nu mai incearca
   * sa citeasca o sesiune moarta la reincercare.
   */
  const { error } = await admin
    .from("orders")
    .update({ stripe_session_id: null })
    .eq("id", p.orderId)
    .eq("business_id", p.businessId)
    .eq("stripe_session_id", p.sessionId);
  if (error) {
    await logError({
      action: "stripe.sesiuneNeinchisa",
      message: `Sesiunea Stripe a fost expirata, dar legatura n-a putut fi stearsa de pe comanda: ${error.message}`,
      details: { orderId: p.orderId, sessionId: p.sessionId },
      businessId: p.businessId,
      severity: "warning",
    });
  }
}
