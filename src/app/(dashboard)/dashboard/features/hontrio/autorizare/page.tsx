import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { Callout } from "@/components/ui/callout";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { HontrioAutorizareClient } from "@/components/dashboard/HontrioAutorizareClient";
import { conexiuneaActiva } from "@/lib/hontrio/conexiuni";
import { cerereaCurenta } from "@/lib/hontrio/in-asteptare";

/**
 * Ecranul de aprobare a cererii Hontrio (RFC 6749, 4.1.1: „the authorization server authenticates the
 * resource owner and obtains an authorization decision").
 *
 * Aici ajunge omul din `/api/hontrio/v1/autorizare`, direct sau dupa logare (prin `/dashboard`, vezi
 * `cerereInAsteptare`). Cererea sta in cookie; pagina doar o arata, iar codul il face abia actiunea
 * „Permite accesul".
 *
 * ⚠ FARA REDIRECTARI CATRE `/dashboard` cand ceva lipseste. `/dashboard` trimite inapoi aici cat timp
 * cookie-ul e valid, deci o redirectare in sens invers ar fi facut o bucla. Pagina SPUNE ce lipseste.
 */
export default async function AutorizareHontrioPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: biz, error } = await supabase
    .from("businesses").select("id, store_name, business_name")
    .eq("user_id", user.id).eq("type", "ministore")
    .order("created_at").limit(1).maybeSingle();
  if (error) throw new Error("Nu am putut citi magazinul. Încearcă din nou peste câteva momente.");

  const cerere = await cerereaCurenta();

  let dejaConectat = false;
  if (biz && cerere) {
    try {
      dejaConectat = !!(await conexiuneaActiva(createAdminClient(), biz.id));
    } catch {
      /* Avertismentul e informativ: fara el, aprobarea tot inlocuieste corect legatura veche. */
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="hontrio" description="Aprobă sau refuză cererea de conectare venită de la Hontrio." />
      {!biz ? (
        <Callout variant="warning">
          Contul tău nu are încă un magazin Edinio. Creează magazinul, apoi pornește din nou conectarea din Hontrio.
        </Callout>
      ) : !cerere ? (
        <Callout variant="neutral" icon={Clock}>
          Nu există nicio cerere de conectare în așteptare, sau cea pornită a expirat (o cerere este valabilă 10 minute).
          Pornește din nou conectarea din contul tău Hontrio.
        </Callout>
      ) : (
        <HontrioAutorizareClient
          numeMagazin={biz.store_name?.trim() || biz.business_name}
          dejaConectat={dejaConectat}
          gazdaHontrio={new URL(cerere.redirectUri).host}
        />
      )}
    </div>
  );
}
