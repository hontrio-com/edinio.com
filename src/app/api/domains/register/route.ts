import { NextRequest, NextResponse } from "next/server";
import { resellerCall } from "@/lib/reseller";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { createClient } from "@/lib/supabase/server";

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
}

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as RegisterBody;
  const { domain, regperiod, businessId, contact } = body;

  if (!domain || !regperiod || !businessId || !contact) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  // Verify the user owns this business before spending money on domain registration
  const supabaseCheck = await createClient();
  const { data: ownedBiz } = await supabaseCheck
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!ownedBiz) {
    return NextResponse.json({ error: "Acces interzis" }, { status: 403 });
  }

  // Validate contact fields required by Reseller.ro
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

  const contactFull = {
    ...contact,
    fullname: `${contact.firstname} ${contact.lastname}`,
    address2: "",
    country: "RO",
  };

  // Register domain via Reseller.ro
  const result = await resellerCall("/order/domains/register", "POST", {
    domain,
    regperiod: String(regperiod),
    nameservers: {
      ns1: process.env.RESELLER_NS1 ?? "ns1.domaincity.ro",
      ns2: process.env.RESELLER_NS2 ?? "ns2.domaincity.ro",
    },
    contacts: {
      registrant: contactFull,
      tech:       contactFull,
      billing:    contactFull,
      admin:      contactFull,
    },
    addons: {
      dnsmanagement:   1,
      emailforwarding: 0,
      idprotection:    0,
    },
  });

  if (result.result !== "success") {
    const msg = (result.message as string) ?? "Inregistrarea a esuat";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Save to domains table (reuse the client from ownership check above)
  const supabase = supabaseCheck;

  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + Number(regperiod));

  await supabase.from("domains").insert({
    business_id: businessId,
    user_id:     user.id,
    domain,
    status:      "active",
    source:      "purchased",
    expiry_date: expiryDate.toISOString().split("T")[0],
    auto_renew:  true,
  });

  // Auto-connect domain to business
  await supabase
    .from("businesses")
    .update({ custom_domain: domain })
    .eq("id", businessId);

  return NextResponse.json({ success: true, domain });
}
