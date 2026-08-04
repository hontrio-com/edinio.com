import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getProductLimit } from "@/lib/plan-limits";
import { ImportEntry } from "@/components/dashboard/import/ImportEntry";
import { createAdminClient } from "@/lib/supabase/admin";
import { listSources, type StockFeedSource } from "@/lib/import/stock-feed/sources";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Cadrul pleaca imediat; alegerea de import curge dupa el.
 *
 * `listSources` merge la baza cu clientul de serviciu si sta DUPA numaratoarea de
 * produse si dupa plan, deci pana acum nimic nu ajungea in browser inainte ca si
 * cea mai lenta dintre ele sa raspunda. Sub `<Suspense>` cadrul se trimite dupa
 * verificarea de proprietar, iar in locul cartonaselor sta scheletul.
 */
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

  return (
    <div className="p-4 sm:p-6">
      <Suspense fallback={<ScheletImport />}>
        <ContinutImport businessId={business.id} userId={user.id} />
      </Suspense>
    </div>
  );
}

function ScheletImport() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}

async function ContinutImport({ businessId, userId }: { businessId: string; userId: string }) {
  const supabase = await createClient();

  const [{ count }, { data: profile }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("users_profile").select("plan").eq("id", userId).single(),
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
    stockSources = await listSources(createAdminClient(), businessId);
  } catch (e) {
    stockSourcesError = e instanceof Error ? e.message : "Sursele nu pot fi citite";
  }

  return (
    <ImportEntry
      plan={plan}
      productLimit={getProductLimit(plan)}
      productCount={count ?? 0}
      stockSources={stockSources}
      stockSourcesError={stockSourcesError}
    />
  );
}
