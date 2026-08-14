import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { InnoshipConfigClient } from "@/components/dashboard/InnoshipConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { InnoshipConfig } from "@/lib/innoship/client";

export default async function InnoshipPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ Configurarea se citeste cu SERVICE ROLE, nu din `settings` de mai sus.
   *
   * `webhook_secret` e criptat in repaus, dar NU e mascat — omul trebuie sa poata
   * copia URL-ul. Pe clientul comerciantului i-ar sosi `enc.v1.…`, deci ar lipi in
   * portalul Innoship o adresa pe care ruta noastra (care cauta pe valoarea
   * decriptata) n-o mai potriveste cu niciun magazin. Exact cazul
   * `notice_config.webhook_secret`.
   */
  const { data: rand } = await createAdminClient()
    .from("store_settings").select("innoship_config").eq("business_id", business.id).single();

  const config = (mascheazaConfig("innoship_config", rand?.innoship_config) as InnoshipConfig | null) ?? null;

  /*
   * Curierii pornit direct, pentru avertismentul de suprapunere (varianta B).
   * Se citesc din chiar zonele de livrare — adica din ce vede cumparatorul azi.
   */
  const zone = (settings?.shipping_zones ?? {}) as Record<string, { enabled?: boolean }>;
  const curieriActiviDirect = Object.entries(zone)
    .filter(([id, z]) => z?.enabled && id !== "innoship")
    .map(([id]) => id);

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="innoship"
        description="Un singur cont, zeci de curieri: cumparatorul alege oferta in checkout, tu emiti dintr-un singur loc."
      />
      <InnoshipConfigClient
        businessId={business.id}
        initialConfig={config}
        curieriActiviDirect={curieriActiviDirect}
        /* Aceeasi cadere ca la notice.ro, care compune la fel URL-ul lui de webhook. */
        baseUrl={process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com"}
      />
    </div>
  );
}
