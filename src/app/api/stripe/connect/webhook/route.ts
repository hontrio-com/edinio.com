import { NextRequest, NextResponse } from "next/server";
import { stripe, getStripe } from "@/lib/stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { finalizeStripeOrder, stripeAccountId } from "@/lib/stripe-finalize";
import { citireCazuta } from "@/lib/supabase/citire";
import { logError } from "@/lib/error-logger";
import { baniiSAuIntors } from "@/lib/plati/banii-s-au-intors";
import { comandaPlatiiStripe } from "@/lib/stripe-banii-s-au-intors";
import type { Database } from "@/types/database.types";
import type Stripe from "stripe";

/*
 * ═══ ⚠⚠ EVENIMENTELE INTRA IN FORMA VECHE, DESI NOI CEREM UNA NOUA (16.09.2026) ═══
 *
 * Capatul Connect din panoul lor („Endpoint Connect") are versiune de API FIXATA la **2023-08-16**,
 * in timp ce `lib/stripe.ts` cere SDK-ului `2026-04-22.dahlia`. Deci:
 *
 *   INTRA  evenimentele serializate ca in 2023-08-16
 *   IESE   fiecare apel al nostru catre ei (`charges.retrieve`, `sessions.retrieve`) pe 2026-04-22
 *
 * Si nu se aliniaza singure. Documentatia lor o spune limpede: „if an endpoint has an explicit
 * version set, **it always uses that version**". Adica nici macar o ridicare a versiunii contului
 * nu schimba ce ajunge aici.
 *
 * ⚠ AZI NU STRICA NIMIC, verificat camp cu camp: tot ce citim din evenimente (`charge.amount`,
 * `charge.amount_refunded`, `charge.currency`, `charge.payment_intent`, `dispute.amount`,
 * `dispute.charge`, `session.metadata`, `session.payment_status`) exista neschimbat din 2023.
 *
 * ⚠ DAR TIPURILE MINT. `Stripe.Charge` si `Stripe.Dispute` din SDK descriu forma din 2026, deci
 * `tsc` va accepta bucuros un camp aparut dupa 2023 care la rulare va fi `undefined`. Cine adauga
 * aici un camp nou trebuie sa-l caute intai in versiunea 2023-08-16, nu in tipuri.
 *
 * ⚠ SI DE CE NU SE RIDICA VERSIUNEA CAPATULUI: ar schimba si forma evenimentelor pe care le trateaza
 * deja bine (`account.updated`, `checkout.session.*`), adica un drum de bani care merge. Nu se
 * umbla la el fara o trecere anume, cu probe.
 */

/**
 * Evenimentul a mai fost vazut?
 *
 * ⚠ Webhook-ul de PLATFORMA avea dedupe de la bun inceput; asta nu. Pana acum nu costa nimic:
 * `finalizeStripeOrder` e idempotent prin `.neq("payment_status", "paid")`, iar `account.updated`
 * scrie aceeasi valoare. Cu rambursarile de mai jos costa: o relivrare a aceluiasi
 * `charge.refunded` ar striga a doua oara la comerciant pentru aceiasi bani, iar el ar cauta o a
 * doua rambursare care nu exista.
 *
 * ⚠ Registrul indisponibil NU opreste procesarea: mai bine un strigat repetat decat o rambursare
 * care nu ajunge niciodata. Acelasi rationament ca la platforma.
 */
async function evenimentNou(
  admin: ReturnType<typeof createAdminClient<Database>>,
  event: Stripe.Event,
): Promise<boolean> {
  const { error } = await admin.from("stripe_events").insert({ event_id: event.id, type: event.type });
  if (!error) return true;
  if (error.code === "23505") return false;
  console.error("[stripe/connect/webhook] registrul de evenimente indisponibil:", error.message);
  return true;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_CONNECT_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (!(await evenimentNou(admin, event))) {
    console.log("[stripe/connect/webhook] eveniment deja procesat, ignorat:", event.id, event.type);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // account.updated — sync charges_enabled / payouts_enabled status
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const { data: rows } = await admin
      .from("store_settings")
      .select("id, stripe_config")
      .filter("stripe_config->>account_id", "eq", account.id);

    if (rows && rows.length > 0) {
      const row = rows[0];
      const existing = (row.stripe_config as Record<string, unknown>) ?? {};
      await admin
        .from("store_settings")
        .update({
          stripe_config: {
            ...existing,
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            onboarding_complete: account.details_submitted,
            enabled: account.charges_enabled,
          },
        })
        .eq("id", row.id);
    }
  }

  // checkout.session.completed — marcheaza comanda platita.
  //
  // `async_payment_succeeded` acopera metodele care se deconteaza mai tarziu:
  // acolo sesiunea se „completeaza" cu payment_status `unpaid`, iar plata
  // confirma abia la al doilea eveniment.
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    const businessId = session.metadata?.businessId;
    const accountId = event.account ?? null;

    if (orderId && businessId && accountId) {
      const { data: order, error: eOrder } = await admin
        .from("orders")
        .select("id, total, status, payment_status")
        .eq("id", orderId)
        .eq("business_id", businessId)
        .single();

      // Contul din eveniment trebuie sa fie chiar contul conectat al magazinului:
      // altfel un cont conectat oarecare ar putea marca platita comanda altuia
      // doar trimitand acelasi `orderId` in metadata.
      const { data: settings, error: eSettings } = await admin
        .from("store_settings")
        .select("stripe_config")
        .eq("business_id", businessId)
        .single();

      /*
       * ⚠ „Nu gasesc comanda" si „n-am putut interoga baza" ieseau amandoua pe
       * ramura de mai jos, cu 200 catre Stripe — adica „livrat, nu mai repeta".
       * Stripe reincearca pana la 3 zile pe 5xx, deci un incident de baza se
       * repara singur DACA raspundem corect. Altfel plata ramane incasata la
       * Stripe si neplatita la noi, si numai cronul de reconciliere o mai poate
       * prinde.
       */
      if (citireCazuta(eOrder, order) || citireCazuta(eSettings, settings)) {
        const e = [eOrder, eSettings].find((x) => x && x.code !== "PGRST116");
        await logError({
          action: "stripe/connect/webhook",
          message: `citire picata inainte de finalizare: ${e?.message ?? "motiv necunoscut"}`,
          details: { orderId, sessionId: session.id },
          businessId,
          severity: "critical",
        });
        return NextResponse.json({ received: false, error: "citire esuata" }, { status: 503 });
      }

      if (order && stripeAccountId(settings?.stripe_config) === accountId) {
        /*
         * Rezultatul se CITESTE. Era aruncat, si ruta raspundea 200 orice s-ar fi
         * intamplat: un esec de scriere in baza ii spunea lui Stripe „gata", si
         * evenimentul nu mai venea. Revolut face deja corect.
         */
        const r = await finalizeStripeOrder(
          admin,
          accountId,
          { id: order.id, businessId, total: Number(order.total) || 0, status: order.status as string | null },
          session.id,
        );
        if (r.status === "failed") {
          return NextResponse.json({ received: false, error: r.error }, { status: 503 });
        }
      } else {
        console.error("[stripe/webhook] comanda sau contul nu corespund:", { orderId, businessId, accountId });
      }
    }
  }

  /*
   * ═══ ⚠⚠ BANII CARE SE INTORC (16.09.2026) ═══
   *
   * Pana azi, in TOT codul se tratau sase feluri de evenimente Stripe si niciunul nu era despre bani
   * intorsi. Comerciantul ramburseaza din panoul Stripe (unde e cel mai la indemana, si unde a
   * facut-o dintotdeauna) si comanda ramanea `paid` la noi pentru totdeauna.
   *
   * ⚠ CE TREBUIE SA FIE PORNIT LA EI: tipurile `charge.refunded` si `charge.dispute.created` pe
   * capatul Connect din panoul Stripe. Codul de aici nu le poate cere singur; daca nu sunt bifate,
   * plasa ramane cronul de reconciliere, care INTREABA si nu asteapta sa i se spuna.
   *
   * ⚠ Regula despre ce inseamna banii intorsi sta in `lib/stripe-banii-s-au-intors.ts`, fiindca are
   * doi apelanti: ramura asta si cronul. Doua copii ale unei reguli despre bani se departeaza una de
   * alta, si niciodata amandoua deodata.
   */
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const accountId = event.account ?? null;
    const contestatie = event.type === "charge.dispute.created";

    /*
     * Cele doua evenimente poarta obiecte DIFERITE: la rambursare vine chiar `Charge`, la
     * contestatie vine `Dispute`, care doar arata catre plata. De aceea nu se intersecteaza
     * tipurile (ar iesi `never`), ci se deosebesc aici, o data.
     */
    const dispute = contestatie ? (event.data.object as Stripe.Dispute) : null;
    const chargeDinEveniment = contestatie ? null : (event.data.object as Stripe.Charge);
    const chargeId = dispute
      ? (typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? null)
      : chargeDinEveniment?.id ?? null;

    if (accountId && chargeId) {
      let charge = chargeDinEveniment;
      if (!charge) {
        try {
          charge = await getStripe().charges.retrieve(chargeId, {}, { stripeAccount: accountId });
        } catch (e) {
          /*
           * ⚠ 503, ca Stripe sa RELIVREZE. O contestatie pierduta fiindca n-am putut citi plata e o
           * comanda despre care comerciantul nu afla ca i-a fost contestata, si un termen scapat.
           */
          await logError({
            action: "stripe/connect/webhook",
            message: `plata contestata nu s-a putut citi: ${e instanceof Error ? e.message : String(e)}`,
            details: { chargeId, accountId }, severity: "critical",
          });
          return NextResponse.json({ received: false }, { status: 503 });
        }
      }

      const piId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;

      if (piId) {
        const order = await comandaPlatiiStripe(admin, piId, accountId);
        if (!order) {
          /* Plata nu e a unei comenzi de-ale noastre (sau e prea veche). Nu e o defectiune. */
          console.log("[stripe/connect/webhook] bani intorsi fara comanda potrivita:", { chargeId, piId });
        } else {
          const v = await baniiSAuIntors(admin, order, {
            intors: dispute ? dispute.amount : (charge.amount_refunded ?? 0),
            incasat: charge.amount ?? 0,
            moneda: charge.currency ?? "ron",
            contestatie,
            referinta: dispute ? dispute.id : chargeId,
          }, { actiune: "stripe/connect/webhook", furnizor: "Stripe" });
          /* ⚠ Un esec de scriere cere RELIVRARE: altfel banii raman intorsi si comanda platita. */
          if (v.fel === "esec") return NextResponse.json({ received: false, error: v.mesaj }, { status: 503 });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
