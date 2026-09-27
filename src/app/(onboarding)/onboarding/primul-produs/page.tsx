import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { PrimulProdusClient } from "./PrimulProdusClient";

/*
 * Pasul 4: primul produs, IMEDIAT dupa crearea magazinului (27.09.2026).
 *
 * Masurat in productie pe 90 de zile: 26 din 41 de magazine noi n-au adaugat
 * niciodata un produs, iar 30 din 33 de testari gratuite au expirat fara plata.
 * Omul ajungea intr-un panou plin, cu un magazin gol, si pleca. Aici are un
 * singur lucru de facut, cu „Sar peste" la vedere.
 */
export default async function PrimulProdusPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: magazin } = await supabase
    .from("businesses")
    .select("id, slug, business_name, store_name, primary_color, is_published")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!magazin) redirect("/onboarding/details");

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("business_id", magazin.id);

  return (
    <PrimulProdusClient
      businessId={magazin.id}
      slug={magazin.slug}
      numeMagazin={(magazin.store_name || magazin.business_name || "").trim()}
      publicat={!!magazin.is_published}
      areProduse={(count ?? 0) > 0}
    />
  );
}
