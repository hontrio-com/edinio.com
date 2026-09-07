import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { PepitaClient } from "@/components/dashboard/PepitaClient";
import { getStarePepita } from "@/lib/actions/pepita.actions";

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

  const stare = await getStarePepita(biz.id);

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader
        id="pepita"
        description="Trimite produsele și stocul către marketplace-ul Pepita și primește comenzile automat în Edinio."
      />
      {"error" in stare ? (
        /*
         * ⚠ SE SPUNE, nu se arata un panou gol. Un ecran fara nimic pe el se citeste
         * „integrarea nu e pornita", iar comerciantul ar apasa „Pornește" peste o
         * integrare care poate exista deja.
         */
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-foreground">
          {stare.error} Reîncarcă pagina peste câteva momente.
        </p>
      ) : (
        <PepitaClient businessId={biz.id} stare={stare} />
      )}
    </div>
  );
}
