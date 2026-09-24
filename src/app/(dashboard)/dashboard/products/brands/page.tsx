import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { BranduriClient } from "@/components/dashboard/BranduriClient";

/**
 * Produse > Branduri: toate brandurile magazinului, cu cate produse are fiecare.
 *
 * ⚠ Magazinul se alege EXACT ca in lista de produse (cel mai nou al utilizatorului),
 * ca numerele de aici si filtrul de brand din lista sa vorbeasca despre acelasi magazin.
 */
export default async function BranduriPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  const [{ data: branduri }, { count: totalProduse }] = await Promise.all([
    supabase.rpc("produse_branduri", { p_business: business.id }),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id),
  ]);

  return (
    <BranduriClient
      businessId={business.id}
      branduri={(branduri ?? []).map((b) => ({ brand: b.brand, produse: Number(b.produse) }))}
      totalProduse={totalProduse ?? 0}
    />
  );
}
