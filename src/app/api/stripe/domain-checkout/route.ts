import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { calculeazaTotal } from "@/lib/domains/preturi";

interface DomainCheckoutBody {
  domain: string;
  tld: string;
  period: number;
  /** Trimis de interfata, IGNORAT de server. Pretul se recalculeaza din lib/domains/preturi. */
  pricePerYear?: number;
  businessId: string;
  contact: {
    entityType: "pf" | "pj";
    firstname: string;
    lastname: string;
    fullname: string;
    companyname: string;
    cnp: string;
    cui: string;
    email: string;
    phonenumber: string;
    address1: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const body = (await req.json()) as DomainCheckoutBody;
  // `pricePerYear` din corpul cererii se IGNORA deliberat: pretul se recalculeaza
  // pe server. Inainte ajungea direct in `unit_amount`, deci oricine intercepta
  // cererea cumpara un domeniu .ro cu 1 leu in loc de 60.
  const { domain, tld, period, businessId, contact } = body;

  if (!domain || !tld || !period || !businessId || !contact) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  const pret = calculeazaTotal(tld, period);
  if (!pret) {
    return NextResponse.json({ error: "Extensie sau perioada invalida." }, { status: 400 });
  }

  // Verify ownership
  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();

  if (!biz) {
    return NextResponse.json({ error: "Acces interzis" }, { status: 403 });
  }

  const totalPrice = pret.total;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "ron",
          unit_amount: totalPrice * 100, // Stripe uses cents
          product_data: {
            name: `Domeniu ${domain}`,
            description: `Inregistrare domeniu ${domain} pentru ${pret.ani} ${pret.ani === 1 ? "an" : "ani"}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${siteUrl}/dashboard/settings?domain_success=1`,
    cancel_url: `${siteUrl}/dashboard/settings?domain_cancel=1`,
    customer_email: user.email,
    metadata: {
      type: "domain_order",
      user_id: user.id,
      business_id: businessId,
      domain,
      tld,
      // Valorile RECALCULATE pe server, nu cele primite de la client: webhookul
      // creeaza comanda de domeniu din aceste metadate.
      period: String(pret.ani),
      price_per_year: String(pret.peAn),
      total_price: String(totalPrice),
      contact: JSON.stringify(contact),
    },
  });

  return NextResponse.json({ url: session.url });
}
