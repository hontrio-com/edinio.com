import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { addDomainToVercel, removeDomainFromVercel } from "@/lib/vercel";

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { domain, businessId } = (await req.json()) as {
    domain: string;
    businessId: string;
  };

  if (!domain || !businessId) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  const clean = domain.trim().toLowerCase();

  const supabase = await createClient();

  // Verify ownership
  const { data: biz } = await supabase
    .from("businesses")
    .select("id, custom_domain")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();

  if (!biz) {
    return NextResponse.json({ error: "Afacere negasita" }, { status: 404 });
  }

  // Remove old domain from Vercel if switching
  if (biz.custom_domain && biz.custom_domain !== clean) {
    await removeDomainFromVercel(biz.custom_domain);
  }

  // Add new domain to Vercel project
  const vercelResult = await addDomainToVercel(clean);
  if (!vercelResult.success) {
    return NextResponse.json(
      { error: vercelResult.error ?? "Nu am putut adauga domeniul pe Vercel" },
      { status: 500 }
    );
  }

  // Save to database
  const { error } = await supabase
    .from("businesses")
    .update({ custom_domain: clean })
    .eq("id", businessId);

  if (error) {
    return NextResponse.json({ error: "Nu am putut salva domeniul" }, { status: 500 });
  }

  return NextResponse.json({ success: true, domain: clean });
}

export async function DELETE(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { businessId } = (await req.json()) as { businessId: string };
  if (!businessId) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, custom_domain")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();

  if (!biz || !biz.custom_domain) {
    return NextResponse.json({ error: "Niciun domeniu de deconectat" }, { status: 404 });
  }

  const domainToRemove = biz.custom_domain;

  // Clear from DB first (safe side — if Vercel fails, DB is clean)
  await supabase
    .from("businesses")
    .update({ custom_domain: null })
    .eq("id", businessId);

  // Then remove from Vercel
  await removeDomainFromVercel(domainToRemove);

  return NextResponse.json({ success: true });
}
