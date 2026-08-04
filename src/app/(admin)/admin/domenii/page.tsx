import { createAdminClient } from "@/lib/supabase/admin";
import { AdminDomainOrdersClient } from "@/components/admin/AdminDomainOrdersClient";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata = { title: "Comenzi domenii" };

export default async function AdminDomainOrdersPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const admin = createAdminClient();

  // Lista ramane la ultimele 500; harta de business-uri trebuie completa
  // (peste 1000 de magazine, numele apareau "—" din cauza cap-ului PostgREST).
  const [{ data: orders }, businesses] = await Promise.all([
    admin
      .from("domain_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    fetchAllRows("admin.domains.businesses", (f, t) =>
      admin.from("businesses").select("id, business_name, store_name").order("id").range(f, t)),
  ]);

  const bizMap = new Map(
    businesses.map((b) => [b.id, b.store_name ?? b.business_name])
  );

  const enriched = (orders ?? []).map((o) => ({
    ...o,
    contact_info: (o.contact_info ?? {}) as Record<string, string>,
    business_name: bizMap.get(o.business_id) ?? "—",
  }));

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminDomainOrdersClient orders={enriched} />
    </div>
  );
}
