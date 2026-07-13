import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// „Reia plata" din bannerul de plata restanta. Duce userul DIRECT la pagina
// hosted a facturii deschise (past-due), unde poate plati pe loc cu un card nou;
// plata reusita declanseaza `invoice.payment_succeeded` → abonamentul se
// reactiveaza si suspendarea se ridica automat (vezi webhook).
// Daca nu exista factura deschisa (abonament deja sters sau alt caz), cade pe
// portalul Stripe pentru actualizarea cardului / re-abonare.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users_profile")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "Nu exista un abonament asociat contului tau." },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  const customerId = profile.stripe_customer_id;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // 1. Factura restanta (open) → pagina ei hosted plateste pe loc si reactiveaza.
  try {
    const openInvoices = await stripe.invoices.list({
      customer: customerId,
      status: "open",
      limit: 1,
    });
    const invoice = openInvoices.data[0];
    if (invoice?.hosted_invoice_url) {
      return NextResponse.json({ url: invoice.hosted_invoice_url });
    }
  } catch (err) {
    console.error("[retry-payment] invoice lookup failed:", err);
    // continua catre fallback-ul de portal
  }

  // 2. Fallback: portalul Stripe (actualizare card / re-abonare).
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/dashboard`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("[retry-payment] portal session failed:", err);
    return NextResponse.json(
      { error: "Nu am putut deschide plata. Incearca din nou sau contacteaza-ne." },
      { status: 500 }
    );
  }
}
