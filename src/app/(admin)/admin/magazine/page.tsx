import { createAdminClient } from "@/lib/supabase/admin";
import { AdminBusinessesClient } from "@/components/admin/AdminBusinessesClient";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata = { title: "Magazine" };

export default async function AdminBusinessesPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
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

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminBusinessesClient businesses={enriched} />
    </div>
  );
}
