import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { addDomainToVercel, removeDomainFromVercel } from "@/lib/vercel";
import { valideazaDomeniuClient } from "@/lib/platform-hosts";

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
  domeniu: string,
  businessIdCurent: string,
): Promise<void> {
  // Cautarea trebuie facuta cu SERVICE ROLE, nu cu clientul utilizatorului:
  // RLS ii arata userului doar magazinele PUBLICATE plus ale lui, deci un
  // magazin nepublicat al altui comerciant care foloseste acelasi domeniu era
  // invizibil aici si domeniul i se stergea din Vercel de sub picioare.
  const { data: altele } = await createAdminClient()
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

  // Valideaza INAINTE de orice apel catre Vercel si inainte de orice scriere:
  // sintaxa de hostname + refuzul gazdelor platformei (edinio.com, *.edinio.com,
  // *.vercel.app, localhost). Fara asta, un comerciant putea revendica domeniul
  // platformei si, la deconectare, il stergea din proiectul Vercel.
  // Normalizeaza tot aici la apex (Vercel inregistreaza geamanul www ca
  // redirectare, iar proxy-ul trimite www → apex).
  const verdict = valideazaDomeniuClient(domain);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.motiv }, { status: 400 });
  }
  const clean = verdict.domeniu;

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

  // Domeniul e UNIQUE in baza, dar verificam explicit ca sa dam un mesaj clar in
  // loc de eroarea 23505 si ca sa nu atingem Vercel degeaba pentru un domeniu
  // deja luat de alt magazin (inclusiv unul nepublicat, invizibil prin RLS).
  const { data: ocupat } = await createAdminClient()
    .from("businesses").select("id").eq("custom_domain", clean).neq("id", businessId).limit(1);
  if (ocupat && ocupat.length > 0) {
    return NextResponse.json(
      { error: "Acest domeniu este deja conectat la alt magazin." },
      { status: 409 },
    );
  }

  // Remove old domain from Vercel if switching
  if (biz.custom_domain && biz.custom_domain !== clean) {
    await stergeDacaNuIlMaiFoloseseNimeni(biz.custom_domain, businessId);
  }

  // Add new domain to Vercel project
  const vercelResult = await addDomainToVercel(clean);
  if (!vercelResult.success) {
    return NextResponse.json(
      { error: vercelResult.error ?? "Nu am putut adauga domeniul pe Vercel" },
      { status: 500 }
    );
  }

  // Save to database. `custom_domain` e coloana privilegiata (fara grant de
  // UPDATE pentru `authenticated`), tocmai ca sa nu poata fi scrisa direct din
  // browser, ocolind validarea de mai sus si sincronizarea cu Vercel. Scrierea
  // ramane legata de `user_id` ca sa nu depinda doar de grant.
  const { error } = await createAdminClient()
    .from("businesses")
    .update({ custom_domain: clean })
    .eq("id", businessId)
    .eq("user_id", user.id);

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
  await createAdminClient()
    .from("businesses")
    .update({ custom_domain: null })
    .eq("id", businessId)
    .eq("user_id", user.id);

  // Then remove from Vercel
  await stergeDacaNuIlMaiFoloseseNimeni(domainToRemove, businessId);

  return NextResponse.json({ success: true });
}
