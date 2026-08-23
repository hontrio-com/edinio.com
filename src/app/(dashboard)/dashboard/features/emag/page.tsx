import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { EmagClient } from "@/components/dashboard/EmagClient";
import { getEmagStatus } from "@/lib/actions/emag.actions";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * eMAG Marketplace.
 *
 * Antetul pleaca imediat, starea curge dupa el — aceeasi forma ca la About You, si
 * din acelasi motiv: `getEmagStatus` face cinci numaratori in baza, iar antetul
 * (link de intoarcere, sigla, descriere) nu depinde de niciuna.
 *
 * ⚠ La eMAG mai e un motiv, care nu exista la celelalte: pagina asta poarta
 * PRERECHIZITUL DE IP. Comerciantul trebuie sa vada adresa de albit inainte sa
 * incerce ceva, iar daca antetul ar astepta starea, primul lucru pe care il vede
 * ar fi un ecran gol.
 */
export default async function EmagPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader
        id="emag"
        description="Vinde pe eMAG direct din Edinio: publici produsele, primești comenzile și trimiți facturile, fără să mai intri în panoul lor."
      />
      <Suspense fallback={<ScheletEmag />}>
        <ContinutEmag businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function ScheletEmag() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ContinutEmag({ businessId }: { businessId: string }) {
  const stare = await getEmagStatus(businessId);
  return <EmagClient businessId={businessId} status={"error" in stare ? null : stare} />;
}
