import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { CategoriesClient } from "@/components/dashboard/CategoriesClient";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function CategoriesPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
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

  // Windowed read: a plain select silently truncates at the 1000-row
  // PostgREST cap and would hide categories from the management UI.
  const categories = await fetchAllRows("dashboard.categories", (from, to) =>
    supabase
      .from("categories")
      .select("id, business_id, parent_id, name, sort_order, image_url, created_at, updated_at")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("created_at")
      .order("id")
      .range(from, to)
  );

  return <CategoriesClient initialCategories={categories} />;
}
