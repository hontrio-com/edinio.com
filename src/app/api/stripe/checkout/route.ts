import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, getPriceId } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { plan, interval: rawInterval, return_to } = await req.json() as { plan: string; interval?: string; return_to?: string };
  const interval: "monthly" | "annual" = rawInterval === "annual" ? "annual" : "monthly";
  const priceId = getPriceId(plan, interval);
  if (!priceId) {
    return NextResponse.json(
      { error: interval === "annual" ? "Planul anual nu este disponibil momentan." : "Plan invalid." },
      { status: 400 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  /*
    ⚠ `{CHECKOUT_SESSION_ID}` NU E O VARIABILA DE-A NOASTRA. E un sablon pe care il
    inlocuieste Stripe la redirectionare, cu id-ul chiar al sesiunii platite.

    De ce e nevoie de el: `purchase` pleaca pe doua drumuri — din browser cand omul
    se intoarce, si din webhook cand banii chiar intra. Ca sa fie numarat O data,
    amandoua trebuie sa poarte ACELASI `event_id`. Id-ul magazinului nu putea fi
    acela: la ora webhook-ului magazinul inca nu exista. Id-ul sesiunii il stiu
    amandoi.

    ⚠ SE ADAUGA DOAR PE CALEA DE ONBOARDING, dinadins. Celelalte doua nu trag
    `purchase` din browser, deci n-au ce deduplica — iar drumul platii se atinge
    cat mai putin.
  */
  const successUrl =
    return_to === "onboarding" ? `${siteUrl}/onboarding/plan?success=1&sid={CHECKOUT_SESSION_ID}`
    : return_to === "reactivare" ? `${siteUrl}/reactivare?success=1`
    : `${siteUrl}/dashboard/settings?plan_success=1`;
  const cancelUrl =
    return_to === "onboarding" ? `${siteUrl}/onboarding/plan?cancelled=1`
    : return_to === "reactivare" ? `${siteUrl}/reactivare`
    : `${siteUrl}/dashboard/settings`;

  // Look up existing Stripe customer to avoid duplicates
  const { data: profile } = await supabase
    .from("users_profile")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  const existingCustomerId = profile?.stripe_customer_id ?? null;

  // NOTA: abonamentul vechi (la upgrade/reactivare) NU se anuleaza aici. Ar fi
  // periculos sa-l anulam inainte de plata: daca userul abandoneaza checkout-ul,
  // ar ramane fara abonament. Anularea vechiului abonament se face din webhook
  // (checkout.session.completed), abia dupa ce noua plata reuseste.

  // Build checkout session params
  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: user.id,
    metadata: { user_id: user.id, plan, interval },
    subscription_data: { metadata: { user_id: user.id, plan, interval } },
  };

  // Reuse existing Stripe customer or pass email for new one
  if (existingCustomerId) {
    sessionParams.customer = existingCustomerId;
  } else {
    sessionParams.customer_email = user.email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  return NextResponse.json({ url: session.url });
}
