import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { OlxClient } from "@/components/dashboard/OlxClient";
import { getOlxStatus, getOlxAdverts } from "@/lib/actions/olx.actions";

/**
 * OLX Marketplace.
 *
 * ⚠ PE TOT ECRANUL, ca la Trendyol si eMAG, si din acelasi motiv. Cerut de el pe
 * 22.09.2026.
 *
 * Pagina are opt panouri (sanatate, cifre, setari, GPSR, maparea categoriilor,
 * contul OLX, mesajele cumparatorilor, importul anunturilor vechi si lista de
 * anunturi). Stransa la `max-w-3xl`, se ingusta pe stanga cu jumatate de ecran
 * gol la dreapta, iar randurile listei de anunturi se rupeau pe doua linii.
 *
 * ⚠ ANTETUL PLEACA INAINTEA STARII. `getOlxStatus` face noua numaratori in baza,
 * `getOlxAdverts` citeste lista, iar citirea categoriilor trece prin TOT
 * catalogul, o mie de randuri o data: la un magazin mare, cu antetul inauntru,
 * primul lucru pe care il vedea comerciantul era un ecran gol.
 */
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

  return (
    <div className="p-6">
      <IntegrationHeader id="olx" description="Publică-ți produsele ca anunțuri pe OLX.ro și gestionează-le din Edinio." />
      <Suspense fallback={<ScheletOlx />}>
        <ContinutOlx businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function ScheletOlx() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-xl sm:h-[168px]" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ContinutOlx({ businessId }: { businessId: string }) {
  const supabase = await createClient();
  const status = await getOlxStatus(businessId);
  /*
    ⚠ PRIMA PAGINĂ, NU TOT TABELUL (22.09.2026). Citirea aducea 200 de anunțuri și tăcea despre
    restul. Acum vine o pagină de 50, cu numărul adevărat lângă ea, iar `AdvertTable` cere singur
    paginile următoare. Prima rămâne randată pe server, ca ecranul să nu se nască gol.
  */
  const rAdverts = "error" in status
    ? { adverts: [], total: 0, pagini: 1, deLa: 0 }
    : await getOlxAdverts(businessId, 1);
  /*
    ⚠ Lista nu se poate citi: se arată goală, dar cu spusa alături. Un tabel gol fără explicație e
    tocmai zeroul care liniștește — iar de aici omul apasă „Publică tot".
  */
  const adverts = "error" in rAdverts ? [] : rAdverts.adverts;
  const advertsTotal = "error" in rAdverts ? 0 : rAdverts.total;
  const advertsPagini = "error" in rAdverts ? 1 : rAdverts.pagini;
  const advertsDeLa = "error" in rAdverts ? 0 : rAdverts.deLa;
  const advertsError = "error" in rAdverts ? rAdverts.error : null;

  // Distinct product categories, windowed past the 1000-row PostgREST cap.
  const catRows: { category: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("products").select("category").eq("business_id", businessId).not("category", "is", null)
      .order("id").range(from, from + 999);
    catRows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const categories = [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort();

  return (
    <OlxClient
      businessId={businessId}
      status={"error" in status ? null : status}
      adverts={adverts}
      advertsTotal={advertsTotal}
      advertsPagini={advertsPagini}
      advertsDeLa={advertsDeLa}
      advertsError={advertsError}
      categories={categories}
    />
  );
}
