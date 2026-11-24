import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { Callout } from "@/components/ui/callout";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { HontrioClient } from "@/components/dashboard/HontrioClient";
import { conexiuneaActiva, type StareConexiune } from "@/lib/hontrio/conexiuni";
import { SITE_HONTRIO } from "@/lib/parteneri/hontrio";
import { formatDateTime } from "@/lib/utils/format";

/** Hontrio: starea legaturii si deconectarea. Conectarea porneste din Hontrio (vezi `HontrioClient`). */
export default async function HontrioPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  /* ⚠ O citire cazuta nu e „n-ai magazin": vezi aceeasi nota in pagina Pepita. */
  const { data: biz, error } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore")
    .order("created_at").limit(1).maybeSingle();
  if (error) throw new Error("Nu am putut citi magazinul. Încearcă din nou peste câteva momente.");
  if (!biz) redirect("/dashboard");

  let stare: StareConexiune | null = null;
  let citireCazuta = false;
  try {
    stare = await conexiuneaActiva(createAdminClient(), biz.id);
  } catch {
    citireCazuta = true;
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="hontrio"
        description="Campanii Google Ads conduse pe baza catalogului și a vânzărilor tale din Edinio."
      />
      {citireCazuta ? (
        /* ⚠ Se spune, nu se arata „Neconectat": omul ar crede ca legatura s-a rupt. */
        <Callout variant="danger" icon={AlertTriangle}>
          Nu am putut citi starea legăturii cu Hontrio. Reîncarcă pagina peste câteva momente.
        </Callout>
      ) : (
        <HontrioClient
          businessId={biz.id}
          conectat={!!stare}
          conectatLa={stare ? formatDateTime(stare.creataLa) : null}
          ultimaCitire={stare?.ultimaFolosire ? formatDateTime(stare.ultimaFolosire) : null}
          siteHontrio={SITE_HONTRIO}
        />
      )}
    </div>
  );
}
