import { createAdminClient } from "@/lib/supabase/admin";
import { AdminOrdersClient } from "@/components/admin/AdminOrdersClient";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata = { title: "Comenzi" };

export default async function AdminOrdersPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const admin = createAdminClient();

  // Lista ramane intentionat la ultimele 500 de comenzi (jurnal recent), dar
  // harta de business-uri trebuie completa — peste 1000 de magazine, numele
  // apareau "—" din cauza cap-ului PostgREST.
  const [{ data: orders }, businesses] = await Promise.all([
    admin.from("orders").select("id, order_number, customer_name, customer_phone, customer_email, total, status, payment_method, created_at, business_id, shipping_address").order("created_at", { ascending: false }).limit(500),
    fetchAllRows("admin.orders.businesses", (f, t) =>
      admin.from("businesses").select("id, business_name, store_name").order("id").range(f, t)),
  ]);

  const bizMap = new Map(businesses.map((b) => [b.id, b.store_name ?? b.business_name]));

  const enriched = (orders ?? []).map((o) => ({
    ...o,
    business_name: bizMap.get(o.business_id) ?? "—",
  }));

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminOrdersClient orders={enriched} />
    </div>
  );
}
