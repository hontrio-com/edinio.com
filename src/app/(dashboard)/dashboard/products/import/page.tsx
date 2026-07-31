import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getProductLimit } from "@/lib/plan-limits";
import { ImportEntry } from "@/components/dashboard/import/ImportEntry";
import { createAdminClient } from "@/lib/supabase/admin";
import { listSources, type StockFeedSource } from "@/lib/import/stock-feed/sources";

export default async function ImportProductsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  const [{ count }, { data: profile }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id),
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
  ]);

  const plan = profile?.plan ?? "free";

  /*
   * Sursele de feed automat, incarcate aici ca sa nu fie nevoie de o preluare la
   * montare in client.
   *
   * Invelit in try/catch dinadins: pana se aplica migratia care creeaza
   * `stock_feed_sources`, interogarea esueaza. O eroare necontrolata aici ar
   * darama TOATA pagina de import, inclusiv importul de produse, care n-are nicio
   * legatura. Asa, doar fila de sincronizare automata spune ca nu e pregatita.
   */
  let stockSources: StockFeedSource[] = [];
  let stockSourcesError: string | null = null;
  try {
    stockSources = await listSources(createAdminClient(), business.id);
  } catch (e) {
    stockSourcesError = e instanceof Error ? e.message : "Sursele nu pot fi citite";
  }

  return (
    <div className="p-4 sm:p-6">
      <ImportEntry
        plan={plan}
        productLimit={getProductLimit(plan)}
        productCount={count ?? 0}
        stockSources={stockSources}
        stockSourcesError={stockSourcesError}
      />
    </div>
  );
}
