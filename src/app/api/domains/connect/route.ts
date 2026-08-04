import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { addDomainToVercel, removeDomainFromVercel } from "@/lib/vercel";

/**
 * Scoate domeniul din Vercel doar daca niciun ALT magazin nu-l mai foloseste.
 *
 * Pana acum se stergea neconditionat. Doi clienti care ating acelasi domeniu — sau
 * unul care il muta de pe un magazin pe altul in doi pasi — si primul il rupea pe
 * al doilea: domeniul disparea din proiectul Vercel in timp ce magazinul celuilalt
 * il avea inca scris in baza si ii arata clientului „conectat". E aceeasi clasa cu
 * `addOne`, care inghitea „already in use" drept succes.
 */
async function stergeDacaNuIlMaiFoloseseNimeni(
  supabase: Awaited<ReturnType<typeof createClient>>,
  domeniu: string,
  businessIdCurent: string,
): Promise<void> {
  const { data: altele } = await supabase
    .from("businesses").select("id").eq("custom_domain", domeniu).neq("id", businessIdCurent).limit(1);
  if (altele && altele.length > 0) return;
  await removeDomainFromVercel(domeniu);
}

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

  // Store the apex as canonical (Vercel registers the www twin as a redirect to
  // it, and the proxy redirects www → apex), so normalize a pasted "www." away.
  const clean = domain.trim().toLowerCase().replace(/^www\./, "");

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
    await stergeDacaNuIlMaiFoloseseNimeni(supabase, biz.custom_domain, businessId);
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
  await stergeDacaNuIlMaiFoloseseNimeni(supabase, domainToRemove, businessId);

  return NextResponse.json({ success: true });
}
