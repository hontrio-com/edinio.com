import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { EpacketConfigClient } from "@/components/dashboard/EpacketConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { EpacketConfig } from "@/lib/epacket/client";
import { expeditorDinMagazin, type ExpeditorPropus } from "@/lib/curiera/precompletare";

export default async function EpacketPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste cheia API cu un substituent inainte sa ajunga in browser.
   * E singura credentiala: cine o are emite AWB-uri TAXATE din creditul comerciantului.
   */
  const config = (mascheazaConfig("epacket_config", settings?.epacket_config) as EpacketConfig | null) ?? null;

  /*
   * Adresa de ridicare propusa din datele magazinului, NUMAI cat timp omul n-a salvat niciun camp
   * al ei. De la e-packet nu vine nicio adresa (API-ul n-are profil de cont).
   */
  let propunere: ExpeditorPropus | null = null;
  const e = config?.expeditor;
  const areSalvat = !!e && Object.values(e).some((v) => (typeof v === "string" && v.trim() !== "") || typeof v === "number");
  if (!areSalvat) {
    const supabase = await createClient();
    const { data: firma } = await supabase
      .from("businesses")
      .select("business_name, store_name, store_address, store_city, store_county, address, city, county, phone, email")
      .eq("id", business.id)
      .maybeSingle();
    propunere = expeditorDinMagazin(firma);
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="epacket"
        description="Un singur cont si un singur credit pentru DPD, Sameday, Cargus, FAN Courier, Dragon Star si TCE: AWB-uri din comenzi, la adresa sau la locker, cu ramburs, tarife pe loc si urmarirea coletului."
      />
      <EpacketConfigClient businessId={business.id} initialConfig={config} propunere={propunere} />
    </div>
  );
}
