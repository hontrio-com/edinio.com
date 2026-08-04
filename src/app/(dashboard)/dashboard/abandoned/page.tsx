import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getAbandonedCartsData } from "@/lib/actions/abandoned-cart.actions";
import { AbandonedCartsClient } from "@/components/dashboard/AbandonedCartsClient";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function AbandonedCartsPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();
  if (!biz) redirect("/dashboard");

  const data = await getAbandonedCartsData(biz.id);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AbandonedCartsClient businessId={biz.id} data={"error" in data ? null : data} />
    </div>
  );
}
