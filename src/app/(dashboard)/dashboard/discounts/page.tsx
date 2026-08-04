import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { DiscountsClient } from "@/components/dashboard/DiscountsClient";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function DiscountsPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("businesses")
    .select("id, discounts(id, business_id, code, type, value, min_order_amount, max_uses, uses_count, is_active, expires_at, created_at, updated_at)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!row) redirect("/dashboard");

  const discounts = Array.isArray(row.discounts) ? row.discounts : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <DiscountsClient discounts={discounts} businessId={row.id} />
    </div>
  );
}
