import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createSmartbillInvoice } from "@/lib/smartbill";
import { PLAN_PRICES } from "@/lib/plans";
import type Stripe from "stripe";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

        // Fetch business name for admin email
        const { data: bizData } = await admin
          .from("businesses")
          .select("business_name")
          .eq("id", business_id)
          .single();

        // Send admin notification
        const { sendDomainOrderToAdmin } = await import("@/lib/email");
        const ci = contactInfo as Record<string, string>;
        sendDomainOrderToAdmin({
          orderId: createdOrder?.id ?? domain,
          domain,
          tld,
          period: Number(period) || 1,
          totalPrice: Number(total_price) || 0,
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

    console.log("[webhook] checkout.session.completed", { userId, plan });

    if (!userId || !plan) {
      console.error("[webhook] Missing userId or plan in metadata");
      return NextResponse.json({ received: true });
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const { error: profileError } = await admin.from("users_profile").update({
      plan: plan as never,
      plan_expires_at: expiresAt.toISOString(),
      stripe_customer_id: session.customer as string ?? null,
    }).eq("id", userId);

    if (profileError) {
      console.error("[webhook] Profile update failed:", profileError);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    // Clear any active grace period / suspension
    await admin.from("businesses").update({ suspended_until: null }).eq("user_id", userId);

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

    console.log("[webhook] checkout.session.completed — plan updated, suspension cleared:", { userId, plan });
  }

  // ── customer.subscription.deleted ─────────────────────────────────────────
  // Fires when all Stripe payment retries are exhausted and subscription is cancelled.
  // We give a 15-day grace period before suspending the store publicly.
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.user_id;
    if (!userId) return NextResponse.json({ received: true });

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
    const invoice = event.data.object as Stripe.Invoice & {
      subscription_details?: { metadata?: Record<string, string> };
    };

    const userId = invoice.subscription_details?.metadata?.user_id;
    const plan = invoice.subscription_details?.metadata?.plan;

    if (!userId || !plan) return NextResponse.json({ received: true });

    const stripeInvoiceId = invoice.id;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    // 1. Update plan + expiry
    await admin.from("users_profile").update({
      plan: plan as never,
      plan_expires_at: expiresAt.toISOString(),
    }).eq("id", userId);

    // 2. Clear suspension
    await admin.from("businesses").update({ suspended_until: null }).eq("user_id", userId);

    // 3. Check for existing invoice record for this Stripe payment
    const { data: existingInvoice } = await admin
      .from("invoices")
      .select("id, smartbill_series")
      .eq("stripe_invoice_id", stripeInvoiceId)
      .maybeSingle();

    // If invoice exists AND Smartbill already emitted — fully done, skip.
    if (existingInvoice?.smartbill_series) {
      console.log("[webhook] Invoice already fully processed, skipping:", stripeInvoiceId);
      return NextResponse.json({ received: true });
    }

    // 4. Fetch user email and business info for Smartbill
    const [{ data: authUserData }, { data: bizData }, { data: profileData }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from("businesses")
        .select("business_name, address, city, county, cui")
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("users_profile")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    const userEmail = authUserData?.user?.email ?? "";
    const clientName =
      bizData?.business_name ||
      profileData?.full_name ||
      userEmail ||
      "Client";

    const planPrice = PLAN_PRICES[plan] ?? 0;

    // 5. Emit Smartbill invoice
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
        name: `Abonament Edinio ${capitalize(plan)}`,
        price: planPrice,
        quantity: 1,
      }
    );

    if (sbResult.error) {
      sbError = sbResult.error;
      console.error("[webhook] Smartbill failed:", sbError, "| invoice:", stripeInvoiceId);
    } else {
      sbSeries = sbResult.series ?? null;
      sbNumber = sbResult.number ?? null;
    }

    // 6. Insert or update invoice record
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
        status: "issued",
      });

      if (invoiceError) {
        console.error("[webhook] Failed to save invoice record:", invoiceError);
      } else {
        console.log("[webhook] Invoice saved:", { userId, plan, sbSeries, sbNumber, sbError });
      }
    }

    console.log("[webhook] invoice.payment_succeeded processed:", { userId, plan });
  }

  // ── invoice.payment_failed ───────────────────────────────────────────────
  // Fires when Stripe fails to charge the customer's payment method.
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription_details?: { metadata?: Record<string, string> };
    };

    const userId = invoice.subscription_details?.metadata?.user_id;
    const plan = invoice.subscription_details?.metadata?.plan;

    if (userId && plan) {
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
      console.log("[webhook] invoice.payment_failed — email sent:", { userId, plan });
    }
  }

  return NextResponse.json({ received: true });
}
