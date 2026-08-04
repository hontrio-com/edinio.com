import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminBusinessesClient } from "@/components/admin/AdminBusinessesClient";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Magazine" };

/**
 * Coaja paginii pleaca imediat; tabelul curge dupa ea.
 *
 * Cele trei `fetchAllRows` citesc TOATE magazinele, TOATE profilurile si TOATE
 * comenzile platformei in ferestre de cate 1000 de randuri — deci mai multe
 * dus-intors inainte sa se poata trimite ceva. Sub `<Suspense>` asteapta doar
 * tabelul, nu pagina intreaga.
 */
export default function AdminBusinessesPage() {
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Suspense fallback={<ScheletMagazine />}>
        <ListaMagazine />
      </Suspense>
    </div>
  );
}

function ScheletMagazine() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40 rounded-xl" />

      {/* cele trei cifre de sus */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px] rounded-xl" />
        ))}
      </div>

      {/* cautare si filtre */}
      <div className="flex gap-3">
        <Skeleton className="h-9 flex-1 min-w-48" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>

      {/* tabelul */}
      <Skeleton className="h-[520px] rounded-2xl" />
    </div>
  );
}

async function ListaMagazine() {
  const admin = createAdminClient();

  // Ferestre .range() peste cap-ul silentios de 1000 de randuri PostgREST.
  const [businesses, profiles] = await Promise.all([
    fetchAllRows("admin.businesses.list", (f, t) =>
      admin.from("businesses").select("*").order("created_at", { ascending: false }).order("id").range(f, t)),
    fetchAllRows("admin.businesses.profiles", (f, t) =>
      admin.from("users_profile").select("id, full_name, plan").order("id").range(f, t)),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // Order counts per business
  const orderCounts = await fetchAllRows("admin.businesses.orderCounts", (f, t) =>
    admin.from("orders").select("business_id").order("id").range(f, t));
  const orderMap: Record<string, number> = {};
  for (const o of orderCounts) {
    orderMap[o.business_id] = (orderMap[o.business_id] ?? 0) + 1;
  }

  const enriched = businesses.map((b) => ({
    ...b,
    owner: profileMap.get(b.user_id) ?? null,
    orders_count: orderMap[b.id] ?? 0,
  }));

  return <AdminBusinessesClient businesses={enriched} />;
}
