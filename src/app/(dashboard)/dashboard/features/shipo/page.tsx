import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { ShipoConfigClient } from "@/components/dashboard/ShipoConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { ShipoConfig } from "@/lib/shipo/client";

export default async function ShipoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste cheia de API cu un substituent inainte sa
   * ajunga in browser. Restul configurarii pleaca intreaga, si asa trebuie:
   * adresa de ridicare nu e credentiala, iar comerciantul trebuie s-o poata
   * reciti ca sa stie de unde pleaca marfa.
   *
   * ⚠ Daca `shipo_config` n-ar fi in `CAMPURI_SECRETE`, functia ar intoarce
   * configul NEATINS — adica exact cheia de API in HTML-ul paginii, tacut.
   */
  const config = (mascheazaConfig("shipo_config", settings?.shipo_config) as ShipoConfig | null) ?? null;

  /*
   * Curierii pe care magazinul ii are deja pornit pe cont propriu. Servesc doar
   * avertismentului de suprapunere: acelasi curier poate ajunge in checkout si
   * direct, si prin Innoship, si prin SmartShip, si acum prin Shipo.
   */
  const activ = (c: unknown, ...campuri: string[]) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return !!o.enabled && campuri.every((k) => !!String(o[k] ?? "").trim());
  };
  const activiDirect = [
    activ(settings?.cargus_config, "username", "subscription_key") ? "cargus" : "",
    activ(settings?.dpd_config, "username", "client_id") ? "dpd" : "",
    activ(settings?.fan_courier_config, "username", "client_id") ? "fan-courier" : "",
    activ(settings?.sameday_config, "username") ? "sameday" : "",
    activ(settings?.gls_config, "username", "client_number") ? "gls" : "",
    activ(settings?.posta_config, "username", "cod_trimitere") ? "posta" : "",
    /* FedEx e integrare directa din 16.08.2026, si Shipo il revinde — deci se poate
       suprapune, ca oricare dintre ceilalti sase. */
    activ(settings?.fedex_config, "client_id", "client_secret", "account_number") ? "fedex" : "",
  ].filter(Boolean);

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="shipo"
        description="Colete prin Shipo.ro: un cont, mai multi curieri (FAN Courier, Cargus, DPD, GLS, Sameday, Posta Romana, FedEx) si tarife negociate de ei. Livreaza si la adresa, si in lockere sau puncte de ridicare."
      />
      <ShipoConfigClient businessId={business.id} initialConfig={config} activiDirect={activiDirect} />
    </div>
  );
}
