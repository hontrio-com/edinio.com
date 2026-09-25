import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, getPriceId } from "@/lib/stripe";
import { consimtamantulCererii } from "@/lib/edinio-marketing/server/consimtamant-server";
import { lookupAnaf } from "@/lib/anaf/lookup";
import { rateLimit } from "@/lib/utils/rate-limit";
import { areCuiDeFacturare, firmaDinAnaf, metadataFacturare, type FirmaFacturare } from "@/lib/billing/firma-abonament";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { plan, interval: rawInterval, return_to, cui } = await req.json() as { plan: string; interval?: string; return_to?: string; cui?: string };
  const interval: "monthly" | "annual" = rawInterval === "annual" ? "annual" : "monthly";
  const priceId = getPriceId(plan, interval);
  if (!priceId) {
    return NextResponse.json(
      { error: interval === "annual" ? "Planul anual nu este disponibil momentan." : "Plan invalid." },
      { status: 400 }
    );
  }

  /*
    FARA CUI NU SE PLATESTE. Factura abonamentului se emite pe firma din
    `businesses`; fara CUI iesea pe persoana fizica. Cine are deja un CUI bun nu
    vede nimic nou. Ceilalti primesc `cereCui`, clientul deschide fereastra
    „Date pentru factura" si revine cu CUI-ul, pe care il verificam AICI in ANAF:
    fereastra doar arata datele, nu le hotaraste. Reinnoirile automate nu trec pe
    aici, deci nu cer nimic nimanui.
  */
  const { data: magazin } = await supabase
    .from("businesses")
    .select("id, business_name, store_name, cui")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .maybeSingle();

  let firma: FirmaFacturare | null = null;
  if (!areCuiDeFacturare(magazin?.cui)) {
    if (!cui?.trim()) {
      return NextResponse.json(
        { error: "Completeaza CUI-ul firmei ca sa putem emite factura.", cereCui: true },
        { status: 422 },
      );
    }
    if (!rateLimit(`anaf:${user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Prea multe cautari. Asteapta un minut.", cereCui: true }, { status: 429 });
    }
    const anaf = await lookupAnaf(cui);
    if (!anaf.ok) {
      return NextResponse.json({ error: anaf.error, cereCui: true }, { status: anaf.status });
    }
    firma = firmaDinAnaf(anaf.company);

    if (magazin) {
      // Numele afisat in magazin nu se schimba: vitrina arata `store_name ?? business_name`,
      // deci cand `store_name` lipseste, numele de pana acum se muta acolo.
      const { error: eFirma } = await supabase
        .from("businesses")
        .update({
          cui: firma.cui,
          business_name: firma.business_name,
          ...(magazin.store_name ? {} : { store_name: magazin.business_name }),
          reg_com: firma.reg_com || null,
          address: firma.address || null,
          city: firma.city || null,
          county: firma.county || null,
        })
        .eq("id", magazin.id);
      if (eFirma) {
        console.error("[checkout] datele firmei nu s-au putut salva:", eFirma);
        return NextResponse.json({ error: "Nu am putut salva datele firmei. Incearca din nou.", cereCui: true }, { status: 500 });
      }
    }
  }
  const facturare = firma ? metadataFacturare(firma) : {};

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const consim = await consimtamantulCererii();
  const cs = consim?.marketing ? "1" : "0";
  const vid = consim?.marketing ? consim.vid : undefined;

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
    /*
      ⚠ HOTARAREA CALATORESTE CU SESIUNEA. Webhook-ul care confirma plata vine de
      la serverele Stripe, nu de la browserul omului: acolo nu exista cookie-uri,
      deci nu are cum sa afle daca a acordat marketing. Singura clipa in care
      stim sigur e ACUM, cand el chiar apasa.

      `cs` = consimtamant. Se scrie „0" explicit, nu se omite: lipsa campului
      inseamna „sesiune deschisa inainte de poarta", si aia trebuie sa se
      deosebeasca de un refuz limpede.
    */
    metadata: { user_id: user.id, plan, interval, cs, ...(vid ? { vid } : {}), ...facturare },
    subscription_data: { metadata: { user_id: user.id, plan, interval, cs, ...(vid ? { vid } : {}), ...facturare } },
  };

  // Reuse existing Stripe customer or pass email for new one
  if (existingCustomerId) {
    sessionParams.customer = existingCustomerId;
  } else {
    sessionParams.customer_email = user.email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  // `firma` merge inapoi pentru onboarding: acolo magazinul se creeaza abia dupa
  // plata, iar `createBusiness` il primeste de la client.
  return NextResponse.json({ url: session.url, ...(firma ? { firma } : {}) });
}
