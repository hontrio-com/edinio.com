import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { stripe } from "@/lib/stripe";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSmartbillInvoice } from "@/lib/smartbill";
import { PLAN_PRICES } from "@/lib/plans";
import type Stripe from "stripe";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Data urmatoarei plati in functie de interval: anual = +1 an, altfel +1 luna.
// Pentru abonamentele existente (fara `interval` in metadata) ramane +1 luna.
function computeExpiry(interval?: string | null): Date {
  const d = new Date();
  if (interval === "annual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

// Sfarsitul REAL al perioadei facturate (unix sec) din liniile facturii, ca sa
// setam plan_expires_at exact cat a platit clientul la Stripe — nu aproximam cu
// now+interval (care ar drifta la reincercari intarziate). Fallback pe computeExpiry.
function invoicePeriodEnd(invoice: Stripe.Invoice): number | null {
  const lines = invoice.lines?.data ?? [];
  let maxEnd = 0;
  for (const line of lines) {
    const end = (line as { period?: { end?: number } }).period?.end;
    if (typeof end === "number" && end > maxEnd) maxEnd = end;
  }
  return maxEnd > 0 ? maxEnd : null;
}

function intervalLabel(interval?: string | null): string {
  return interval === "annual" ? "anual" : "lunar";
}

// Normalizeaza intervalul pentru stocare in DB. Abonamentele legacy (fara
// `interval` in metadata) sunt lunare.
function normalizeInterval(interval?: string | null): "monthly" | "annual" {
  return interval === "annual" ? "annual" : "monthly";
}

// Metadata-ul abonamentului (`user_id`, `plan`, `interval`) atasat unei facturi.
// CRITIC: structura difera intre moduri de facturare / versiuni API Stripe:
//   - „flexible" / API noi:  invoice.parent.subscription_details.metadata
//   - „classic" / API vechi: invoice.subscription_details.metadata (top-level)
// Contul Edinio e pe billing „flexible", deci citirea doar din top-level lasa
// metadata gol → reinnoirile nu se proceseaza. Citim din AMBELE cai; daca tot
// lipseste, cadem pe metadata-ul abonamentului (fetch dupa ID). Asa handler-ele
// invoice.payment_succeeded / _failed functioneaza indiferent de versiune.
type InvoiceCompat = Stripe.Invoice & {
  subscription_details?: { metadata?: Record<string, string> | null } | null;
  subscription?: string | { id: string } | null;
  parent?: {
    subscription_details?: {
      metadata?: Record<string, string> | null;
      subscription?: string | { id: string } | null;
    } | null;
  } | null;
};

// Emite factura fiscala Smartbill + salveaza inregistrarea, pentru o plata de
// abonament reusita. Rulata DEFERAT (dupa raspunsul catre Stripe) prin `after()`
// ca sa nu blocheze webhook-ul cu apelul lent Smartbill. Idempotenta: sare daca
// factura e deja emisa, iar unique(stripe_invoice_id) previne duplicate.
async function emitSubscriptionInvoice(
  admin: SupabaseClient,
  invoice: Stripe.Invoice,
  meta: { userId: string; plan: string; interval?: string; stripeInvoiceId: string },
): Promise<void> {
  const { userId, plan, interval, stripeInvoiceId } = meta;

  const { data: existingInvoice } = await admin
    .from("invoices")
    .select("id, smartbill_series")
    .eq("stripe_invoice_id", stripeInvoiceId)
    .maybeSingle();

  if (existingInvoice?.smartbill_series) {
    console.log("[webhook] Invoice already fully processed, skipping:", stripeInvoiceId);
    return;
  }

  const [{ data: authUserData }, { data: bizData }, { data: profileData }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("businesses").select("business_name, address, city, county, cui").eq("user_id", userId).maybeSingle(),
    admin.from("users_profile").select("full_name").eq("id", userId).maybeSingle(),
  ]);

  const userEmail = authUserData?.user?.email ?? "";
  const clientName = bizData?.business_name || profileData?.full_name || userEmail || "Client";

  // Suma reala incasata de Stripe (bani → lei). Acopera lunar, anual (lunar×9) si
  // eventualele proratari/discounturi.
  const amountPaid = typeof invoice.amount_paid === "number" ? invoice.amount_paid : 0;
  const planPrice = amountPaid > 0 ? amountPaid / 100 : (PLAN_PRICES[plan] ?? 0);

  let sbSeries: string | null = null;
  let sbNumber: string | null = null;
  let sbError: string | null = null;

  const sbResult = await createSmartbillInvoice(
    {
      name: clientName,
      email: userEmail,
      vatCode: bizData?.cui ?? undefined,
      address: bizData?.address ?? undefined,
      city: bizData?.city ?? undefined,
      county: bizData?.county ?? undefined,
    },
    {
      name: `Abonament Edinio ${capitalize(plan)} (${intervalLabel(interval)})`,
      price: planPrice,
      quantity: 1,
    },
  );

  if (sbResult.error) {
    sbError = sbResult.error;
    console.error("[webhook] Smartbill failed:", sbError, "| invoice:", stripeInvoiceId);
  } else {
    sbSeries = sbResult.series ?? null;
    sbNumber = sbResult.number ?? null;
  }

  if (existingInvoice) {
    await admin.from("invoices").update({
      smartbill_series: sbSeries,
      smartbill_number: sbNumber,
      smartbill_error: sbError,
    }).eq("id", existingInvoice.id);
    console.log("[webhook] Invoice updated:", { sbSeries, sbNumber, sbError });
  } else {
    const { error: invoiceError } = await admin.from("invoices").insert({
      user_id: userId,
      plan,
      amount: planPrice,
      currency: "RON",
      smartbill_series: sbSeries,
      smartbill_number: sbNumber,
      smartbill_error: sbError,
      stripe_invoice_id: stripeInvoiceId,
      status: "paid",
    });
    if (invoiceError) {
      console.error("[webhook] Failed to save invoice record:", invoiceError);
    } else {
      console.log("[webhook] Invoice saved:", { userId, plan, sbSeries, sbNumber, sbError });
    }
  }
}

async function resolveInvoiceSubMeta(invoice: Stripe.Invoice): Promise<Record<string, string>> {
  const inv = invoice as InvoiceCompat;
  const direct = inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata ?? null;
  if (direct?.user_id) return direct as Record<string, string>;

  // Fallback: citeste metadata direct de pe abonament.
  const subRef = inv.parent?.subscription_details?.subscription ?? inv.subscription ?? null;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      if (sub.metadata?.user_id) return sub.metadata as Record<string, string>;
    } catch (err) {
      console.error("[webhook] subscription retrieve fallback failed:", err);
    }
  }
  return (direct ?? {}) as Record<string, string>;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── checkout.session.completed ─────────────────────────────────────────────
  // Fires once when a new subscription is created via Checkout.
  // We update the plan, store the Stripe customer ID, and clear any suspension.
  // NOTE: invoice.payment_succeeded also fires for the same payment — that
  // event handles Smartbill invoice creation to avoid duplicates.
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // ── Domain order payment ────────────────────────────────────────────────
    if (session.metadata?.type === "domain_order") {
      const { user_id, business_id, domain, tld, period, price_per_year, total_price, contact } = session.metadata;

      if (!user_id || !business_id || !domain || !tld || !period || !total_price) {
        console.error("[webhook] domain_order: incomplete metadata", session.metadata);
        return NextResponse.json({ received: true });
      }

      let contactInfo = {};
      try { contactInfo = JSON.parse(contact ?? "{}"); } catch { /* ignore */ }

      const { data: createdOrder, error: orderError } = await admin.from("domain_orders").insert({
        user_id,
        business_id,
        domain,
        tld,
        period: Number(period) || 1,
        price_per_year: Number(price_per_year) || 0,
        total_price: Number(total_price) || 0,
        status: "pending",
        contact_info: contactInfo,
      }).select("id").single();

      if (orderError) {
        console.error("[webhook] domain_order insert failed:", orderError);
      } else {
        console.log("[webhook] domain_order created:", domain, createdOrder?.id);

        // Fetch business info for admin email + invoice
        const [{ data: bizData }, { data: profileData }, { data: authUserData }] = await Promise.all([
          admin.from("businesses")
            .select("business_name, address, city, county, cui")
            .eq("id", business_id)
            .single(),
          admin.from("users_profile")
            .select("full_name")
            .eq("id", user_id)
            .maybeSingle(),
          admin.auth.admin.getUserById(user_id),
        ]);

        const userEmail = authUserData?.user?.email ?? "";
        const clientName = bizData?.business_name || profileData?.full_name || userEmail || "Client";
        const domainPrice = Number(total_price) || 0;

        // Emit SmartBill invoice for domain purchase
        let sbSeries: string | null = null;
        let sbNumber: string | null = null;
        let sbError: string | null = null;

        const sbResult = await createSmartbillInvoice(
          {
            name: clientName,
            email: userEmail,
            vatCode: bizData?.cui ?? undefined,
            address: bizData?.address ?? undefined,
            city: bizData?.city ?? undefined,
            county: bizData?.county ?? undefined,
          },
          {
            name: `Domeniu ${domain} (${period} ${Number(period) === 1 ? "an" : "ani"})`,
            price: domainPrice,
            quantity: 1,
          }
        );

        if (sbResult.error) {
          sbError = sbResult.error;
          console.error("[webhook] domain Smartbill failed:", sbError);
        } else {
          sbSeries = sbResult.series ?? null;
          sbNumber = sbResult.number ?? null;
        }

        // Save invoice record
        const { error: invoiceError } = await admin.from("invoices").insert({
          user_id,
          plan: "domain",
          amount: domainPrice,
          currency: "RON",
          smartbill_series: sbSeries,
          smartbill_number: sbNumber,
          smartbill_error: sbError,
          stripe_invoice_id: session.payment_intent as string ?? null,
          status: "paid",
        });

        if (invoiceError) {
          console.error("[webhook] domain invoice insert failed:", invoiceError);
        } else {
          console.log("[webhook] domain invoice saved:", { domain, sbSeries, sbNumber });
        }

        // Send admin notification
        const { sendDomainOrderToAdmin } = await import("@/lib/email");
        const ci = contactInfo as Record<string, string>;
        sendDomainOrderToAdmin({
          orderId: createdOrder?.id ?? domain,
          domain,
          tld,
          period: Number(period) || 1,
          totalPrice: domainPrice,
          customerName: `${ci.firstname ?? ""} ${ci.lastname ?? ""}`.trim(),
          customerEmail: ci.email ?? session.customer_email ?? "",
          businessName: bizData?.business_name ?? "N/A",
        }).catch((err) => console.error("[webhook] domain admin email failed:", err));
      }

      return NextResponse.json({ received: true });
    }

    // ── Subscription plan payment ───────────────────────────────────────────
    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan;
    const interval = session.metadata?.interval;

    console.log("[webhook] checkout.session.completed", { userId, plan, interval });

    if (!userId || !plan) {
      console.error("[webhook] Missing userId or plan in metadata");
      return NextResponse.json({ received: true });
    }

    const expiresAt = computeExpiry(interval);

    const { error: profileError } = await admin.from("users_profile").update({
      plan: plan as never,
      plan_expires_at: expiresAt.toISOString(),
      plan_interval: normalizeInterval(interval),
      stripe_customer_id: session.customer as string ?? null,
      payment_failed_at: null, // reactivare → curata orice stare de plata restanta
    }).eq("id", userId);

    if (profileError) {
      console.error("[webhook] Profile update failed:", profileError);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    // Clear any active grace period / suspension
    await admin.from("businesses").update({ suspended_until: null }).eq("user_id", userId);

    // Anuleaza orice ALT abonament al clientului (planul vechi la upgrade/reactivare).
    // Il anulam ABIA acum, dupa ce noua plata a reusit — daca l-am fi anulat inainte
    // de checkout si userul abandona plata, ar fi ramas fara abonament (si fara
    // subscription.deleted → cont in limbo). Marcam `switching=1` ca deletion-ul lor
    // sa sara peste perioada de gratie/email. Deferat: nu blocheaza raspunsul.
    if (session.customer && session.subscription) {
      const newSubId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
      after(async () => {
        try {
          const subs = await stripe.subscriptions.list({ customer: customerId, limit: 20 });
          for (const sub of subs.data) {
            if (sub.id === newSubId || sub.status === "canceled") continue;
            try {
              await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, switching: "1" } });
            } catch { /* continua anularea chiar daca update-ul de metadata esueaza */ }
            await stripe.subscriptions.cancel(sub.id, { prorate: true });
            console.log("[webhook] old subscription cancelled after switch:", sub.id);
          }
        } catch (err) {
          console.error("[webhook] cancel old subscriptions failed:", err);
        }
      });
    }

    // Send subscription activated email
    const { data: authData } = await admin.auth.admin.getUserById(userId);
    const { data: profileForEmail } = await admin.from("users_profile").select("full_name").eq("id", userId).maybeSingle();
    if (authData?.user?.email) {
      import("@/lib/email").then(({ sendSubscriptionActivatedEmail }) => {
        sendSubscriptionActivatedEmail(authData.user!.email!, {
          name: profileForEmail?.full_name ?? "",
          plan: capitalize(plan),
          expiresAt: expiresAt.toISOString(),
        }).catch((err) => console.error("[webhook] subscription email failed:", err));
      }).catch(() => {});
    }

    // Revalidate dashboard so user sees updated plan immediately
    revalidatePath("/dashboard", "layout");

    console.log("[webhook] checkout.session.completed — plan updated, suspension cleared:", { userId, plan });
  }

  // ── customer.subscription.deleted ─────────────────────────────────────────
  // Fires when all Stripe payment retries are exhausted and subscription is cancelled.
  // We give a 15-day grace period before suspending the store publicly.
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.user_id;
    if (!userId) return NextResponse.json({ received: true });

    // Anulare intentionata pentru schimbarea planului/intervalului (marcata de
    // ruta de checkout inainte de cancel). NU e churn, deci sarim perioada de
    // gratie si email-ul de suspendare — noul abonament preia imediat.
    if (sub.metadata?.switching === "1") {
      console.log("[webhook] subscription.deleted — schimbare plan in curs, skip grace:", { userId });
      return NextResponse.json({ received: true });
    }

    const graceUntil = new Date();
    graceUntil.setDate(graceUntil.getDate() + 15);

    const { error: graceError } = await admin
      .from("businesses")
      .update({ suspended_until: graceUntil.toISOString() })
      .eq("user_id", userId);

    if (graceError) {
      console.error("[webhook] Failed to set grace period:", graceError);
      return NextResponse.json({ error: "Grace period update failed" }, { status: 500 });
    }

    // Send store suspended email
    const { data: suspAuthData } = await admin.auth.admin.getUserById(userId);
    const { data: suspProfile } = await admin.from("users_profile").select("full_name").eq("id", userId).maybeSingle();
    if (suspAuthData?.user?.email) {
      import("@/lib/email").then(({ sendStoreSuspendedEmail }) => {
        sendStoreSuspendedEmail(suspAuthData.user!.email!, {
          name: suspProfile?.full_name ?? "",
          graceUntil: graceUntil.toISOString(),
        }).catch((err) => console.error("[webhook] suspended email failed:", err));
      }).catch(() => {});
    }

    console.log("[webhook] subscription.deleted — grace period set:", { userId, graceUntil });
  }

  // ── invoice.payment_succeeded ──────────────────────────────────────────────
  // Fires for EVERY successful payment: initial subscription + all renewals.
  // This is where we update the plan expiry, clear suspension, and emit
  // the Smartbill invoice for accounting purposes.
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;

    const subMeta = await resolveInvoiceSubMeta(invoice);
    const userId = subMeta.user_id;
    const plan = subMeta.plan;
    const interval = subMeta.interval;

    if (!userId || !plan) return NextResponse.json({ received: true });

    const stripeInvoiceId = invoice.id;
    const periodEnd = invoicePeriodEnd(invoice);
    const expiresAt = periodEnd ? new Date(periodEnd * 1000) : computeExpiry(interval);

    // 1. Update plan + expiry + interval. Curata `payment_failed_at`: orice plata
    // reusita (initiala, reinnoire normala sau recuperare in dunning) inseamna ca
    // abonamentul e la zi → bannerul/badge-ul de plata restanta dispare.
    await admin.from("users_profile").update({
      plan: plan as never,
      plan_expires_at: expiresAt.toISOString(),
      plan_interval: normalizeInterval(interval),
      payment_failed_at: null,
    }).eq("id", userId);

    // 2. Clear suspension
    await admin.from("businesses").update({ suspended_until: null }).eq("user_id", userId);

    // 3. Revalidate dashboard
    revalidatePath("/dashboard", "layout");

    // 3b. Detecteaza recuperarea unei plati esuate. Semnal: exista o notificare
    // de esec necitita (marcata de noi la payment_failed). Marcarea ei ca citita
    // face detectia IDEMPOTENTA — o re-livrare a webhook-ului nu mai gaseste
    // notificarea necitita, deci nu retrimite emailul. (Nu folosim
    // invoice.attempt_count: acesta e neschimbat la retry-uri de webhook si ar
    // duce la email-uri duplicate; o plata initiala/reinnoire normala nu are
    // oricum notificare de esec.)
    const { data: pendingFailure } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "payment")
      .eq("is_read", false)
      .limit(1);

    if (pendingFailure && pendingFailure.length > 0) {
      await admin.from("notifications").update({ is_read: true })
        .eq("user_id", userId).eq("type", "payment").eq("is_read", false);

      const { data: recAuth } = await admin.auth.admin.getUserById(userId);
      const { data: recProfile } = await admin.from("users_profile").select("full_name").eq("id", userId).maybeSingle();
      if (recAuth?.user?.email) {
        import("@/lib/email").then(({ sendPaymentRecoveredEmail }) => {
          sendPaymentRecoveredEmail(recAuth.user!.email!, {
            name: recProfile?.full_name ?? "",
            plan: capitalize(plan),
            expiresAt: expiresAt.toISOString(),
          }).catch((err) => console.error("[webhook] payment recovered email failed:", err));
        }).catch(() => {});
      }
      console.log("[webhook] invoice.payment_succeeded — recovery detected:", { userId, plan });
    }

    // 3. Emite factura fiscala Smartbill DEFERAT (dupa raspuns) prin `after()`, ca
    // sa returnam 200 rapid la Stripe fara risc de timeout/retry din cauza apelului
    // lent Smartbill. Starea critica (plan/expirare/suspendare) e deja salvata
    // sincron mai sus, deci un esec Smartbill nu afecteaza accesul userului.
    after(() => emitSubscriptionInvoice(admin, invoice, { userId, plan, interval, stripeInvoiceId }));

    console.log("[webhook] invoice.payment_succeeded processed (Smartbill deferred):", { userId, plan });
  }

  // ── invoice.payment_failed ───────────────────────────────────────────────
  // Fires when Stripe fails to charge the customer's payment method.
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;

    const subMeta = await resolveInvoiceSubMeta(invoice);
    const userId = subMeta.user_id;
    const plan = subMeta.plan;

    if (userId && plan) {
      // Marcheaza starea REALA de plata restanta (dunning Stripe). Acesta e semnalul
      // pe care se leaga bannerul + badge-ul din Setari — nu `plan_expires_at < now()`,
      // care devine true si in fereastra draft/finalizare a Stripe (inainte de orice
      // incercare de plata), producand un fals „plata esuata". Setat abia cand Stripe
      // chiar a incercat si a esuat plata; sters la urmatoarea plata reusita.
      await admin.from("users_profile").update({
        payment_failed_at: new Date().toISOString(),
      }).eq("id", userId);

      const { data: failedAuthData } = await admin.auth.admin.getUserById(userId);
      const { data: failedProfile } = await admin.from("users_profile").select("full_name").eq("id", userId).maybeSingle();
      if (failedAuthData?.user?.email) {
        import("@/lib/email").then(({ sendPaymentFailedEmail }) => {
          sendPaymentFailedEmail(failedAuthData.user!.email!, {
            name: failedProfile?.full_name ?? "",
            plan: capitalize(plan),
          }).catch((err) => console.error("[webhook] payment failed email failed:", err));
        }).catch(() => {});
      }

      // Notificare persistenta in clopotel (nu doar email efemer). Stripe reincearca
      // plata de mai multe ori pe parcursul dunning-ului — nu inseram duplicate cat
      // timp exista deja una necitita din ultimele 3 zile.
      const { data: existingNotif } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "payment")
        .eq("is_read", false)
        .gte("created_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (!existingNotif || existingNotif.length === 0) {
        const { error: notifError } = await admin.from("notifications").insert({
          user_id: userId,
          type: "payment",
          title: "Plata abonamentului a esuat",
          message: `Nu am putut procesa plata pentru abonamentul ${capitalize(plan)}. Reia plata sau actualizeaza cardul din Setari > Abonament ca sa iti pastrezi magazinul activ.`,
        });
        if (notifError) console.error("[webhook] payment failed notification insert failed:", notifError);
      }

      // Actualizeaza dashboard-ul ca bannerul de plata restanta sa apara imediat.
      revalidatePath("/dashboard", "layout");

      console.log("[webhook] invoice.payment_failed — email + notification:", { userId, plan });
    }
  }

  return NextResponse.json({ received: true });
}
