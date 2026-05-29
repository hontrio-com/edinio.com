import { NextRequest, NextResponse } from "next/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { createClient } from "@/lib/supabase/server";
import { sendDomainOrderToAdmin } from "@/lib/email";

interface ContactInfo {
  firstname: string;
  lastname: string;
  email: string;
  phonenumber: string;
  address1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  companyname: string;
}

interface RegisterBody {
  domain: string;
  regperiod: number;
  businessId: string;
  contact: ContactInfo;
  pricePerYear: number;
}

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as RegisterBody;
  const { domain, regperiod, businessId, contact, pricePerYear } = body;

  if (!domain || !regperiod || !businessId || !contact) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  // Verify ownership
  const supabase = await createClient();
  const { data: ownedBiz } = await supabase
    .from("businesses").select("id, business_name").eq("id", businessId).eq("user_id", user.id).single();
  if (!ownedBiz) {
    return NextResponse.json({ error: "Acces interzis" }, { status: 403 });
  }

  // Validate contact fields
  const required: (keyof ContactInfo)[] = [
    "firstname", "lastname", "email", "phonenumber",
    "address1", "city", "state", "postcode",
  ];
  for (const field of required) {
    if (!contact[field]?.trim()) {
      return NextResponse.json(
        { error: `Campul ${field} este obligatoriu` },
        { status: 400 }
      );
    }
  }

  // Extract TLD
  const tld = "." + domain.split(".").slice(1).join(".");
  const totalPrice = (pricePerYear || 0) * regperiod;

  // Save as domain order (manual fulfillment)
  const { data: order, error } = await supabase
    .from("domain_orders")
    .insert({
      business_id: businessId,
      user_id: user.id,
      domain,
      tld,
      period: regperiod,
      price_per_year: pricePerYear || 0,
      total_price: totalPrice,
      status: "pending",
      contact_info: contact as unknown as Record<string, string>,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Nu am putut salva comanda" }, { status: 500 });
  }

  // Send notification email to admin
  sendDomainOrderToAdmin({
    orderId: order.id,
    domain,
    tld,
    period: regperiod,
    totalPrice,
    customerName: `${contact.firstname} ${contact.lastname}`,
    customerEmail: contact.email,
    businessName: ownedBiz.business_name,
  }).catch(() => {});

  return NextResponse.json({ success: true, orderId: order.id });
}
