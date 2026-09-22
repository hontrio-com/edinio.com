import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Callout } from "@/components/ui/callout";
import { Skeleton } from "@/components/ui/skeleton";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { PepitaClient } from "@/components/dashboard/PepitaClient";
import { getStarePepita } from "@/lib/actions/pepita.actions";

/**
 * Pepita.com.
 *
 * ⚠ PE TOT ECRANUL, ca la Trendyol, si din acelasi motiv. Cerut de el pe
 * 22.09.2026: „Fa acelasi design ca aici la toate marketplace-urile".
 *
 * Pagina are sapte panouri (conexiune, cifre, adrese, tari, setari, produse,
 * catalog si comenzi), iar tarile si adresele stau pe randuri largi. Stransa la
 * `max-w-3xl`, se ingusta pe stanga cu jumatate de ecran gol la dreapta.
 *
 * ⚠ ANTETUL PLEACA INAINTEA STARII. `getStarePepita` face sase numaratori in
 * baza (chei, comenzi, carantina, ultima comanda, produse active, exceptii), iar
 * antetul nu depinde de niciuna: cu starea asteptata inauntrul paginii, primul
 * lucru pe care il vedea comerciantul era un ecran gol.
 */
export default async function PepitaPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  /*
   * ⚠ O CITIRE CAZUTA NU E „n-ai magazin". Citita numai `data`, o pana de baza ar
   * trimite comerciantul inapoi in `/dashboard` fara niciun cuvant, adica exact ce
   * se intampla daca magazinul chiar nu exista. `maybeSingle`, fiindca `single`
   * face din zero randuri o eroare.
   */
  const { data: biz, error } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).maybeSingle();
  if (error) throw new Error("Nu am putut citi magazinul. Încearcă din nou peste câteva momente.");
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-6">
      <IntegrationHeader
        id="pepita"
        description="Trimite produsele și stocul către marketplace-ul Pepita și primește comenzile automat în Edinio."
      />
      <Suspense fallback={<ScheletPepita />}>
        <ContinutPepita businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function ScheletPepita() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-xl sm:h-[168px]" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ContinutPepita({ businessId }: { businessId: string }) {
  const stare = await getStarePepita(businessId);

  if ("error" in stare) {
    /*
     * ⚠ SE SPUNE, nu se arata un panou gol. Un ecran fara nimic pe el se citeste
     * „integrarea nu e pornita", iar comerciantul ar apasa „Pornește" peste o
     * integrare care poate exista deja.
     */
    return (
      <Callout variant="danger" icon={AlertTriangle}>
        {stare.error} Reîncarcă pagina peste câteva momente.
      </Callout>
    );
  }

  return <PepitaClient businessId={businessId} stare={stare} />;
}
