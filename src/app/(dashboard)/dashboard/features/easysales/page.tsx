import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { EasySalesConfigClient } from "@/components/dashboard/EasySalesConfigClient";
import { getEasySalesStatus } from "@/lib/actions/easysales.actions";

/**
 * easySales: comenzile magazinului se proceseaza in easySales (factura, AWB), iar starea se
 * intoarce in Edinio. Planul intreg: `docs/marketplace/EASYSALES-PLAN.md`.
 *
 * ⚠ PE TOT ECRANUL, ca la eMAG si Trendyol: pagina are conexiunea, comenzile, setarile si lista
 * comenzilor de verificat. Antetul pleaca inaintea starii (care face cateva numaratori in baza).
 */
export default async function EasySalesPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-6">
      <IntegrationHeader id="easysales" description="Comenzile magazinului se procesează în easySales, iar statusul și AWB-ul se întorc în Edinio." />
      <Suspense fallback={<Schelet />}>
        <Continut businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function Schelet() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

async function Continut({ businessId }: { businessId: string }) {
  const stare = await getEasySalesStatus(businessId);
  if ("error" in stare) {
    return <p className="text-sm text-destructive">{stare.error}</p>;
  }
  return <EasySalesConfigClient businessId={businessId} stare={stare} />;
}
