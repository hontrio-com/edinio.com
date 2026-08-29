import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { OlxClient } from "@/components/dashboard/OlxClient";
import { getOlxStatus, getOlxAdverts } from "@/lib/actions/olx.actions";

export default async function OlxPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  /*
    ⚠ O CITIRE CAZUTA NU E „n-ai magazin" (02.09.2026). Se citea numai `data`, iar o pană de bază
    trimitea comerciantul înapoi în `/dashboard` fără niciun cuvânt — adică exact ce se întâmplă dacă
    magazinul chiar nu există. `maybeSingle`, fiindcă `single` face din zero rânduri o eroare.
  */
  const { data: biz, error: eBiz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).maybeSingle();
  if (eBiz) throw new Error("Nu am putut citi magazinul. Încearcă din nou peste câteva momente.");
  if (!biz) redirect("/dashboard");

  const status = await getOlxStatus(biz.id);
  const rAdverts = "error" in status ? { adverts: [] } : await getOlxAdverts(biz.id);
  /*
    ⚠ Lista nu se poate citi: se arată goală, dar cu spusa alături. Un tabel gol fără explicație e
    tocmai zeroul care liniștește — iar de aici omul apasă „Publică tot".
  */
  const adverts = "error" in rAdverts ? [] : rAdverts.adverts;
  const advertsError = "error" in rAdverts ? rAdverts.error : null;

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
        advertsError={advertsError}
        categories={categories}
      />
    </div>
  );
}
