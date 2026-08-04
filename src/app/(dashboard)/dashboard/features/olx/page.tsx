import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { OlxClient } from "@/components/dashboard/OlxClient";
import { getOlxStatus, getOlxAdverts } from "@/lib/actions/olx.actions";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function OlxPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const status = await getOlxStatus(biz.id);
  const adverts = "error" in status ? [] : await getOlxAdverts(biz.id);

  // Distinct product categories, windowed past the 1000-row PostgREST cap.
  const catRows: { category: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("products").select("category").eq("business_id", biz.id).not("category", "is", null)
      .order("id").range(from, from + 999);
    catRows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const categories = [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort();

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="olx" description="Publică-ți produsele ca anunțuri pe OLX.ro și gestionează-le din Edinio." />
      <OlxClient
        businessId={biz.id}
        status={"error" in status ? null : status}
        adverts={adverts}
        categories={categories}
      />
    </div>
  );
}
